import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { SchematicsException } from '@angular-devkit/schematics';
import type { Rule, SchematicContext, Tree } from '@angular-devkit/schematics';
// Explicit file path: @angular-devkit/schematics has no exports map,
// so the bare /tasks subpath does not resolve from ESM.
import { NodePackageInstallTask } from '@angular-devkit/schematics/tasks/index.js';

import {
  transformAppConfig,
  transformServerConfig,
  transformServerEntry,
} from './transforms.js';

/**
 * Migrates a stock `ng new --ssr` application (application builder +
 * Express server entry) to Analog on the esbuild path. A plain Angular
 * schematic — no Nx devkit — so it runs in Angular CLI workspaces.
 * Steps it cannot apply safely are reported as manual instructions
 * instead of guessing at diverged files.
 */

interface Schema {
  project?: string;
  skipInstall?: boolean;
}

const APPLICATION_BUILDERS = [
  '@angular/build:application',
  '@angular-devkit/build-angular:application',
];
const DEV_SERVER_BUILDERS = [
  '@angular/build:dev-server',
  '@angular-devkit/build-angular:dev-server',
];

function readJson(tree: Tree, path: string): any {
  const content = tree.read(path);
  if (!content) {
    return undefined;
  }
  try {
    return JSON.parse(content.toString());
  } catch {
    throw new SchematicsException(`Could not parse ${path} as JSON.`);
  }
}

function writeJson(tree: Tree, path: string, value: unknown): void {
  tree.overwrite(path, JSON.stringify(value, null, 2) + '\n');
}

function sortKeys(record: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record).sort(([a], [b]) => a.localeCompare(b)),
  );
}

function ownVersion(): string {
  try {
    const packageJson = JSON.parse(
      readFileSync(
        new URL('../../../../../package.json', import.meta.url),
        'utf8',
      ),
    );
    return packageJson.version ?? 'latest';
  } catch {
    return 'latest';
  }
}

function editSource(
  tree: Tree,
  context: SchematicContext,
  path: string,
  transform: (code: string) => string | null,
  manualHint: string,
): void {
  const content = tree.read(path);
  if (!content) {
    context.logger.warn(`${path} not found — ${manualHint}`);
    return;
  }
  const result = transform(content.toString());
  if (result === null) {
    context.logger.warn(`${path}: expected pattern not found — ${manualHint}`);
    return;
  }
  if (result !== content.toString()) {
    tree.overwrite(path, result);
  }
}

export default function migrateAngularSsr(options: Schema = {}): Rule {
  return (tree: Tree, context: SchematicContext) => {
    const workspace = readJson(tree, '/angular.json');
    if (!workspace) {
      throw new SchematicsException(
        'angular.json not found. For Nx workspaces, swap the build/serve ' +
          'builders to @analogjs/platform:application / :dev-server in ' +
          'project.json and follow the migration guide manually.',
      );
    }

    const projects = workspace.projects ?? {};
    const projectName =
      options.project ??
      Object.keys(projects).filter(
        (name) => projects[name].projectType === 'application',
      )[0];
    const project = projects[projectName];
    if (!project) {
      throw new SchematicsException(
        options.project
          ? `Project "${options.project}" not found in angular.json.`
          : 'No application project found in angular.json.',
      );
    }

    const targets = project.architect ?? project.targets ?? {};
    const build = targets['build'];
    if (!build) {
      throw new SchematicsException(
        `Project "${projectName}" has no build target.`,
      );
    }
    const buildOptions = build.options ?? {};
    if (!buildOptions.server || !buildOptions.ssr) {
      throw new SchematicsException(
        `Project "${projectName}" is not set up for SSR (no server/ssr ` +
          'build options). Run `ng add @angular/ssr --server-routing` ' +
          'first, then re-run this schematic.',
      );
    }
    if (APPLICATION_BUILDERS.includes(build.builder)) {
      build.builder = '@analogjs/platform:application';
    } else if (build.builder !== '@analogjs/platform:application') {
      throw new SchematicsException(
        `Unsupported build builder "${build.builder}" — only the esbuild ` +
          'application builder can be migrated.',
      );
    }
    const serve = targets['serve'];
    if (serve && DEV_SERVER_BUILDERS.includes(serve.builder)) {
      serve.builder = '@analogjs/platform:dev-server';
    } else if (serve && serve.builder !== '@analogjs/platform:dev-server') {
      context.logger.warn(
        `serve target uses "${serve.builder}" — point it at ` +
          '@analogjs/platform:dev-server manually.',
      );
    }
    writeJson(tree, '/angular.json', workspace);

    const root = project.root ?? '';
    const sourceRoot = project.sourceRoot ?? posix.join(root, 'src');

    editSource(
      tree,
      context,
      '/' + posix.join(sourceRoot, 'app/app.config.ts'),
      transformAppConfig,
      'replace provideRouter(routes) with provideFileRouter(withExtraRoutes(routes)) from @analogjs/router.',
    );

    editSource(
      tree,
      context,
      '/' + posix.join(sourceRoot, 'app/app.config.server.ts'),
      transformServerConfig,
      'replace provideServerRendering with provideAnalogServerRendering from @analogjs/router/ssr.',
    );

    const ssrEntry =
      typeof buildOptions.ssr === 'string'
        ? buildOptions.ssr
        : buildOptions.ssr?.entry;
    if (ssrEntry) {
      const configImport = posix.relative(
        posix.dirname(ssrEntry),
        posix.join(sourceRoot, 'app/app.config.server'),
      );
      editSource(
        tree,
        context,
        '/' + ssrEntry,
        (code) =>
          transformServerEntry(
            code,
            configImport.startsWith('.') ? configImport : `./${configImport}`,
          ),
        'mount app.use(createAnalogRequestHandler({ config })) before express.static.',
      );
    } else {
      context.logger.warn(
        'No ssr.entry configured — mount createAnalogRequestHandler in your server entry manually.',
      );
    }

    if (buildOptions.tsConfig && tree.exists('/' + buildOptions.tsConfig)) {
      try {
        const tsconfig = readJson(tree, '/' + buildOptions.tsConfig);
        const sourceRel =
          posix.relative(posix.dirname(buildOptions.tsConfig), sourceRoot) ||
          '.';
        const include: string[] = tsconfig.include ?? [];
        for (const entry of [
          `${sourceRel}/app/pages/**/*.page.ts`,
          `${sourceRel}/app/pages/**/*.server.ts`,
          `${sourceRel}/server/**/*.ts`,
        ]) {
          if (!include.includes(entry)) {
            include.push(entry);
          }
        }
        tsconfig.include = include;
        writeJson(tree, '/' + buildOptions.tsConfig, tsconfig);
      } catch {
        context.logger.warn(
          `${buildOptions.tsConfig}: could not update — add the pages/server ` +
            'globs to "include" manually.',
        );
      }
    }

    const packageJson = readJson(tree, '/package.json');
    if (packageJson) {
      const version = ownVersion();
      const range = version === 'latest' ? 'latest' : `^${version}`;
      packageJson.dependencies = sortKeys({
        '@analogjs/router': range,
        h3: '^1.13.0',
        radix3: '^1.1.2',
        ...packageJson.dependencies,
      });
      packageJson.devDependencies = sortKeys({
        '@analogjs/platform': range,
        ...packageJson.devDependencies,
      });
      writeJson(tree, '/package.json', packageJson);
      if (!options.skipInstall) {
        context.addTask(new NodePackageInstallTask());
      }
    }

    context.logger.info(
      'Migrated to Analog on the application builder. Pages go in ' +
        `${sourceRoot}/app/pages, API routes in ${sourceRoot}/server/routes; ` +
        'existing routes keep working through withExtraRoutes. For markdown ' +
        'content, add @analogjs/content and provideContent(withMarkdownRenderer()).',
    );
  };
}

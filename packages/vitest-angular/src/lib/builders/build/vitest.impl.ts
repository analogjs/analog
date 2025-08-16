import { createBuilder } from '@angular-devkit/architect';
import * as path from 'path';
import type { Vitest } from 'vitest/node';
import type { Plugin, UserConfig } from 'vite';
import type { UserConfig as VitestConfig } from 'vitest/node';
import { globSync } from 'tinyglobby';

import { VitestSchema } from './schema';
import { createAngularMemoryPlugin } from './plugins/angular-memory-plugin';
import { esbuildDownlevelPlugin } from './plugins/esbuild-downlevel-plugin';
import { getBuildApplicationFunction } from './devkit';

export enum ResultKind {
  Failure,
  Full,
  Incremental,
  ComponentUpdate,
}

process.env['VITE_CJS_IGNORE_WARNING'] = 'true';

async function* vitestApplicationBuilder(
  options: VitestSchema,
  context: any,
): AsyncIterable<{ success: boolean }> {
  process.env['TEST'] = 'true';
  process.env['VITEST'] = 'true';

  const { buildApplicationInternal, angularVersion } =
    await getBuildApplicationFunction();
  const { startVitest } = await (Function(
    'return import("vitest/node")',
  )() as Promise<typeof import('vitest/node')>);

  const projectConfig = await context.getProjectMetadata(context.target);
  const extraArgs = await getExtraArgs(options);
  const workspaceRoot = context.workspaceRoot;
  const projectRoot = projectConfig['root'];
  const setupFile = path.relative(projectRoot, options.setupFile);

  const config: VitestConfig = {
    root: `${projectRoot || '.'}`,
    watch: options.watch === true,
    config: options.configFile,
    setupFiles: [setupFile],
    globals: true,
    pool: 'vmThreads',
    reporters: ['default'],
    environment: 'jsdom',
    exclude: options?.exclude || [],
    ...extraArgs,
  };

  const includes: string[] = findIncludes({
    workspaceRoot,
    projectRoot,
    include: options.include,
    exclude: options.exclude || [],
  });

  const testFiles = [
    path.relative(workspaceRoot, options.setupFile),
    ...includes.map((inc) => path.relative(workspaceRoot, inc)),
  ];

  const entryPoints = generateEntryPoints({
    projectRoot: projectRoot,
    testFiles,
    context,
    angularVersion,
  });

  const outputFiles = new Map();

  const viteConfig: UserConfig = {
    plugins: [
      (await createAngularMemoryPlugin({
        angularVersion,
        workspaceRoot,
        outputFiles,
      })) as Plugin,
      await esbuildDownlevelPlugin(),
    ],
  };

  let server: Vitest | undefined;
  for await (const buildOutput of buildApplicationInternal(
    {
      aot: false,
      index: false,
      progress: false,
      prerender: false,
      optimization: false,
      outputPath: `.angular/.vitest/${projectConfig['name']}`,
      outExtension: 'mjs',
      outputHashing: 2, // None
      tsConfig: path.relative(workspaceRoot, options.tsConfig),
      watch: options.watch === true,
      entryPoints,
      allowedCommonJsDependencies: ['@analogjs/vitest-angular/setup-zone'],
      sourceMap: {
        scripts: true,
        styles: false,
        vendor: false,
      },
    },
    context,
  )) {
    if (buildOutput.kind === ResultKind.Failure) {
      return { success: false };
    } else if (
      buildOutput.kind === ResultKind.Incremental ||
      buildOutput.kind === ResultKind.Full
    ) {
      if (buildOutput.kind === ResultKind.Full) {
        outputFiles.clear();
        Object.keys(buildOutput.files).forEach((key) => {
          outputFiles.set(key, buildOutput.files[key]);
        });
      } else {
        Object.keys(buildOutput.files).forEach((key) => {
          outputFiles.set(key, buildOutput.files[key]);
        });
      }
    }

    if (options.watch) {
      if (!server) {
        server = await startVitest('test', [], config, viteConfig);
      } else {
        await server.start([]);
      }

      yield { success: true };
    } else {
      server = await startVitest('test', [], config, viteConfig);

      const success = server?.state.getCountOfFailedTests() === 0;

      yield { success };
    }
  }

  yield { success: true };
}

export async function getExtraArgs(
  options: VitestSchema,
): Promise<Record<string, any>> {
  // support passing extra args to Vitest CLI
  const schema = await import('./schema.json');
  const extraArgs: Record<string, any> = {};
  for (const key of Object.keys(options)) {
    if (!(schema as any).properties[key]) {
      extraArgs[key] = (options as any)[key];
    }
  }

  return extraArgs;
}

/**
 * Finds test files to include in the Vitest run using tinyglobby pattern matching.
 *
 * This function:
 * 1. Normalizes the project root path to ensure consistent path separators
 * 2. Constructs glob patterns by prepending the project root to each include pattern
 * 3. Uses globSync from tinyglobby to find all files matching the patterns while respecting exclusions
 *
 * @param options Configuration object containing workspace and project paths, include/exclude patterns
 * @returns Array of absolute file paths that match the include patterns
 *
 * Sample output paths:
 * - /workspace/apps/my-app/src/app/app.component.spec.ts
 * - /workspace/apps/my-app/src/app/services/data.service.spec.ts
 * - /workspace/apps/my-app/src/app/components/header/header.component.test.ts
 * - /workspace/apps/my-app/src/app/utils/helpers.spec.ts
 *
 * tinyglobby vs fast-glob comparison:
 * - Both support the same glob patterns and ignore functionality
 * - Both are fast and efficient for file matching
 * - tinyglobby is a lighter alternative with similar API
 * - tinyglobby's globSync returns absolute paths by default when absolute: true is set
 * - tinyglobby has fewer dependencies and smaller bundle size
 *
 * globSync options explained:
 * - dot: true - Includes files/directories that start with a dot (e.g., .env.test)
 * - absolute: true - Returns absolute file paths instead of relative paths
 * - ignore: options.exclude - Excludes files matching the exclude patterns
 */
function findIncludes(options: {
  workspaceRoot: string;
  projectRoot: string;
  include: string[];
  exclude: string[];
}) {
  const { normalizePath } = require('vite');

  // Normalize project root path to ensure consistent path separators across platforms
  const projectRoot = normalizePath(
    path.resolve(options.workspaceRoot, options.projectRoot),
  );

  // Construct glob patterns by prepending project root to each include pattern
  // Example: if include=['**/*.spec.ts'] and projectRoot='/workspace/apps/my-app'
  // Result: ['/workspace/apps/my-app/**/*.spec.ts']
  const globs = [...options.include.map((glob) => `${projectRoot}/${glob}`)];

  // Use globSync from tinyglobby to find all files matching the patterns
  // Returns absolute file paths that match the include patterns while respecting exclusions
  return globSync(globs, {
    dot: true, // Include files/directories starting with dot (e.g., .env.test)
    absolute: true, // Return absolute file paths
    ignore: options.exclude, // Exclude files matching these patterns
  });
}

function generateEntryPoints({
  projectRoot,
  testFiles,
  context,
  angularVersion,
}: {
  projectRoot: string;
  testFiles: string[];
  context: any;
  angularVersion: number;
}) {
  if (angularVersion < 19) {
    return testFiles;
  }

  const seen = new Set();

  return new Map(
    Array.from(testFiles, (testFile) => {
      const relativePath = path
        .relative(
          testFile.startsWith(projectRoot)
            ? projectRoot
            : context.workspaceRoot,
          testFile,
        )
        .replace(/^[./]+/, '_')
        .replace(/\//g, '-');

      let uniqueName = `spec-${path.basename(
        relativePath,
        path.extname(relativePath),
      )}`;
      let suffix = 2;
      while (seen.has(uniqueName)) {
        uniqueName = `${relativePath}-${suffix}`;
        ++suffix;
      }
      seen.add(uniqueName);

      return [uniqueName, testFile];
    }),
  );
}

export default createBuilder(vitestApplicationBuilder) as unknown;

import { createBuilder } from '@angular-devkit/architect';
import * as path from 'path';
import type { Vitest, UserConfig as VitestConfig } from 'vitest/node';
import type { Plugin } from 'vite';

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
  context: any
): AsyncIterable<{ success: boolean }> {
  process.env['TEST'] = 'true';
  process.env['VITEST'] = 'true';

  const { buildApplicationInternal, angularVersion } =
    await getBuildApplicationFunction();
  const { startVitest } = await (Function(
    'return import("vitest/node")'
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

  const viteConfig: any = {
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
      tsConfig: path.relative(workspaceRoot, options.tsConfig),
      watch: options.watch === true,
      entryPoints,
      allowedCommonJsDependencies: ['@analogjs/vitest-angular/setup-zone'],
    },
    context
  )) {
    if (buildOutput.kind === ResultKind.Failure) {
      yield { success: false };
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
      const vitestServer = await startVitest('test', [], config, viteConfig);
      server = vitestServer;

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
  options: VitestSchema
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

function findIncludes(options: {
  workspaceRoot: string;
  projectRoot: string;
  include: string[];
  exclude: string[];
}) {
  const fg = require('fast-glob');
  const { normalizePath } = require('vite');

  const projectRoot = normalizePath(
    path.resolve(options.workspaceRoot, options.projectRoot)
  );
  const globs = [...options.include.map((glob) => `${projectRoot}/${glob}`)];

  return fg.sync(globs, {
    dot: true,
    ignore: options.exclude,
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
          testFile
        )
        .replace(/^[./]+/, '_')
        .replace(/\//g, '-');

      let uniqueName = `spec-${path.basename(
        relativePath,
        path.extname(relativePath)
      )}`;
      let suffix = 2;
      while (seen.has(uniqueName)) {
        uniqueName = `${relativePath}-${suffix}`;
        ++suffix;
      }
      seen.add(uniqueName);

      return [uniqueName, testFile];
    })
  );
}

export default createBuilder(vitestApplicationBuilder) as unknown;

import { BuilderOutput, createBuilder } from '@angular-devkit/architect';
// @ts-ignore
import { buildApplicationInternal } from '@angular/build/private';
import * as path from 'path';
import { normalizePath, UserConfig as ViteUserConfig } from 'vite';
import { Vitest, UserConfig } from 'vitest';

import { VitestSchema } from './schema';
import { createAngularMemoryPlugin } from './plugins/angular-memory-plugin';
import { esbuildDownlevelPlugin } from './plugins/esbuild-downlevel-plugin';

async function vitestBuilder(
  options: VitestSchema,
  context: any
): Promise<BuilderOutput> {
  process.env['TEST'] = 'true';
  process.env['VITEST'] = 'true';

  const { startVitest } = await (Function(
    'return import("vitest/node")'
  )() as Promise<typeof import('vitest/node')>);

  const projectConfig = await context.getProjectMetadata(context.target);
  const extraArgs = await getExtraArgs(options);
  const setupFile = path.relative(
    projectConfig['root'],
    options.setupFile || 'src/test-setup.ts'
  );

  const config: UserConfig = {
    root: `${projectConfig['root'] || '.'}`,
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
    projectRoot: projectConfig['root'],
    include: options.include || [],
  });
  const testFiles = [
    path.relative(
      context.workspaceRoot,
      options.setupFile || 'src/test-setup.ts'
    ),
    ...includes.map((inc) => path.relative(context.workspaceRoot, inc)),
  ];

  const entryPoints = generateEntryPoints({
    projectRoot: projectConfig['root'],
    testFiles,
    context,
  });

  const outputFiles = new Map();

  const viteConfig: ViteUserConfig = {
    plugins: [
      createAngularMemoryPlugin({
        workspaceRoot: context.workspaceRoot,
        outputFiles,
      }),
      esbuildDownlevelPlugin(),
    ],
  };

  let server: Vitest | undefined;
  for await (const result of buildApplicationInternal(
    {
      aot: false,
      index: false,
      progress: false,
      prerender: false,
      optimization: false,
      outputPath: `dist/libs/${projectConfig['name']}`,
      tsConfig: options.tsConfig,
      watch: options.watch === true,
      entryPoints,
      allowedCommonJsDependencies: ['@analogjs/vitest-angular/setup-zone'],
    },
    context
  )) {
    if (result.kind === 1) {
      Object.keys(result.files).forEach((key) => {
        outputFiles.set(key, result.files[key]);
      });
    }

    if (options.watch) {
      const vitestServer = await startVitest('test', [], config, viteConfig);
      server = vitestServer;
    } else {
      server = await startVitest('test', [], config, viteConfig);

      const success = server?.state.getCountOfFailedTests() === 0;

      return {
        success,
      };
    }
  }

  return {
    success: true,
  };
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

function findIncludes(options: { projectRoot: string; include: string[] }) {
  const fg = require('fast-glob');

  const projectRoot = normalizePath(path.resolve(options.projectRoot));
  const globs = [...options.include.map((glob) => `${projectRoot}/${glob}`)];

  return fg.sync(globs, {
    dot: true,
  });
}

function generateEntryPoints({
  projectRoot,
  testFiles,
  context,
}: {
  projectRoot: string;
  testFiles: string[];
  context: any;
}) {
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

export default createBuilder(vitestBuilder) as any;

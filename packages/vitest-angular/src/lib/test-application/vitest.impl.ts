import { BuilderOutput, createBuilder } from '@angular-devkit/architect';
// @ts-ignore
import { buildApplicationInternal } from '@angular/build/private';
import * as path from 'path';
import { UserConfig } from 'vitest';

import { getOutputFiles } from '../../../utils';

import { VitestSchema } from './schema';
import { normalizePath } from 'vite';

const outputFiles = getOutputFiles();

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
    reporters: ['default'],
    environment: 'jsdom',
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

  const seen = new Set();
  for await (const result of buildApplicationInternal(
    {
      aot: false,
      index: false,
      progress: false,
      prerender: false,
      outputPath: 'dist/libs/card',
      tsConfig: options.tsConfig,
      watch: false,
      entryPoints: new Map(
        Array.from(testFiles, (testFile) => {
          const relativePath = path
            .relative(
              testFile.startsWith(projectConfig['root'])
                ? projectConfig['root']
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
      ),
      allowedCommonJsDependencies: ['@analogjs/vitest-angular/setup-zone'],
    },
    context
  )) {
    if (result.kind === 1) {
      Object.keys(result.files).forEach((key) => {
        outputFiles.set(key, result.files[key]);
      });
    }
  }

  const server = await startVitest('test', testFiles, config);

  let hasErrors = false;

  const processExit = () => {
    // server?.exit();
    if (hasErrors) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  };

  if (options.watch) {
    process.on('SIGINT', processExit);
    process.on('SIGTERM', processExit);
    process.on('exit', processExit);
  }

  // vitest sets the exitCode = 1 when code coverage isn't met
  hasErrors = (process.exitCode && process.exitCode !== 0) as boolean;

  return {
    success: !hasErrors,
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

export default createBuilder(vitestBuilder) as any;

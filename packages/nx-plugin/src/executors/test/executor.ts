import { ExecutorContext } from '@nx/devkit';
import { buildApplicationInternal } from '@angular-devkit/build-angular/src/builders/application';
import { ApplicationBuilderInternalOptions } from '@angular-devkit/build-angular/src/builders/application/options';
import type { BuildOutputFile } from '@angular-devkit/build-angular/src/tools/esbuild/bundler-context';
import { createBuilderContext } from 'nx/src/adapter/ngcli-adapter';

import { Options as FastGlobOptions } from 'fast-glob';
import { normalizePath, UserConfig } from 'vite';
import { basename, dirname, join, relative } from 'node:path';
import { type Vitest } from 'vitest/node';

import { TestSchema } from './schema';

export default async function* runExecutor(
  options: TestSchema,
  context: ExecutorContext
) {
  const builderContext = await createBuilderContext(
    {
      builderName: '@angular-devkit/build-application:application',
      description: 'Test an application',
      optionSchema: await import(
        '@angular-devkit/build-angular/src/builders/application/schema.json'
      ),
    },
    context
  );

  const projectRoot =
    context.projectsConfigurations.projects[context.projectName].root;
  const virtualProjectRoot = normalizePath(
    join(builderContext.workspaceRoot, `.analog/vite-root`, projectRoot)
  );
  const { startVitest } = await (Function(
    'return import("vitest/node")'
  )() as Promise<typeof import('vitest/node')>);
  const testFiles = await getTestFiles(projectRoot, options);
  const outputFiles = new Map<string, BuildOutputFile>();

  const testConfig: ApplicationBuilderInternalOptions = {
    aot: false,
    entryPoints: new Set([...testFiles, join(projectRoot, options.setupFile)]),
    index: false,
    outputPath: `dist/${projectRoot}/.analog/vitest`,
    tsConfig: options.tsConfig,
    progress: true,
    watch: options.watch,
    optimization: false,
    sourceMap: {
      scripts: true,
      styles: false,
      vendor: false,
    },
    allowedCommonJsDependencies: ['@analogjs/vite-plugin-angular/setup-vitest'],
  };

  let server: Vitest;
  // Add cleanup logic via a builder teardown.
  let deferred: () => void;
  builderContext.addTeardown(async () => {
    await server?.close();
    deferred?.();
  });

  for await (const result of buildApplicationInternal(
    testConfig,
    builderContext,
    { write: false }
  )) {
    if (result.success && Array.isArray(result.outputFiles)) {
      for (const file of result.outputFiles) {
        const ofile = join(virtualProjectRoot, file.path);
        outputFiles.set(ofile, file);
      }
    }

    if (server) {
      server.server.moduleGraph.invalidateAll();
      server.start();
    } else {
      const config: UserConfig = getViteConfig(
        projectRoot,
        virtualProjectRoot,
        outputFiles,
        options
      );

      if (options.watch) {
        startVitest('test', [], undefined, config).then(
          (vitest) => (server = vitest)
        );
      } else {
        const server = await startVitest('test', [], undefined, config);

        const success = server.state.getCountOfFailedTests() === 0;

        yield {
          success,
        };

        return;
      }

      yield {
        success: true,
      };
    }
  }
}

function getViteConfig(
  projectRoot: string,
  virtualProjectRoot: string,
  outputFiles: Map<string, BuildOutputFile>,
  options: TestSchema
) {
  const config: UserConfig = {
    root: projectRoot,
    plugins: [
      {
        name: 'angular',
        enforce: 'pre',
        async resolveId(source, importer) {
          if (
            importer &&
            source[0] === '.' &&
            importer.startsWith(virtualProjectRoot)
          ) {
            // Remove query if present
            const [importerFile] = importer.split('?', 1);

            source =
              '/' +
              normalizePath(
                join(
                  dirname(relative(virtualProjectRoot, importerFile)),
                  source
                )
              );
          }

          const [file] = source.split('?', 1);
          if (outputFiles.has(join(virtualProjectRoot, file))) {
            return join(virtualProjectRoot, source);
          }

          if (file.endsWith('spec.ts') || file.endsWith(options.setupFile)) {
            const page = file.split('/').pop()?.replace('.ts', '.js') as string;
            if (outputFiles.has(join(virtualProjectRoot, page))) {
              return join(virtualProjectRoot, page);
            }
          }

          return undefined;
        },
        load(id) {
          let [file] = id.split('?', 1);
          file = file.replace('.ts', '.js');
          let relativeFile = file;

          if (
            basename(file).endsWith(
              basename(options.setupFile.replace('.ts', '.js'))
            )
          ) {
            relativeFile = join(
              virtualProjectRoot,
              basename(options.setupFile.replace('.ts', '.js'))
            );
          }

          const codeContents = outputFiles.get(relativeFile)?.contents;
          if (codeContents === undefined) {
            return;
          }

          const code = Buffer.from(codeContents).toString('utf-8');
          const mapContents = outputFiles.get(relativeFile + '.map')?.contents;

          return {
            // Remove source map URL comments from the code if a sourcemap is present.
            // Vite will inline and add an additional sourcemap URL for the sourcemap.
            code: mapContents
              ? code.replace(/^\/\/# sourceMappingURL=[^\r\n]*/gm, '')
              : code,
            map: mapContents && Buffer.from(mapContents).toString('utf-8'),
          };
        },
      },
    ],
    test: {
      root: projectRoot,
      globals: options.globals,
      environment: options.environment,
      setupFiles: [options.setupFile],
      include: options.include,
      watch: options.watch,
    },
  };

  return config;
}

async function getTestFiles(projectRoot: string, options: TestSchema) {
  const fg = require('fast-glob');

  const fgOptions: FastGlobOptions = {
    cwd: projectRoot,
    ignore: ['node_modules/**'].concat(options.exclude),
  };
  const included = await Promise.all(
    options.include.map((pattern) => fg(pattern, fgOptions) as string[])
  );

  const testFiles = Array.from(new Set([...included.flat()])).map((file) =>
    join(projectRoot, file)
  );
  return testFiles;
}

import { ExecutorContext } from '@nx/devkit';
import { buildApplicationInternal } from '@angular-devkit/build-angular/src/builders/application';
import { ApplicationBuilderInternalOptions } from '@angular-devkit/build-angular/src/builders/application/options';
import type { BuildOutputFile } from '@angular-devkit/build-angular/src/tools/esbuild/bundler-context';
import { createBuilderContext } from 'nx/src/adapter/ngcli-adapter';

import { Options as FastGlobOptions } from 'fast-glob';
import { normalizePath, InlineConfig } from 'vite';
import { dirname, join, relative } from 'node:path';
import type { Vitest } from 'vitest/node';

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

  let server: Vitest;
  let virtualProjectRoot = normalizePath(
    join(builderContext.workspaceRoot, `.analog/vite-root`, 'analog-app')
  );
  const { startVitest } = await (Function(
    'return import("vitest/node")'
  )() as Promise<typeof import('vitest/node')>);
  const fg = require('fast-glob');
  const projectRoot =
    context.projectsConfigurations.projects[context.projectName].root;
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
  const outputFiles = new Map<string, BuildOutputFile>();
  const buildConfig: ApplicationBuilderInternalOptions = {
    aot: false,
    entryPoints: new Set([...testFiles, join(projectRoot, options.setupFile)]),
    index: false,
    outputPath: '',
    tsConfig: options.tsConfig,
    progress: false,
    watch: options.watch,
    optimization: false,
    sourceMap: {
      scripts: true,
      styles: false,
      vendor: false,
    },
    allowedCommonJsDependencies: ['@analogjs/vite-plugin-angular/setup-vitest'],
  };

  // Add cleanup logic via a builder teardown.
  let deferred: () => void;
  builderContext.addTeardown(async () => {
    await server?.close();
    deferred?.();
  });

  for await (const result of buildApplicationInternal(
    buildConfig,
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
      const config: InlineConfig = {
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

              if (file.endsWith('spec.ts')) {
                const page = file
                  .split('/')
                  .pop()
                  ?.replace('.spec.ts', '.spec.js') as string;
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
              if (file.endsWith('test-setup.js')) {
                relativeFile = join(virtualProjectRoot, '/test-setup.js');
              }

              const codeContents = outputFiles.get(relativeFile)?.contents;
              if (codeContents === undefined) {
                // console.log('no contents', relativeFile);
                return;
              }

              const code = Buffer.from(codeContents).toString('utf-8');
              const mapContents = outputFiles.get(
                relativeFile + '.map'
              )?.contents;

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
          globals: options.globals,
          environment: options.environment,
          setupFiles: [options.setupFile],
          include: options.include,
        },
      };

      server = await startVitest('test', [], undefined, config);

      yield {
        success: true,
      } as unknown;
    }
  }
}

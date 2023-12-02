import { ExecutorContext } from '@nx/devkit';
import { DevServerBuilderOutput } from '@angular-devkit/build-angular';
import { createBuilderContext } from 'nx/src/adapter/ngcli-adapter';
import { normalizePath, ViteDevServer, InlineConfig } from 'vite';

import { buildApplicationInternal } from '@angular-devkit/build-angular/src/builders/application';
import { ApplicationBuilderInternalOptions } from '@angular-devkit/build-angular/src/builders/application/options';
import { InlineStyleLanguage } from '@angular-devkit/build-angular/src/builders/application/schema';
import { BuildOutputFile } from '@angular-devkit/build-angular/src/tools/esbuild/bundler-context';
import { AddressInfo } from 'node:net';
import { dirname, join, relative, resolve } from 'node:path';

import { PageRoutesGlob } from '../../plugins/routes-plugin';
import { DevServerExecutorSchema } from './schema';

export default async function* runExecutor(
  options: DevServerExecutorSchema,
  context: ExecutorContext
) {
  // console.log('Executor ran for DevServer', context.root);

  const builderContext = await createBuilderContext(
    {
      builderName: '@analogjs/platform:dev-server',
      description: 'Build a browser application',
      optionSchema: await import(
        '@angular-devkit/build-angular/src/builders/dev-server/schema.json'
      ),
    },
    context
  );
  let listeningAddress: AddressInfo | undefined;
  let server: ViteDevServer;
  const rootDir = normalizePath(
    context.projectsConfigurations.projects[context.projectName].root
  );
  const virtualProjectRoot = normalizePath(
    join(builderContext.workspaceRoot, `.analog/vite-root`, rootDir)
  );
  const { createServer } = await import('vite');

  const outputFiles = new Map<string, BuildOutputFile>();
  const buildConfig: ApplicationBuilderInternalOptions = {
    aot: true,
    entryPoints: new Set([
      `${rootDir}/src/main.ts`,
      `${rootDir}/src/main.server.ts`,
    ]),
    index: false,
    outputPath: `dist/${rootDir}/client`,
    tsConfig: `${rootDir}/tsconfig.app.json`,
    progress: true,
    watch: true,
    optimization: false,
    inlineStyleLanguage: InlineStyleLanguage.Scss,
    sourceMap: {
      scripts: true,
      styles: true,
    },
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
    { write: false },
    [
      PageRoutesGlob({
        projectRoot: rootDir,
        pageGlobs: [`${rootDir}/src/app/pages/**/*.page.ts`],
      }),
    ]
  )) {
    console.log('result', result.success);
    if (result.success && Array.isArray(result.outputFiles)) {
      for (const file of result.outputFiles) {
        const ofile = join(virtualProjectRoot, file.path);
        // console.log(ofile);
        outputFiles.set(ofile, file);
      }
    }
    if (server) {
      server.moduleGraph.invalidateAll();
      server.ws.send({
        type: 'full-reload',
        path: '*',
      });
    } else {
      const config: InlineConfig = {
        server: {
          port: 3000,
          hmr: true,
        },
        root: rootDir,
        plugins: [
          {
            name: 'angular',
            enforce: 'pre',
            transformIndexHtml(html) {
              return html.replace('/src/main.ts', 'main.js');
            },
            async resolveId(source, importer) {
              if (source === '/src/main.ts') {
                return join(virtualProjectRoot, 'main.js');
              }

              if (source === 'src/main.server.ts') {
                return join(virtualProjectRoot, 'main.server.js');
              }

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

              return undefined;
            },
            load(id) {
              let [file] = id.split('?', 1);
              file = file.replace('.ts', '.js');
              let relativeFile = file;

              if (file === '/main.js') {
                relativeFile = join(virtualProjectRoot, '/main.js');
              }

              if (file === 'src/main.server.js') {
                relativeFile = join(virtualProjectRoot, '/main.server.js');
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
      };

      server = await createServer(config);

      await server.listen();
      listeningAddress = server.httpServer?.address() as AddressInfo;

      // log connection information
      server.printUrls();

      yield {
        success: true,
        port: listeningAddress?.port,
      } as unknown as DevServerBuilderOutput;
    }
  }
}

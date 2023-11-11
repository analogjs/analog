import { Plugin, UserConfig, normalizePath } from 'vite';
import { BuilderContext, Target } from '@angular-devkit/architect';
import { buildApplicationInternal } from '@angular-devkit/build-angular/src/builders/application';
import { InlineStyleLanguage } from '@angular-devkit/build-angular/src/builders/application/schema';
import { dirname, join, relative, resolve } from 'node:path';
import { BuildOutputFile } from '@angular-devkit/build-angular/src/tools/esbuild/bundler-context';

export function applicationPlugin(): Plugin {
  console.log('plugin ran');
  const outputFiles = new Map<string, BuildOutputFile>();
  let config: UserConfig;
  let virtualProjectRoot: string;
  return {
    name: '@analogjs/vite-plugin-angular-application',
    config(_config) {
      config = _config;
      virtualProjectRoot = normalizePath(
        join(process.cwd(), `.angular/vite-root`, 'analog-app')
      );
      console.log(virtualProjectRoot);
    },
    async buildStart() {
      console.log('Executor ran for DevServer');
      const builderContext: BuilderContext = {
        id: 0,
        builder: {
          builderName: 'browser-esbuild',
          description: 'Build a browser application',
          optionSchema: {},
        },
        target: {
          target: 'serve',
          project: 'analog-app',
          configuration: 'development',
        },
        logger: {
          warn: console.warn,
          error: console.error,
          log: console.log,
          debug: console.debug,
          info: console.info,
          fatal() {},
          createChild(name: string) {},
        } as any,
        workspaceRoot: process.cwd(),
        currentDirectory: '',
        scheduleTarget: (() => {
          console.log('scheduleTarget');
        }) as any,
        scheduleBuilder: (() => {
          console.log('scheduleBuilder');
        }) as any,
        getTargetOptions: (() => {}) as any,
        getProjectMetadata: () => {
          return Promise.resolve({
            metadata: {},
          });
        },
        getBuilderNameForTarget: function (target: Target): Promise<string> {
          // throw new Error("Function not impl/emented.");
          return Promise.resolve('');
        },
        validateOptions: function () {
          return Promise.resolve({}) as any;
        },
        reportRunning: function (): void {
          // throw new Error("Function not implemented.");
        },
        reportStatus: function (status: string): void {
          // throw new Error("Function not implemented.");
        },
        reportProgress: function (
          current: number,
          total?: number | undefined,
          status?: string | undefined
        ): void {
          // throw new Error("Function not implemented.");
        },
        addTeardown: function (teardown: () => void | Promise<void>): void {
          // throw new Error("Function not implemented.");
        },
      };

      const fg = require('fast-glob');
      const root = normalizePath(resolve(process.cwd(), 'apps/analog-app'));

      const endpointFiles: string[] = fg.sync(
        [`${root}/src/app/pages/**/*.page.ts`],
        { dot: true }
      );

      for await (const result of buildApplicationInternal(
        {
          aot: true,
          entryPoints: new Set([
            'apps/analog-app/src/main.ts',
            ...endpointFiles,
          ]),
          // browser: 'apps/analog-app/src/main.ts',
          index: false,
          // server: 'apps/analog-app/src/main.server.ts',
          outputPath: 'dist/apps/analog-app/client',
          tsConfig: 'apps/analog-app/tsconfig.app.json',
          progress: false,
          // watch: true,
          optimization: false,
          namedChunks: true,
          inlineStyleLanguage: InlineStyleLanguage.Scss,
        },
        builderContext as any,
        { write: false }
      )) {
        if (result.success && Array.isArray(result.outputFiles)) {
          for (const file of result.outputFiles) {
            console.log(file);
            outputFiles.set(join(virtualProjectRoot, file.path), file);
          }
        }
      }
    },
    enforce: 'pre',
    async resolveId(source, importer) {
      // console.log('resolve', source);
      // Prevent vite from resolving an explicit external dependency (`externalDependencies` option)
      // if (externalMetadata.explicit.includes(source)) {
      //   // This is still not ideal since Vite will still transform the import specifier to
      //   // `/@id/${source}` but is currently closer to a raw external than a resolved file path.
      //   // return source;
      // }

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
            join(dirname(relative(virtualProjectRoot, importerFile)), source)
          );
      }

      const [file] = source.split('?', 1);
      if (outputFiles.has(join(virtualProjectRoot, file))) {
        return join(virtualProjectRoot, source);
      }

      return undefined;
    },
    load(id) {
      const [file] = id.split('?', 1);
      const relativeFile =
        '/' +
        normalizePath(relative(virtualProjectRoot, file)).replaceAll('/..', '');
      const codeContents = outputFiles.get(
        file === '/main.js' ? join(virtualProjectRoot, '/main.js') : file
      )?.contents;
      if (codeContents === undefined) {
        //   if (relativeFile.endsWith('/node_modules/vite/dist/client/client.mjs')) {
        //     return loadViteClientCode(file);
        //   }

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
  };
}

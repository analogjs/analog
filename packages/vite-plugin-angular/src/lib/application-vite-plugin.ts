import { Plugin, UserConfig, normalizePath } from 'vite';
import { BuilderContext, Target } from '@angular-devkit/architect';
import { buildApplicationInternal } from '@angular-devkit/build-angular/src/builders/application';
import { InlineStyleLanguage } from '@angular-devkit/build-angular/src/builders/application/schema';
import { dirname, join, relative, resolve } from 'node:path';
import { BuildOutputFile } from '@angular-devkit/build-angular/src/tools/esbuild/bundler-context';

export function applicationPlugin(): Plugin {
  // console.log('plugin ran');
  const outputFiles = new Map<string, BuildOutputFile>();
  let config: UserConfig;
  let virtualProjectRoot: string;
  return {
    name: '@analogjs/vite-plugin-angular-application',
    config(_config) {
      config = _config;
      virtualProjectRoot = normalizePath(
        join(process.cwd(), `.analog/vite-root`, 'analog-app')
      );
    },
    async buildStart() {
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
          // throw new Error("Function not implemented.");
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

      // for await (const result of buildApplicationInternal(
      //   {
      //     aot: true,
      //     entryPoints: new Set([
      //       `${config.root}/src/main.ts`,
      //       `${config.root}/src/main.server.ts`,
      //       ...endpointFiles,
      //     ]),
      //     index: false,
      //     outputPath: config.build?.outDir as string,
      //     tsConfig: `${config.root}/tsconfig.app.json`,
      //     progress: false,
      //     optimization: false,
      //     namedChunks: true,
      //     inlineStyleLanguage: InlineStyleLanguage.Scss,
      //     sourceMap: {
      //       scripts: true,
      //       styles: true,
      //     },
      //   },
      //   builderContext as any,
      //   { write: false }
      // )) {
      //   if (result.success && Array.isArray(result.outputFiles)) {
      //     for (const file of result.outputFiles) {
      //       const ofile = join(virtualProjectRoot, file.path);
      //       outputFiles.set(ofile, file);
      //     }
      //   }
      // }
    },
    enforce: 'pre',
    transformIndexHtml(html, ctx) {
      // return html.replace('/src/main.ts', 'main.js');
    },
    async resolveId(source, importer) {
      if (source.includes('src')) {
        // console.log('s', source);
      }
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
            join(dirname(relative(virtualProjectRoot, importerFile)), source)
          );
      }

      const [file] = source.split('?', 1);
      if (outputFiles.has(join(virtualProjectRoot, file))) {
        return join(virtualProjectRoot, source);
      }

      if (file.endsWith('page.ts')) {
        const page = file
          .split('/')
          .pop()
          ?.replace('.page.ts', '.page.js') as string;
        if (outputFiles.has(join(virtualProjectRoot, page))) {
          return join(virtualProjectRoot, page);
        }
      }
      // console.log('source', source);
      return undefined;
    },
    load(id) {
      // console.log('load', id);
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
        console.log('no contents', relativeFile);
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

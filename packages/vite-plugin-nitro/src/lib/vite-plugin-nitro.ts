import { loadEsmModule } from '@angular-devkit/build-angular/src/utils/load-esm';
import { NitroConfig } from 'nitropack';
import { toNodeListener } from 'h3';
import { Plugin, UserConfig, ViteDevServer } from 'vite';
import { buildServer } from './build-server';
import { buildSSRApp } from './build-ssr';
import { normalizePath } from 'vite';
import { Options } from './options';
import * as path from 'path';

let clientOutputPath = '';

export function nitro(options?: Options, nitroOptions?: NitroConfig): Plugin {
  const workspaceRoot = process.cwd();
  const isTest = process.env['NODE_ENV'] === 'test' || !!process.env['VITEST'];
  const apiPrefix = `/${nitroOptions?.runtimeConfig?.['apiPrefix'] ?? 'api'}`;

  let isBuild = false;
  let isServe = false;
  let ssrBuild = false;
  let config: UserConfig;
  let nitroConfig: NitroConfig;

  return {
    name: 'analogjs-vite-nitro-plugin',
    async config(_config, { command }) {
      isServe = command === 'serve';
      isBuild = command === 'build';
      ssrBuild = _config.build?.ssr === true;
      config = _config;
      const rootDir = config.root || '.';

      nitroConfig = {
        rootDir,
        logLevel: nitroOptions?.logLevel || 0,
        srcDir: normalizePath(`${rootDir}/src`),
        scanDirs: [normalizePath(`${rootDir}/src/server`)],
        output: {
          dir: normalizePath(
            path.resolve(workspaceRoot, 'dist', rootDir, 'analog')
          ),
          publicDir: normalizePath(
            path.resolve(workspaceRoot, 'dist', rootDir, 'analog/public')
          ),
          ...nitroOptions?.output,
        },
        buildDir: normalizePath(
          path.resolve(workspaceRoot, 'dist', rootDir, '.nitro')
        ),
        typescript: {
          generateTsConfig: false,
        },
        runtimeConfig: { ...nitroOptions?.runtimeConfig },
      };

      if (!ssrBuild && !isTest) {
        // store the client output path for the SSR build config
        clientOutputPath = path.resolve(rootDir, config.build?.outDir!);
      }

      if (isBuild) {
        if (isEmptyPrerenderRoutes(options)) {
          nitroConfig.prerender = {};
          nitroConfig.prerender.routes = ['/'];
        }

        if (options?.prerender) {
          nitroConfig.prerender = nitroConfig.prerender ?? {};
          nitroConfig.prerender.crawlLinks = options?.prerender?.discover;

          const prerenderRoutes = options?.prerender?.routes;
          if (isArrayWithElements<string>(prerenderRoutes)) {
            nitroConfig.prerender.routes = prerenderRoutes;
          } else if (typeof prerenderRoutes === 'function') {
            nitroConfig.prerender.routes = await prerenderRoutes();
          }
        }

        if (ssrBuild) {
          nitroConfig = {
            ...nitroConfig,
            publicAssets: [{ dir: clientOutputPath }],
            serverAssets: [
              {
                baseName: 'public',
                dir: clientOutputPath,
              },
            ],
            externals: {
              inline: ['zone.js/node'],
              external: ['rxjs', 'node-fetch-native/dist/polyfill', 'destr'],
            },
            moduleSideEffects: ['zone.js/bundles/zone-node.umd.js'],
            renderer: normalizePath(`${__dirname}/runtime/renderer`),
            handlers: [
              {
                handler: normalizePath(`${__dirname}/runtime/api-middleware`),
                middleware: true,
              },
            ],
          };
        }
      }
      nitroConfig = {
        ...nitroConfig,
        ...nitroOptions,
      };
    },
    async configureServer(viteServer: ViteDevServer) {
      if (isServe && !isTest) {
        const { createNitro, createDevServer, build, prepare } =
          await loadEsmModule<typeof import('nitropack')>('nitropack');

        const nitro = await createNitro({
          dev: true,
          ...nitroConfig,
        });
        const server = createDevServer(nitro);
        await prepare(nitro);
        await build(nitro);
        viteServer.middlewares.use(apiPrefix, toNodeListener(server.app));
        console.log(
          `\n\nThe '@analogjs/platform' successfully started.\nThe server endpoints are accessible under the "${apiPrefix}" path.`
        );
      }
    },

    async closeBundle() {
      if (ssrBuild) {
        return;
      }

      if (isBuild) {
        if (options?.ssr) {
          console.log('Building SSR application...');
          await buildSSRApp(config, options);
        }

        console.log('Building Server...');
        await buildServer(options, nitroConfig);

        console.log(
          `\n\nThe '@analogjs/platform' server has been successfully built.`
        );
      }
    },
  };
}

function isEmptyPrerenderRoutes(options?: Options): boolean {
  if (!options || isArrayWithElements(options?.prerender?.routes)) {
    return false;
  }
  return !options.prerender?.routes;
}

function isArrayWithElements<T>(arr: unknown): arr is [T, ...T[]] {
  return !!(Array.isArray(arr) && arr.length);
}

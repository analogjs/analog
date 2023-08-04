import {
  NitroConfig,
  build,
  createDevServer,
  createNitro,
  prepare,
} from 'nitropack';
import { toNodeListener } from 'h3';
import { Plugin, UserConfig, ViteDevServer } from 'vite';
import { normalizePath } from 'vite';
import * as path from 'path';

import { buildServer } from './build-server.js';
import { buildSSRApp } from './build-ssr.js';
import { Options } from './options.js';
import { pageEndpointsPlugin } from './plugins/page-endpoints.js';
import { getPageHandlers } from './utils/get-page-handlers.js';
import { buildSitemap } from './build-sitemap.js';
import { devServerPlugin } from './plugins/dev-server-plugin.js';

let clientOutputPath = '';

const __dirname = path.dirname(new URL(import.meta.url).pathname);

export function nitro(options?: Options, nitroOptions?: NitroConfig): Plugin[] {
  const workspaceRoot = process.cwd();
  const isTest = process.env['NODE_ENV'] === 'test' || !!process.env['VITEST'];
  const apiPrefix = `/${nitroOptions?.runtimeConfig?.['apiPrefix'] ?? 'api'}`;

  let isBuild = false;
  let isServe = false;
  let ssrBuild = false;
  let config: UserConfig;
  let nitroConfig: NitroConfig;

  return [
    (options?.ssr
      ? devServerPlugin({ entryServer: options?.entryServer })
      : false) as Plugin,
    {
      name: '@analogjs/vite-nitro-plugin',
      async config(_config, { command }) {
        isServe = command === 'serve';
        isBuild = command === 'build';
        ssrBuild = _config.build?.ssr === true;
        config = _config;
        const rootDir = config.root || '.';
        const buildPreset =
          process.env['BUILD_PRESET'] ??
          (nitroOptions?.preset as string | undefined);

        const pageHandlers = getPageHandlers({ workspaceRoot, rootDir });

        nitroConfig = {
          rootDir,
          preset: buildPreset,
          logLevel: nitroOptions?.logLevel || 0,
          srcDir: normalizePath(`${rootDir}/src/server`),
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
          alias: {
            '#analog/index': normalizePath(
              path.resolve(workspaceRoot, 'dist', rootDir, 'client/index.html')
            ),
            '#analog/ssr': normalizePath(
              path.resolve(workspaceRoot, 'dist', rootDir, 'ssr/main.server.js')
            ),
          },
          runtimeConfig: { ...nitroOptions?.runtimeConfig },
          rollupConfig: {
            onwarn(warning) {
              if (
                warning.message.includes('empty chunk') &&
                warning.message.endsWith('.server')
              ) {
                return;
              }
            },
            plugins: [pageEndpointsPlugin()],
          },
          handlers: [
            {
              handler: normalizePath(`${__dirname}/runtime/api-middleware`),
              middleware: true,
            },
            ...pageHandlers,
          ],
        };

        if (isVercelPreset(buildPreset)) {
          nitroConfig = withVercelOutputAPI(nitroConfig, workspaceRoot);
        }

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
                ...pageHandlers,
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
          const nitro = await createNitro({
            dev: true,
            ...nitroConfig,
          });
          const server = createDevServer(nitro);
          await prepare(nitro);
          await build(nitro);
          viteServer.middlewares.use(apiPrefix, toNodeListener(server.app));

          console.log(
            `\n\nThe server endpoints are accessible under the "${apiPrefix}" path.`
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

          await buildServer(options, nitroConfig);

          if (options?.prerender?.sitemap) {
            console.log('Building Sitemap...');
            // sitemap needs to be built after all directories are built
            await buildSitemap(
              config,
              options.prerender.sitemap,
              options.prerender.routes!
            );
          }

          console.log(
            `\n\nThe '@analogjs/platform' server has been successfully built.`
          );
        }
      },
    },
  ];
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

const isVercelPreset = (buildPreset: string | undefined) =>
  process.env['VERCEL'] ||
  (buildPreset && buildPreset.toLowerCase().includes('vercel'));

const withVercelOutputAPI = (
  nitroConfig: NitroConfig | undefined,
  workspaceRoot: string
) => ({
  ...nitroConfig,
  output: {
    ...nitroConfig?.output,
    dir: normalizePath(path.resolve(workspaceRoot, '.vercel', 'output')),
    publicDir: normalizePath(
      path.resolve(workspaceRoot, '.vercel', 'output/static')
    ),
  },
});

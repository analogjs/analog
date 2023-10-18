import type { NitroConfig } from 'nitropack';
import { toNodeListener } from 'h3';
import type { Plugin, UserConfig } from 'vite';
import { normalizePath, ViteDevServer } from 'vite';
import * as path from 'path';

import { buildServer } from './build-server';
import { buildSSRApp } from './build-ssr';

import { Options } from './options';
import { pageEndpointsPlugin } from './plugins/page-endpoints';
import { getPageHandlers } from './utils/get-page-handlers';
import { buildSitemap } from './build-sitemap';
import { devServerPlugin } from './plugins/dev-server-plugin';
import { loadEsmModule } from './utils/load-esm';

let clientOutputPath = '';

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
          clientOutputPath = path.resolve(
            rootDir,
            config.build?.outDir || 'dist/client'
          );
        }

        nitroConfig.alias = {
          '#analog/ssr': normalizePath(
            path.resolve(workspaceRoot, 'dist', rootDir, 'ssr/main.server')
          ),
          '#analog/index': normalizePath(
            path.resolve(clientOutputPath, 'index.html')
          ),
          ...nitroOptions?.alias,
        };

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
                trace: false,
              },
              moduleSideEffects: ['zone.js/node'],
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
          const { createNitro, createDevServer, build } = await loadEsmModule<
            typeof import('nitropack')
          >('nitropack');

          const nitro = await createNitro({
            dev: true,
            ...nitroConfig,
          });
          const server = createDevServer(nitro);
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
              options.prerender.routes!,
              nitroConfig.output?.publicDir!
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

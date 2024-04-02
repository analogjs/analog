import { NitroConfig, build, createDevServer, createNitro } from 'nitropack';
import { App, toNodeListener } from 'h3';
import type { Plugin, UserConfig, ViteDevServer } from 'vite';
import { normalizePath } from 'vite';
import { dirname, join, relative, resolve } from 'node:path';
import { platform } from 'node:os';
import { fileURLToPath } from 'node:url';

import { buildServer } from './build-server.js';
import { buildSSRApp } from './build-ssr.js';
import {
  Options,
  PrerenderContentDir,
  PrerenderContentFile,
} from './options.js';
import { pageEndpointsPlugin } from './plugins/page-endpoints.js';
import { getPageHandlers } from './utils/get-page-handlers.js';
import { buildSitemap } from './build-sitemap.js';
import { devServerPlugin } from './plugins/dev-server-plugin.js';
import { getMatchingContentFilesWithFrontMatter } from './utils/get-content-files.js';

const isWindows = platform() === 'win32';
const filePrefix = isWindows ? 'file:///' : '';
let clientOutputPath = '';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function nitro(options?: Options, nitroOptions?: NitroConfig): Plugin[] {
  const workspaceRoot = options?.workspaceRoot ?? process.cwd();
  const isTest = process.env['NODE_ENV'] === 'test' || !!process.env['VITEST'];
  const apiPrefix = `/${nitroOptions?.runtimeConfig?.['apiPrefix'] ?? 'api'}`;

  let isBuild = false;
  let isServe = false;
  let ssrBuild = false;
  let config: UserConfig;
  let nitroConfig: NitroConfig;

  return [
    (options?.ssr
      ? devServerPlugin({
          entryServer: options?.entryServer,
          index: options?.index,
        })
      : false) as Plugin,
    {
      name: '@analogjs/vite-plugin-nitro',
      async config(_config, { command }) {
        isServe = command === 'serve';
        isBuild = command === 'build';
        ssrBuild = _config.build?.ssr === true;
        config = _config;
        const rootDir = relative(workspaceRoot, config.root || '.') || '.';
        const buildPreset =
          process.env['BUILD_PRESET'] ??
          (nitroOptions?.preset as string | undefined);

        const pageHandlers = getPageHandlers({ workspaceRoot, rootDir });

        const apiMiddlewareHandler =
          filePrefix +
          normalizePath(
            join(__dirname, `runtime/api-middleware${filePrefix ? '.mjs' : ''}`)
          );
        const ssrEntry = normalizePath(
          filePrefix +
            resolve(
              workspaceRoot,
              'dist',
              rootDir,
              `ssr/main.server${filePrefix ? '.js' : ''}`
            )
        );
        const rendererEntry =
          filePrefix +
          normalizePath(
            join(__dirname, `runtime/renderer${filePrefix ? '.mjs' : ''}`)
          );

        nitroConfig = {
          rootDir,
          preset: buildPreset,
          logLevel: nitroOptions?.logLevel || 0,
          srcDir: normalizePath(`${rootDir}/src/server`),
          scanDirs: [normalizePath(`${rootDir}/src/server`)],
          output: {
            dir: normalizePath(
              resolve(workspaceRoot, 'dist', rootDir, 'analog')
            ),
            publicDir: normalizePath(
              resolve(workspaceRoot, 'dist', rootDir, 'analog/public')
            ),
            ...nitroOptions?.output,
          },
          buildDir: normalizePath(
            resolve(workspaceRoot, 'dist', rootDir, '.nitro')
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
              handler: apiMiddlewareHandler,
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
          clientOutputPath = resolve(
            workspaceRoot,
            rootDir,
            config.build?.outDir || 'dist/client'
          );
        }

        const indexEntry = normalizePath(
          resolve(clientOutputPath, 'index.html')
        );

        nitroConfig.alias = {
          '#analog/ssr': ssrEntry,
          '#analog/index': indexEntry,
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

            let routes: (string | PrerenderContentDir | undefined)[] = [];

            const prerenderRoutes = options?.prerender?.routes;
            if (
              isArrayWithElements<string | PrerenderContentDir>(prerenderRoutes)
            ) {
              routes = prerenderRoutes;
            } else if (typeof prerenderRoutes === 'function') {
              routes = await prerenderRoutes();
            }

            nitroConfig.prerender.routes = routes.reduce<string[]>(
              (prev, current) => {
                if (!current) {
                  return prev;
                }
                if (typeof current === 'string') {
                  prev.push(current);
                  return prev;
                }
                const affectedFiles: PrerenderContentFile[] =
                  getMatchingContentFilesWithFrontMatter(
                    workspaceRoot,
                    rootDir,
                    current.contentDir
                  );

                affectedFiles.forEach((f) => {
                  const result = current.transform(f);
                  if (result) {
                    prev.push(result);
                  }
                });

                return prev;
              },
              []
            );
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
                ...nitroOptions?.externals,
                external: [
                  'rxjs',
                  'node-fetch-native/dist/polyfill',
                  ...(nitroOptions?.externals?.external || []),
                ],
              },
              moduleSideEffects: [
                'zone.js/node',
                'zone.js/fesm2015/zone-node',
                ...(nitroOptions?.moduleSideEffects || []),
              ],
              renderer: rendererEntry,
              handlers: [
                {
                  handler: apiMiddlewareHandler,
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
          await build(nitro);
          viteServer.middlewares.use(
            apiPrefix,
            toNodeListener(server.app as unknown as App)
          );

          viteServer.httpServer?.once('listening', () => {
            process.env['ANALOG_HOST'] = !viteServer.config.server.host
              ? 'localhost'
              : (viteServer.config.server.host as string);
            process.env['ANALOG_PORT'] = `${viteServer.config.server.port}`;
          });

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

          if (
            nitroConfig.prerender?.routes?.length &&
            options?.prerender?.sitemap
          ) {
            console.log('Building Sitemap...');
            // sitemap needs to be built after all directories are built
            await buildSitemap(
              config,
              options.prerender.sitemap,
              nitroConfig.prerender.routes,
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
    dir: normalizePath(resolve(workspaceRoot, '.vercel', 'output')),
    publicDir: normalizePath(
      resolve(workspaceRoot, '.vercel', 'output/static')
    ),
  },
});

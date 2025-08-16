import { build, createDevServer, createNitro } from 'nitro';
import type { NitroConfig } from 'nitro/types';
import type { Plugin, UserConfig, ViteDevServer } from 'vite';
import { mergeConfig, normalizePath } from 'vite';
import { dirname, join, relative, resolve } from 'node:path';
import { platform } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

import { buildServer } from './build-server.js';
import { buildSSRApp } from './build-ssr.js';
import {
  Options,
  PrerenderContentDir,
  PrerenderContentFile,
  PrerenderRouteConfig,
  PrerenderSitemapConfig,
} from './options.js';
import { pageEndpointsPlugin } from './plugins/page-endpoints.js';
import { getPageHandlers } from './utils/get-page-handlers.js';
import { buildSitemap } from './build-sitemap.js';
import { devServerPlugin } from './plugins/dev-server-plugin.js';
import { getMatchingContentFilesWithFrontMatter } from './utils/get-content-files.js';
import { IncomingMessage, ServerResponse } from 'node:http';

const isWindows = platform() === 'win32';
const filePrefix = isWindows ? 'file:///' : '';
let clientOutputPath = '';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function nitro(options?: Options, nitroOptions?: NitroConfig): Plugin[] {
  const workspaceRoot = options?.workspaceRoot ?? process.cwd();
  const sourceRoot = options?.sourceRoot ?? 'src';
  let isTest = process.env['NODE_ENV'] === 'test' || !!process.env['VITEST'];
  const baseURL = process.env['NITRO_APP_BASE_URL'] || '';
  const prefix = baseURL ? baseURL.substring(0, baseURL.length - 1) : '';
  const apiPrefix = `/${options?.apiPrefix || 'api'}`;
  const useAPIMiddleware =
    typeof options?.useAPIMiddleware !== 'undefined'
      ? options?.useAPIMiddleware
      : true;

  let isBuild = false;
  let isServe = false;
  let ssrBuild = false;
  let config: UserConfig;
  let nitroConfig: NitroConfig;
  let environmentBuild = false;
  let hasAPIDir = false;
  const routeSitemaps: Record<
    string,
    PrerenderSitemapConfig | (() => PrerenderSitemapConfig)
  > = {};

  return [
    (options?.ssr
      ? devServerPlugin({
          entryServer: options?.entryServer,
          index: options?.index,
          routeRules: nitroOptions?.routeRules,
        })
      : false) as Plugin,
    {
      name: '@analogjs/vite-plugin-nitro',
      async config(userConfig, { mode, command }) {
        isServe = command === 'serve';
        isBuild = command === 'build';
        ssrBuild = userConfig.build?.ssr === true;
        config = userConfig;
        isTest = isTest ? isTest : mode === 'test';

        const rootDir = relative(workspaceRoot, config.root || '.') || '.';
        hasAPIDir = existsSync(
          resolve(
            workspaceRoot,
            rootDir,
            `${sourceRoot}/server/routes/${options?.apiPrefix || 'api'}`,
          ),
        );
        const buildPreset =
          process.env['BUILD_PRESET'] ??
          (nitroOptions?.preset as string | undefined);

        const pageHandlers = getPageHandlers({
          workspaceRoot,
          sourceRoot,
          rootDir,
          additionalPagesDirs: options?.additionalPagesDirs,
          hasAPIDir,
        });

        const ssrEntryPath = resolve(
          options?.ssrBuildDir ||
            resolve(workspaceRoot, 'dist', rootDir, `ssr`),
          `main.server${filePrefix ? '.js' : ''}`,
        );
        const ssrEntry = normalizePath(filePrefix + ssrEntryPath);
        const rendererEntry =
          filePrefix +
          normalizePath(
            join(
              __dirname,
              `runtime/renderer${!options?.ssr && !options?.prerender?.routes ? '-client' : ''}${
                filePrefix ? '.mjs' : ''
              }`,
            ),
          );

        nitroConfig = {
          rootDir,
          preset: buildPreset,
          compatibilityDate: '2024-11-19',
          logLevel: nitroOptions?.logLevel || 0,
          srcDir: normalizePath(`${sourceRoot}/server`),
          scanDirs: [
            normalizePath(`${rootDir}/${sourceRoot}/server`),
            ...(options?.additionalAPIDirs || []).map((dir) =>
              normalizePath(`${workspaceRoot}${dir}`),
            ),
          ],
          output: {
            dir: normalizePath(
              resolve(workspaceRoot, 'dist', rootDir, 'analog'),
            ),
            publicDir: normalizePath(
              resolve(workspaceRoot, 'dist', rootDir, 'analog/public'),
            ),
          },
          buildDir: normalizePath(
            resolve(workspaceRoot, 'dist', rootDir, '.nitro'),
          ),
          typescript: {
            generateTsConfig: false,
          },
          runtimeConfig: {
            apiPrefix: apiPrefix.substring(1),
            prefix,
          },
          // Fix for h3App._fetch is not a function error in newer h3/nitro versions
          experimental: {
            asyncContext: true,
            typescriptBundlerResolution: true,
            // Use native fetch during prerendering
            wasm: true,
          },
          // Fixes support for Rolldown
          imports: {
            autoImport: false,
          },
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
            ...(hasAPIDir
              ? []
              : useAPIMiddleware
                ? [
                    {
                      handler: '#ANALOG_API_MIDDLEWARE',
                      middleware: true,
                    },
                  ]
                : []),
            ...pageHandlers,
          ],
          routeRules: hasAPIDir
            ? undefined
            : useAPIMiddleware
              ? undefined
              : {
                  [`${prefix}${apiPrefix}/**`]: {
                    proxy: { to: '/**' },
                  },
                },
          virtual: {
            ...(hasAPIDir
              ? {}
              : {
                  '#ANALOG_API_MIDDLEWARE': `
        import { eventHandler, proxyRequest } from 'h3';
        import { useRuntimeConfig } from '#imports';

        export default eventHandler(async (event) => {
          const prefix = useRuntimeConfig().prefix;
          const apiPrefix = \`\${prefix}/\${useRuntimeConfig().apiPrefix}\`;

          console.log('[API Middleware] Request URL:', event.req.url);
          console.log('[API Middleware] API Prefix:', apiPrefix);
          console.log('[API Middleware] Starts with API prefix:', event.req.url?.startsWith(apiPrefix));

          if (event.req.url?.startsWith(apiPrefix)) {
            const reqUrl = event.req.url?.replace(apiPrefix, '');
            console.log('[API Middleware] Proxying to:', reqUrl);

            if (
              event.req.method === 'GET' &&
              // in the case of XML routes, we want to proxy the request so that nitro gets the correct headers
              // and can render the XML correctly as a static asset
              !event.req.url?.endsWith('.xml')
            ) {
              // Convert headers to a format that $fetch can handle
              const headers = event.req.headers instanceof Headers
                ? (() => {
                    const headerObj: Record<string, string> = {};
                    event.req.headers.forEach((value, key) => {
                      headerObj[key] = value;
                    });
                    return headerObj;
                  })()
                : event.req.headers;
              console.log('[API Middleware] Fetching with headers:', headers);
              const response = await globalThis.$fetch(reqUrl, { headers });
              console.log('[API Middleware] Response type:', typeof response);
              console.log('[API Middleware] Response:', JSON.stringify(response, null, 2));
              return response;
            }

            // For proxy requests, we need to handle headers differently
            // Skip proxy requests during prerendering to avoid header issues
            console.log('[API Middleware] Proxy request to:', reqUrl);
            const response = await globalThis.$fetch(reqUrl, {
              headers: event.req.headers instanceof Headers
                ? (() => {
                    const headerObj: Record<string, string> = {};
                    event.req.headers.forEach((value, key) => {
                      headerObj[key] = value;
                    });
                    return headerObj;
                  })()
                : event.req.headers
            });
            console.log('[API Middleware] Proxy response type:', typeof response);
            console.log('[API Middleware] Proxy response:', JSON.stringify(response, null, 2));
            return response;
          }
        });`,
                }),
          },
        };

        if (isVercelPreset(buildPreset)) {
          nitroConfig = withVercelOutputAPI(nitroConfig, workspaceRoot);
        }

        if (isCloudflarePreset(buildPreset)) {
          nitroConfig = withCloudflareOutput(nitroConfig);
        }

        if (isFirebaseAppHosting()) {
          nitroConfig = withAppHostingOutput(nitroConfig);
        }

        if (!ssrBuild && !isTest) {
          // store the client output path for the SSR build config
          clientOutputPath = resolve(
            workspaceRoot,
            rootDir,
            config.build?.outDir || 'dist/client',
          );
        }

        const indexEntry = normalizePath(
          resolve(clientOutputPath, 'index.html'),
        );

        nitroConfig.alias = {
          '#analog/ssr': ssrEntry,
          '#analog/index': indexEntry,
        };

        if (isBuild) {
          nitroConfig.publicAssets = [{ dir: clientOutputPath }];
          nitroConfig.renderer = rendererEntry;

          if (isEmptyPrerenderRoutes(options)) {
            nitroConfig.prerender = {
              concurrency: 1,
              failOnError: false,
              routes: ['/'],
            };
          }

          if (options?.prerender) {
            nitroConfig.prerender = nitroConfig.prerender ?? {
              concurrency: 1,
              failOnError: false,
            };
            nitroConfig.prerender.crawlLinks = options?.prerender?.discover;

            let routes: (
              | string
              | PrerenderContentDir
              | PrerenderRouteConfig
              | undefined
            )[] = [];

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

                if ('route' in current) {
                  if (current.sitemap) {
                    routeSitemaps[current.route] = current.sitemap;
                  }

                  prev.push(current.route);

                  // Add the server-side data fetching endpoint URL
                  if ('staticData' in current) {
                    prev.push(`${apiPrefix}/_analog/pages/${current.route}`);
                  }

                  return prev;
                }

                const affectedFiles: PrerenderContentFile[] =
                  getMatchingContentFilesWithFrontMatter(
                    workspaceRoot,
                    rootDir,
                    current.contentDir,
                  );

                affectedFiles.forEach((f) => {
                  const result = current.transform(f);

                  if (result) {
                    if (current.sitemap) {
                      routeSitemaps[result] =
                        current.sitemap && typeof current.sitemap === 'function'
                          ? current.sitemap?.(f)
                          : current.sitemap;
                    }

                    prev.push(result);

                    // Add the server-side data fetching endpoint URL
                    if ('staticData' in current) {
                      prev.push(`${apiPrefix}/_analog/pages/${result}`);
                    }
                  }
                });

                return prev;
              },
              [],
            );
          }

          if (ssrBuild) {
            if (isWindows) {
              const indexContents = readFileSync(
                normalizePath(join(clientOutputPath, 'index.html')),
                'utf-8',
              );

              // Write out the renderer manually because
              // Windows doesn't resolve the aliases
              // correctly in its native environment
              writeFileSync(
                normalizePath(rendererEntry.replace(filePrefix, '')),
                `
              /**
               * This file is shipped as ESM for Windows support,
               * as it won't resolve the renderer.ts file correctly in node.
               */
              import { eventHandler } from 'h3';

              // @ts-ignore
              import renderer from '${ssrEntry}';
              // @ts-ignore
              const template = \`${indexContents}\`;

              export default eventHandler(async (event) => {
                const noSSR = event.res.headers.get('x-analog-no-ssr');

                if (noSSR === 'true') {
                  return template;
                }

                const html = await renderer(event.req.url, template, {
                  req: event.req,
                  res: event._res,
                });

                return html;
              });
              `,
              );

              nitroConfig.externals = {
                inline: ['std-env'],
              };
            }

            nitroConfig = {
              ...nitroConfig,
              externals: {
                ...nitroConfig.externals,
                external: ['rxjs', 'node-fetch-native/dist/polyfill'],
              },
              moduleSideEffects: ['zone.js/node', 'zone.js/fesm2015/zone-node'],
              handlers: [
                ...(hasAPIDir
                  ? []
                  : useAPIMiddleware
                    ? [
                        {
                          handler: '#ANALOG_API_MIDDLEWARE',
                          middleware: true,
                        },
                      ]
                    : []),
                ...pageHandlers,
              ],
            };
          }
        }

        nitroConfig = mergeConfig(
          nitroConfig,
          nitroOptions as Record<string, any>,
        );

        return {
          environments: {
            client: {
              build: {
                outDir:
                  config?.build?.outDir ||
                  resolve(workspaceRoot, 'dist', rootDir, 'client'),
              },
            },
            ssr: {
              build: {
                ssr: true,
                rollupOptions: {
                  input:
                    options?.entryServer ||
                    resolve(
                      workspaceRoot,
                      rootDir,
                      `${sourceRoot}/main.server.ts`,
                    ),
                },
                outDir:
                  options?.ssrBuildDir ||
                  resolve(workspaceRoot, 'dist', rootDir, 'ssr'),
              },
            },
          },
          builder: {
            sharedPlugins: true,
            buildApp: async (builder) => {
              environmentBuild = true;
              const builds = [builder.build(builder.environments['client'])];

              if (options?.ssr || nitroConfig.prerender?.routes?.length) {
                builds.push(builder.build(builder.environments['ssr']));
              }

              await Promise.all(builds);
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
                  nitroConfig.output?.publicDir ?? '',
                  routeSitemaps,
                );
              }

              console.log(
                `\n\nThe '@analogjs/platform' server has been successfully built.`,
              );
            },
          },
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
          const apiHandler = async (
            req: IncomingMessage,
            res: ServerResponse,
          ) => {
            // Convert Node.js request to Web Request
            const url = `http://${req.headers.host || 'localhost'}${req.url}`;
            const headers = new Headers();
            for (const [key, value] of Object.entries(req.headers)) {
              if (value) {
                headers.set(
                  key,
                  Array.isArray(value) ? value.join(', ') : value,
                );
              }
            }

            const request = new Request(url, {
              method: req.method,
              headers,
              // Note: body handling would be needed for POST/PUT requests
            });

            try {
              console.log('[Dev Server API Handler] Fetching:', url);
              const response = await server.fetch(request);
              console.log(
                '[Dev Server API Handler] Response status:',
                response.status,
              );

              // Collect headers in a safe way
              const responseHeaders: Record<string, string> = {};
              response.headers.forEach((value, key) => {
                responseHeaders[key] = value;
              });
              console.log(
                '[Dev Server API Handler] Response headers:',
                responseHeaders,
              );

              // Set status code
              res.statusCode = response.status;

              // Set headers
              response.headers.forEach((value, key) => {
                res.setHeader(key, value);
              });

              // Send body
              const body = await response.arrayBuffer();
              const bodyText = new TextDecoder().decode(body);
              console.log('[Dev Server API Handler] Response body:', bodyText);
              res.end(Buffer.from(body));
            } catch (error) {
              console.error('Error in apiHandler:', error);
              res.statusCode = 500;
              res.end('Internal Server Error');
            }
          };

          if (hasAPIDir) {
            viteServer.middlewares.use(
              (
                req: IncomingMessage,
                res: ServerResponse,
                next: (err?: any) => void,
              ) => {
                if (req.url?.startsWith(`${prefix}${apiPrefix}`)) {
                  apiHandler(req, res);
                  return;
                }

                next();
              },
            );
          } else {
            viteServer.middlewares.use(apiPrefix, apiHandler);
          }

          viteServer.httpServer?.once('listening', () => {
            process.env['ANALOG_HOST'] = !viteServer.config.server.host
              ? 'localhost'
              : (viteServer.config.server.host as string);
            process.env['ANALOG_PORT'] = `${viteServer.config.server.port}`;
          });

          // handle upgrades if websockets are enabled
          if (nitroOptions?.experimental?.websocket && server.upgrade) {
            viteServer.httpServer?.on('upgrade', server.upgrade);
          }

          console.log(
            `\n\nThe server endpoints are accessible under the "${prefix}${apiPrefix}" path.`,
          );
        }
      },

      async closeBundle() {
        // Skip when build is triggered by the Environment API
        if (environmentBuild) {
          return;
        }

        if (ssrBuild) {
          return;
        }

        if (isBuild) {
          if (options?.ssr) {
            console.log('Building SSR application...');
            await buildSSRApp(config, options);
          }

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
              clientOutputPath,
              routeSitemaps,
            );
          }

          await buildServer(options, nitroConfig);

          console.log(
            `\n\nThe '@analogjs/platform' server has been successfully built.`,
          );
        }
      },
    },
    {
      name: '@analogjs/vite-plugin-nitro-api-prefix',
      config() {
        return {
          define: {
            ANALOG_API_PREFIX: `"${baseURL.substring(1)}${apiPrefix.substring(1)}"`,
          },
        };
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
  workspaceRoot: string,
) => ({
  ...nitroConfig,
  output: {
    ...nitroConfig?.output,
    dir: normalizePath(resolve(workspaceRoot, '.vercel', 'output')),
    publicDir: normalizePath(
      resolve(workspaceRoot, '.vercel', 'output/static'),
    ),
  },
});

const isCloudflarePreset = (buildPreset: string | undefined) =>
  process.env['CF_PAGES'] ||
  (buildPreset && buildPreset.toLowerCase().includes('cloudflare-pages'));

const withCloudflareOutput = (nitroConfig: NitroConfig | undefined) => ({
  ...nitroConfig,
  output: {
    ...nitroConfig?.output,
    serverDir: '{{ output.publicDir }}/_worker.js',
  },
});

const isFirebaseAppHosting = () => !!process.env['NG_BUILD_LOGS_JSON'];
const withAppHostingOutput = (nitroConfig: NitroConfig) => {
  let hasOutput = false;

  return <NitroConfig>{
    ...nitroConfig,
    serveStatic: true,
    rollupConfig: {
      ...nitroConfig.rollupConfig,
      output: {
        ...nitroConfig.rollupConfig?.output,
        entryFileNames: 'server.mjs',
      },
    },
    hooks: {
      ...nitroConfig.hooks,
      compiled: () => {
        if (!hasOutput) {
          const buildOutput = {
            errors: [],
            warnings: [],
            outputPaths: {
              root: pathToFileURL(`${nitroConfig.output?.dir}`),
              browser: pathToFileURL(`${nitroConfig.output?.publicDir}`),
              server: pathToFileURL(`${nitroConfig.output?.dir}/server`),
            },
          };

          // Log the build output for Firebase App Hosting to pick up
          console.log(JSON.stringify(buildOutput, null, 2));
          hasOutput = true;
        }
      },
    },
  };
};

import type { NitroConfig, NitroEventHandler, RollupConfig } from 'nitro/types';
import { build, createDevServer, createNitro } from 'nitro/builder';
import * as vite from 'vite';
import type { Plugin, UserConfig, ViteDevServer } from 'vite';
import { mergeConfig, normalizePath } from 'vite';
import { relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';

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
import {
  toWebRequest,
  writeWebResponseToNode,
} from './utils/node-web-bridge.js';
import { getMatchingContentFilesWithFrontMatter } from './utils/get-content-files.js';
import {
  ssrRenderer,
  clientRenderer,
  apiMiddleware,
} from './utils/renderers.js';

let clientOutputPath = '';

function createNitroMiddlewareHandler(handler: string): NitroEventHandler {
  return {
    route: '/**',
    handler,
    middleware: true,
  };
}

function appendRollupExternal(
  nitroConfig: NitroConfig,
  ...entries: string[]
): NitroConfig['rollupConfig'] {
  const external = nitroConfig.rollupConfig?.external;

  if (!external) {
    return {
      ...nitroConfig.rollupConfig,
      external: entries,
    };
  }

  if (typeof external === 'function') {
    return {
      ...nitroConfig.rollupConfig,
      external: (source, importer, isResolved) =>
        external(source, importer, isResolved) || entries.includes(source),
    };
  }

  return {
    ...nitroConfig.rollupConfig,
    external: Array.isArray(external)
      ? [...external, ...entries]
      : [external, ...entries],
  };
}

function appendNoExternals(
  noExternals: NitroConfig['noExternals'],
  ...entries: string[]
): NitroConfig['noExternals'] {
  if (!noExternals) {
    return entries;
  }

  return Array.isArray(noExternals)
    ? [...noExternals, ...entries]
    : noExternals;
}

function removeInvalidRollupCodeSplitting(
  _nitro: unknown,
  bundlerConfig: RollupConfig,
) {
  // Workaround for a Nitro v3 alpha bundler bug:
  //
  // Analog does not add `output.codeSplitting` to Nitro's Rollup config, but
  // Nitro 3.0.1-alpha.2 builds an internal server bundler config that can
  // still contain that key while running under Vite 8 / Rolldown. At runtime
  // this surfaces as:
  //
  //   Warning: Invalid output options (1 issue found)
  //   - For the "codeSplitting". Invalid key: Expected never but received "codeSplitting".
  //
  // That warning comes from Nitro's own bundler handoff, not from user config
  // in Analog apps. We remove only the invalid `output.codeSplitting` field
  // right before Nitro starts prerender/server builds.
  //
  // Why this is safe:
  // - Analog is not relying on Nitro-side `output.codeSplitting`.
  // - The warning path only rejects the option; removing it restores the
  //   default Nitro/Rollup behavior instead of changing any Analog semantics.
  // - The hook is narrowly scoped to the final Nitro bundler config, so it
  //   does not affect the normal Vite client/SSR environment build config.
  const output = bundlerConfig['output'];
  if (!output || Array.isArray(output) || typeof output !== 'object') {
    return;
  }

  if ('codeSplitting' in output) {
    delete (output as Record<string, unknown>)['codeSplitting'];
  }
}

function resolveClientOutputPath(
  workspaceRoot: string,
  rootDir: string,
  configuredOutDir: string | undefined,
  ssrBuild: boolean,
) {
  if (clientOutputPath) {
    return clientOutputPath;
  }

  if (!ssrBuild) {
    return resolve(workspaceRoot, rootDir, configuredOutDir || 'dist/client');
  }

  // SSR builds write server assets to dist/<app>/ssr, but the renderer template
  // still needs the client index.html emitted to dist/<app>/client.
  return resolve(workspaceRoot, 'dist', rootDir, 'client');
}

function toNitroSsrAliasEntry(ssrEntryPath: string) {
  // Nitro rebundles the generated SSR entry. On Windows, a file URL preserves
  // the importer location so relative "./assets/*" imports resolve correctly.
  return process.platform === 'win32'
    ? pathToFileURL(ssrEntryPath).href
    : normalizePath(ssrEntryPath);
}

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
  const routeSourceFiles: Record<string, string> = {};
  let rootDir = workspaceRoot;

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

        rootDir = relative(workspaceRoot, config.root || '.') || '.';
        hasAPIDir = existsSync(
          resolve(
            workspaceRoot,
            rootDir,
            `${sourceRoot}/server/routes/${options?.apiPrefix || 'api'}`,
          ),
        );
        const buildPreset =
          process.env['BUILD_PRESET'] ??
          (nitroOptions?.preset as string | undefined) ??
          (process.env['VERCEL'] ? 'vercel' : undefined);

        const pageHandlers = getPageHandlers({
          workspaceRoot,
          sourceRoot,
          rootDir,
          additionalPagesDirs: options?.additionalPagesDirs,
          hasAPIDir,
        });
        const resolvedClientOutputPath = resolveClientOutputPath(
          workspaceRoot,
          rootDir,
          config.build?.outDir,
          ssrBuild,
        );
        const indexEntry = normalizePath(
          resolve(resolvedClientOutputPath, 'index.html'),
        );

        nitroConfig = {
          rootDir,
          preset: buildPreset,
          compatibilityDate: '2024-11-19',
          logLevel: nitroOptions?.logLevel || 0,
          serverDir: normalizePath(`${sourceRoot}/server`),
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
          // Fixes support for Rolldown
          imports: {
            autoImport: false,
          },
          // Temporary Nitro alpha workaround. Remove once Nitro no longer
          // passes Rolldown-only output options into the server bundler path.
          hooks: {
            'rollup:before': removeInvalidRollupCodeSplitting,
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
                ? [createNitroMiddlewareHandler('#ANALOG_API_MIDDLEWARE')]
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
            '#ANALOG_SSR_RENDERER': ssrRenderer(indexEntry),
            '#ANALOG_CLIENT_RENDERER': clientRenderer(indexEntry),
            ...(hasAPIDir ? {} : { '#ANALOG_API_MIDDLEWARE': apiMiddleware }),
          },
        };

        if (isVercelPreset(buildPreset)) {
          nitroConfig = withVercelOutputAPI(
            nitroConfig,
            workspaceRoot,
            buildPreset,
          );
        }

        if (isCloudflarePreset(buildPreset)) {
          nitroConfig = withCloudflareOutput(nitroConfig);
        }

        if (
          isNetlifyPreset(buildPreset) &&
          rootDir === '.' &&
          !existsSync(resolve(workspaceRoot, 'netlify.toml'))
        ) {
          nitroConfig = withNetlifyOutputAPI(nitroConfig, workspaceRoot);
        }

        if (isFirebaseAppHosting()) {
          nitroConfig = withAppHostingOutput(nitroConfig);
        }

        if (!ssrBuild && !isTest) {
          // store the client output path for the SSR build config
          clientOutputPath = resolvedClientOutputPath;
        }

        if (isBuild) {
          nitroConfig.publicAssets = [{ dir: clientOutputPath, maxAge: 0 }];

          // In Nitro v3, renderer.entry is resolved via resolveModulePath()
          // during options normalization, which requires a real filesystem path.
          // Virtual modules (prefixed with #) can't survive this resolution.
          // Instead, we add the renderer as a catch-all handler directly —
          // this is functionally equivalent to what Nitro does internally
          // (it converts renderer.entry into a { route: '/**', lazy: true }
          // handler), but avoids the filesystem resolution step.
          const rendererHandler = options?.ssr
            ? '#ANALOG_SSR_RENDERER'
            : '#ANALOG_CLIENT_RENDERER';
          nitroConfig.handlers = [
            ...(nitroConfig.handlers || []),
            {
              handler: rendererHandler,
              route: '/**',
              lazy: true,
            },
          ];

          if (isEmptyPrerenderRoutes(options)) {
            nitroConfig.prerender = {};
            nitroConfig.prerender.routes = ['/'];
          }

          if (options?.prerender) {
            nitroConfig.prerender = nitroConfig.prerender ?? {};
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

                  if (current.outputSourceFile) {
                    const sourcePath = resolve(
                      workspaceRoot,
                      rootDir,
                      current.outputSourceFile,
                    );
                    routeSourceFiles[current.route] = readFileSync(
                      sourcePath,
                      'utf8',
                    );
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

                    if (current.outputSourceFile) {
                      const sourceContent = current.outputSourceFile(f);
                      if (sourceContent) {
                        routeSourceFiles[result] = sourceContent;
                      }
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
            if (process.platform === 'win32') {
              nitroConfig.noExternals = appendNoExternals(
                nitroConfig.noExternals,
                'std-env',
              );
            }

            nitroConfig = {
              ...nitroConfig,
              rollupConfig: appendRollupExternal(
                nitroConfig,
                'rxjs',
                'node-fetch-native/dist/polyfill',
              ),
              moduleSideEffects: ['zone.js/node', 'zone.js/fesm2015/zone-node'],
              handlers: [
                ...(hasAPIDir
                  ? []
                  : useAPIMiddleware
                    ? [createNitroMiddlewareHandler('#ANALOG_API_MIDDLEWARE')]
                    : []),
                ...pageHandlers,
                // Preserve the renderer catch-all handler added above
                {
                  handler: rendererHandler,
                  route: '/**',
                  lazy: true,
                },
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
                [vite.rolldownVersion ? 'rolldownOptions' : 'rollupOptions']: {
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

              const ssrOutDir =
                options?.ssrBuildDir ||
                resolve(workspaceRoot, 'dist', rootDir, `ssr`);

              // Resolve the SSR entry path, checking for .mjs (Vite v8+
              // default ESM extension), then .js, then extensionless.
              let ssrEntryPath = resolve(ssrOutDir, 'main.server.mjs');
              if (!existsSync(ssrEntryPath)) {
                ssrEntryPath = resolve(ssrOutDir, 'main.server.js');
              }
              if (!existsSync(ssrEntryPath)) {
                ssrEntryPath = resolve(ssrOutDir, 'main.server');
              }

              const ssrEntry = toNitroSsrAliasEntry(ssrEntryPath);

              nitroConfig.alias = {
                ...nitroConfig.alias,
                '#analog/ssr': ssrEntry,
              };

              await buildServer(options, nitroConfig, routeSourceFiles);

              if (
                nitroConfig.prerender?.routes?.length &&
                options?.prerender?.sitemap
              ) {
                const publicDir = nitroConfig.output?.publicDir;
                if (!publicDir) {
                  throw new Error(
                    'Nitro public output directory is required to build the sitemap.',
                  );
                }

                console.log('Building Sitemap...');
                // sitemap needs to be built after all directories are built
                await buildSitemap(
                  config,
                  options.prerender.sitemap,
                  nitroConfig.prerender.routes,
                  publicDir,
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
            // Nitro's Vite builder now rejects `build()` in dev mode, but Analog's
            // dev integration still relies on the builder-driven reload hooks.
            // Force the server worker onto Rollup for this dev-only path.
            builder: 'rollup',
            ...nitroConfig,
          });
          const server = createDevServer(nitro);
          await build(nitro);

          const apiHandler = async (
            req: IncomingMessage,
            res: ServerResponse,
          ) => {
            // Nitro v3's dev server is fetch-first, so adapt Vite's Node
            // request once and let Nitro respond with a standard Web Response.
            const response = await server.fetch(toWebRequest(req));
            await writeWebResponseToNode(res, response);
          };

          if (hasAPIDir) {
            viteServer.middlewares.use(
              (
                req: IncomingMessage,
                res: ServerResponse,
                next: (error?: unknown) => void,
              ) => {
                if (req.url?.startsWith(`${prefix}${apiPrefix}`)) {
                  void apiHandler(req, res).catch((error) => next(error));
                  return;
                }

                next();
              },
            );
          } else {
            viteServer.middlewares.use(
              apiPrefix,
              (
                req: IncomingMessage,
                res: ServerResponse,
                next: (error?: unknown) => void,
              ) => {
                void apiHandler(req, res).catch((error) => next(error));
              },
            );
          }

          viteServer.httpServer?.once('listening', () => {
            process.env['ANALOG_HOST'] = !viteServer.config.server.host
              ? 'localhost'
              : (viteServer.config.server.host as string);
            process.env['ANALOG_PORT'] = `${viteServer.config.server.port}`;
          });

          // handle upgrades if websockets are enabled
          if (nitroOptions?.experimental?.websocket) {
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

          const closeBundleSsrOutDir =
            options?.ssrBuildDir ||
            resolve(workspaceRoot, 'dist', rootDir, `ssr`);

          // Resolve the SSR entry path, checking for .mjs (Vite v8+
          // default ESM extension), then .js, then extensionless.
          let ssrEntryPath = resolve(closeBundleSsrOutDir, 'main.server.mjs');
          if (!existsSync(ssrEntryPath)) {
            ssrEntryPath = resolve(closeBundleSsrOutDir, 'main.server.js');
          }
          if (!existsSync(ssrEntryPath)) {
            ssrEntryPath = resolve(closeBundleSsrOutDir, 'main.server');
          }

          const ssrEntry = toNitroSsrAliasEntry(ssrEntryPath);

          nitroConfig.alias = {
            ...nitroConfig.alias,
            '#analog/ssr': ssrEntry,
          };

          await buildServer(options, nitroConfig, routeSourceFiles);

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
  buildPreset: string | undefined,
) => ({
  ...nitroConfig,
  preset:
    nitroConfig?.preset ??
    (buildPreset?.toLowerCase().includes('vercel-edge')
      ? 'vercel-edge'
      : 'vercel'),
  vercel: {
    ...nitroConfig?.vercel,
    ...(buildPreset?.toLowerCase().includes('vercel-edge')
      ? {}
      : {
          entryFormat: nitroConfig?.vercel?.entryFormat ?? 'node',
          functions: {
            runtime: nitroConfig?.vercel?.functions?.runtime ?? 'nodejs22.x',
            ...nitroConfig?.vercel?.functions,
          },
        }),
  },
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

const isNetlifyPreset = (buildPreset: string | undefined) =>
  process.env['NETLIFY'] ||
  (buildPreset && buildPreset.toLowerCase().includes('netlify'));

const withNetlifyOutputAPI = (
  nitroConfig: NitroConfig | undefined,
  workspaceRoot: string,
) => ({
  ...nitroConfig,
  output: {
    ...nitroConfig?.output,
    dir: normalizePath(resolve(workspaceRoot, 'netlify/functions')),
  },
});

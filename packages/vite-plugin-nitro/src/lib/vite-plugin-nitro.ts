import type { NitroConfig, NitroEventHandler, RollupConfig } from 'nitro/types';
import { build, createDevServer, createNitro } from 'nitro/builder';
import * as vite from 'vite';
import type { Plugin, UserConfig, ViteDevServer } from 'vite';
import { mergeConfig, normalizePath } from 'vite';
import { relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { buildServer, isVercelPreset } from './build-server.js';
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
import { getBundleOptionsKey, isRolldown } from './utils/rolldown.js';

function createNitroMiddlewareHandler(handler: string): NitroEventHandler {
  return {
    route: '/**',
    handler,
    middleware: true,
  };
}

/**
 * Creates a `rollup:before` hook that marks specified packages as external
 * in Nitro's bundler config (applied to both the server build and the
 * prerender build).
 *
 * ## Subpath matching (Rolldown compatibility)
 *
 * When `bundlerConfig.external` is an **array**, Rollup automatically
 * prefix-matches entries — `'rxjs'` in the array will also externalise
 * `'rxjs/operators'`, `'rxjs/internal/Observable'`, etc.
 *
 * Rolldown (the default bundler in Nitro v3) does **not** do this. It
 * treats array entries as exact strings. To keep behaviour consistent
 * across both bundlers, the **function** branch already needed explicit
 * subpath matching. We now use the same `isExternal` helper for all
 * branches so that `'rxjs'` reliably matches `'rxjs/operators'`
 * regardless of whether the existing `external` value is a function,
 * array, or absent.
 *
 * Without this, the Nitro prerender build fails on Windows CI with:
 *
 *   [RESOLVE_ERROR] Could not resolve 'rxjs/operators'
 */
function createRollupBeforeHook(externalEntries: string[]) {
  const isExternal = (source: string) =>
    externalEntries.some(
      (entry) => source === entry || source.startsWith(entry + '/'),
    );

  return (_nitro: unknown, bundlerConfig: RollupConfig) => {
    sanitizeNitroBundlerConfig(_nitro, bundlerConfig);

    if (externalEntries.length === 0) {
      return;
    }

    const existing = bundlerConfig.external;
    if (!existing) {
      bundlerConfig.external = externalEntries;
    } else if (typeof existing === 'function') {
      bundlerConfig.external = (
        source: string,
        importer: string | undefined,
        isResolved: boolean,
      ) => existing(source, importer, isResolved) || isExternal(source);
    } else if (Array.isArray(existing)) {
      bundlerConfig.external = [...existing, ...externalEntries];
    } else {
      bundlerConfig.external = [existing as string, ...externalEntries];
    }
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

/**
 * Patches Nitro's internal Rollup/Rolldown bundler config to work around
 * incompatibilities in the Nitro v3 alpha series.
 *
 * Called from the `rollup:before` hook, this function runs against the *final*
 * bundler config that Nitro assembles for its server/prerender builds — it
 * does NOT touch the normal Vite client or SSR environment configs.
 *
 * Each workaround is narrowly scoped and safe to remove once the corresponding
 * upstream Nitro issue is resolved.
 */
function sanitizeNitroBundlerConfig(
  _nitro: unknown,
  bundlerConfig: RollupConfig,
) {
  const output = bundlerConfig['output'];
  if (!output || Array.isArray(output) || typeof output !== 'object') {
    return;
  }

  // ── 1. Remove invalid `output.codeSplitting` ────────────────────────
  //
  // Nitro 3.0.1-alpha.2 adds `output.codeSplitting` to its internal bundler
  // config, but Rolldown rejects it as an unknown key:
  //
  //   Warning: Invalid output options (1 issue found)
  //   - For the "codeSplitting". Invalid key: Expected never but received "codeSplitting".
  //
  // Analog never sets this option. Removing it restores default bundler
  // behavior without changing any Analog semantics.
  if ('codeSplitting' in output) {
    delete (output as Record<string, unknown>)['codeSplitting'];
  }

  // ── 2. Remove invalid `output.manualChunks` ─────────────────────────
  //
  // Nitro's default config enables manual chunking for node_modules. Under
  // Nitro v3 alpha + Rollup 4.59 this crashes during the prerender rebundle:
  //
  //   Cannot read properties of undefined (reading 'included')
  //
  // A single server bundle is acceptable for Analog's use case, so we strip
  // `manualChunks` until the upstream bug is fixed.
  if ('manualChunks' in output) {
    delete (output as Record<string, unknown>)['manualChunks'];
  }

  // ── 3. Escape route params in `output.chunkFileNames` ───────────────
  //
  // Nitro's `getChunkName()` derives chunk filenames from route patterns,
  // using its internal `routeToFsPath()` helper to convert route params
  // (`:productId` → `[productId]`) and catch-alls (`**` → `[...]`).
  //
  // Rollup/Rolldown interprets *any* `[token]` in the string returned by a
  // `chunkFileNames` function as a placeholder. Only a handful are valid —
  // `[name]`, `[hash]`, `[format]`, `[ext]` — so route-derived tokens like
  // `[productId]` or `[...]` trigger a build error:
  //
  //   "[productId]" is not a valid placeholder in the "output.chunkFileNames" pattern.
  //
  // We wrap the original function to replace non-standard `[token]` patterns
  // with `_token_`, preserving the intended filename while avoiding the
  // placeholder validation error.
  //
  // Example: `_routes/products/[productId].mjs` → `_routes/products/_productId_.mjs`
  const VALID_ROLLUP_PLACEHOLDER = /^\[(?:name|hash|format|ext)\]$/;
  const chunkFileNames = (output as Record<string, unknown>)['chunkFileNames'];
  if (typeof chunkFileNames === 'function') {
    const originalFn = chunkFileNames as (...args: unknown[]) => unknown;
    (output as Record<string, unknown>)['chunkFileNames'] = (
      ...args: unknown[]
    ) => {
      const result = originalFn(...args);
      if (typeof result !== 'string') return result;
      return result.replace(/\[[^\]]+\]/g, (match: string) =>
        VALID_ROLLUP_PLACEHOLDER.test(match)
          ? match
          : `_${match.slice(1, -1)}_`,
      );
    };
  }
}

function resolveClientOutputPath(
  cachedPath: string,
  workspaceRoot: string,
  rootDir: string,
  configuredOutDir: string | undefined,
  ssrBuild: boolean,
) {
  if (cachedPath) {
    return cachedPath;
  }

  if (!ssrBuild) {
    return resolve(workspaceRoot, rootDir, configuredOutDir || 'dist/client');
  }

  // SSR builds write server assets to dist/<app>/ssr, but the renderer template
  // still needs the client index.html emitted to dist/<app>/client.
  return resolve(workspaceRoot, 'dist', rootDir, 'client');
}

/**
 * Converts the built SSR entry path into a specifier that Nitro's bundler
 * can resolve, including all relative `./assets/*` chunk imports inside
 * the entry.
 *
 * The returned path **must** be an absolute filesystem path with forward
 * slashes (e.g. `D:/a/analog/dist/apps/blog-app/ssr/main.server.js`).
 * This lets Rollup/Rolldown determine the entry's directory and resolve
 * sibling chunk imports like `./assets/core-DTazUigR.js` correctly.
 *
 * ## Why not pathToFileURL() on Windows?
 *
 * Earlier versions converted the path to a `file:///D:/a/...` URL on
 * Windows, which worked with Nitro v2 + Rollup. Nitro v3 switched its
 * default bundler to Rolldown, and Rolldown does **not** extract the
 * importer directory from `file://` URLs. This caused every relative
 * import inside the SSR entry to fail during the prerender build:
 *
 *   [RESOLVE_ERROR] Could not resolve './assets/core-DTazUigR.js'
 *     in ../../dist/apps/blog-app/ssr/main.server.js
 *
 * `normalizePath()` (from Vite) simply converts backslashes to forward
 * slashes, which both Rollup and Rolldown handle correctly on all
 * platforms.
 */
function toNitroSsrEntrypointSpecifier(ssrEntryPath: string) {
  return normalizePath(ssrEntryPath);
}

function applySsrEntryAlias(
  nitroConfig: NitroConfig,
  options: Options | undefined,
  workspaceRoot: string,
  rootDir: string,
): void {
  const ssrOutDir =
    options?.ssrBuildDir || resolve(workspaceRoot, 'dist', rootDir, 'ssr');
  if (options?.ssr || nitroConfig.prerender?.routes?.length) {
    const ssrEntryPath = resolveBuiltSsrEntryPath(ssrOutDir);
    const ssrEntry = toNitroSsrEntrypointSpecifier(ssrEntryPath);
    nitroConfig.alias = {
      ...nitroConfig.alias,
      '#analog/ssr': ssrEntry,
    };
  }
}

function resolveBuiltSsrEntryPath(ssrOutDir: string) {
  const candidatePaths = [
    resolve(ssrOutDir, 'main.server.mjs'),
    resolve(ssrOutDir, 'main.server.js'),
    resolve(ssrOutDir, 'main.server'),
  ];

  const ssrEntryPath = candidatePaths.find((candidatePath) =>
    existsSync(candidatePath),
  );

  if (!ssrEntryPath) {
    throw new Error(
      `Unable to locate the built SSR entry in "${ssrOutDir}". Expected one of: ${candidatePaths.join(
        ', ',
      )}`,
    );
  }

  return ssrEntryPath;
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
  const viteRolldownOutput = options?.vite?.build?.rolldownOptions?.output;
  // Vite's native build typing allows `output` to be either a single object or
  // an array. Analog only forwards `codeSplitting` into the client environment
  // when there is a single output object to merge into.
  const viteRolldownOutputConfig =
    viteRolldownOutput && !Array.isArray(viteRolldownOutput)
      ? viteRolldownOutput
      : undefined;
  const codeSplitting = viteRolldownOutputConfig?.codeSplitting;

  let isBuild = false;
  let isServe = false;
  let ssrBuild = false;
  let config: UserConfig;
  let nitroConfig: NitroConfig;
  let environmentBuild = false;
  let hasAPIDir = false;
  let clientOutputPath = '';
  let rendererIndexEntry = '';
  const rollupExternalEntries: string[] = [];
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
          clientOutputPath,
          workspaceRoot,
          rootDir,
          config.build?.outDir,
          ssrBuild,
        );
        rendererIndexEntry = normalizePath(
          resolve(resolvedClientOutputPath, 'index.html'),
        );

        nitroConfig = {
          rootDir: normalizePath(rootDir),
          preset: buildPreset,
          compatibilityDate: '2025-11-19',
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
          // Analog provides its own renderer handler; prevent Nitro v3 from
          // auto-detecting index.html in rootDir and adding a conflicting one.
          renderer: false,
          imports: {
            autoImport: false,
          },
          hooks: {
            'rollup:before': createRollupBeforeHook(rollupExternalEntries),
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
            '#ANALOG_SSR_RENDERER': ssrRenderer(rendererIndexEntry),
            '#ANALOG_CLIENT_RENDERER': clientRenderer(rendererIndexEntry),
            ...(hasAPIDir ? {} : { '#ANALOG_API_MIDDLEWARE': apiMiddleware }),
          },
        };

        if (isVercelPreset(buildPreset)) {
          nitroConfig = withVercelOutputAPI(nitroConfig, workspaceRoot);
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
          nitroConfig.publicAssets = [
            { dir: normalizePath(clientOutputPath), maxAge: 0 },
          ];

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

          // ── SSR / prerender Nitro config ─────────────────────────────
          //
          // This block configures Nitro for builds that rebundle the SSR
          // entry (main.server.{js,mjs}). That happens in two cases:
          //
          //   1. Full SSR apps  — `options.ssr === true`
          //   2. Prerender-only — no runtime SSR, but the prerender build
          //      still imports the SSR entry to render static pages.
          //
          // The original gate was `if (ssrBuild)`, which checks the Vite
          // top-level `build.ssr` flag. That worked with the legacy
          // single-pass build but breaks with two newer code paths:
          //
          //   a. **Vite Environment API (Vite 6+)** — SSR config lives in
          //      `environments.ssr.build.ssr`, not `build.ssr`, so
          //      `ssrBuild` is always `false`.
          //   b. **Prerender-only apps** (e.g. blog-app) — `options.ssr`
          //      is `false`, but prerender routes exist and the prerender
          //      build still processes the SSR entry.
          //
          // Without this block:
          //   - `rxjs` is never externalised → RESOLVE_ERROR in the
          //     Nitro prerender build (especially on Windows CI).
          //   - `moduleSideEffects` for zone.js is never set → zone.js
          //     side-effects may be tree-shaken.
          //   - The handlers list is not reassembled with page endpoints
          //     + the renderer catch-all.
          //
          // The widened condition covers all three code paths:
          //   - `ssrBuild`                           → legacy closeBundle
          //   - `options?.ssr`                        → Environment API SSR
          //   - `nitroConfig.prerender?.routes?.length` → prerender-only
          if (
            ssrBuild ||
            options?.ssr ||
            nitroConfig.prerender?.routes?.length
          ) {
            if (process.platform === 'win32') {
              nitroConfig.noExternals = appendNoExternals(
                nitroConfig.noExternals,
                'std-env',
              );
            }

            rollupExternalEntries.push(
              'rxjs',
              'node-fetch-native/dist/polyfill',
            );

            nitroConfig = {
              ...nitroConfig,
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
                // Forward code-splitting config to Rolldown when running
                // under Vite 8+.  `false` disables splitting (inlines all
                // dynamic imports); an object configures chunk groups.
                // The `!== undefined` check ensures `codeSplitting: false`
                // is forwarded correctly (a truthy check would swallow it).
                ...(isRolldown() && codeSplitting !== undefined
                  ? {
                      rolldownOptions: {
                        output: {
                          // Preserve any sibling Rolldown output options while
                          // overriding just `codeSplitting` for the client build.
                          ...viteRolldownOutputConfig,
                          codeSplitting,
                        },
                      },
                    }
                  : {}),
              },
            },
            ssr: {
              build: {
                ssr: true,
                [getBundleOptionsKey()]: {
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

              applySsrEntryAlias(nitroConfig, options, workspaceRoot, rootDir);

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

          applySsrEntryAlias(nitroConfig, options, workspaceRoot, rootDir);

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

const VERCEL_PRESET = 'vercel';
// Nitro v3 consolidates the old `vercel-edge` preset into `vercel` with
// fluid compute enabled by default, so a single preset covers both
// serverless and edge deployments.
const withVercelOutputAPI = (
  nitroConfig: NitroConfig | undefined,
  workspaceRoot: string,
) => ({
  ...nitroConfig,
  preset: nitroConfig?.preset ?? 'vercel',
  vercel: {
    ...nitroConfig?.vercel,
    entryFormat: nitroConfig?.vercel?.entryFormat ?? 'node',
    functions: {
      runtime: nitroConfig?.vercel?.functions?.runtime ?? 'nodejs24.x',
      ...nitroConfig?.vercel?.functions,
    },
  },
  output: {
    ...nitroConfig?.output,
    dir: normalizePath(resolve(workspaceRoot, '.vercel', 'output')),
    publicDir: normalizePath(
      resolve(workspaceRoot, '.vercel', 'output/static'),
    ),
  },
});

// Nitro v3 uses underscore-separated preset names (e.g. `cloudflare_pages`),
// but we accept both hyphen and underscore forms for backwards compatibility.
const isCloudflarePreset = (buildPreset: string | undefined) =>
  process.env['CF_PAGES'] ||
  (buildPreset &&
    (buildPreset.toLowerCase().includes('cloudflare-pages') ||
      buildPreset.toLowerCase().includes('cloudflare_pages')));

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

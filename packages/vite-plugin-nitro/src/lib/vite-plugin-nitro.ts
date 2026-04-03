import type { NitroConfig, NitroEventHandler, RollupConfig } from 'nitro/types';
import { build, createDevServer, createNitro } from 'nitro/builder';
import * as vite from 'vite';
import type { Plugin, UserConfig, ViteDevServer } from 'vite';
import { mergeConfig, normalizePath } from 'vite';
import { relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { buildServer, isVercelPreset } from './build-server.js';
import { buildClientApp, buildSSRApp } from './build-ssr.js';
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
import { debugNitro, debugSsr } from './utils/debug.js';

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
) {
  if (cachedPath) {
    debugNitro('resolveClientOutputPath using cached path', {
      cachedPath,
      workspaceRoot,
      rootDir,
      configuredOutDir,
    });
    return cachedPath;
  }

  if (configuredOutDir) {
    const resolvedPath = normalizePath(
      resolve(workspaceRoot, rootDir, configuredOutDir),
    );
    debugNitro('resolveClientOutputPath using configured build.outDir', {
      workspaceRoot,
      rootDir,
      configuredOutDir,
      resolvedPath,
    });
    return resolvedPath;
  }

  // When no explicit build.outDir is set, the environment build config defaults
  // to `<workspace>/dist/<root>/client` for the client build. The non-SSR
  // (client) and SSR paths must agree on this so that registerIndexHtmlVirtual()
  // and publicAssets read from the directory the client build actually wrote to.
  const resolvedPath = normalizePath(
    resolve(workspaceRoot, 'dist', rootDir, 'client'),
  );
  debugNitro('resolveClientOutputPath using default dist client path', {
    workspaceRoot,
    rootDir,
    configuredOutDir,
    resolvedPath,
  });
  return resolvedPath;
}

function getEnvironmentBuildOutDir(environment: unknown): string | undefined {
  if (!environment || typeof environment !== 'object') {
    return undefined;
  }

  const environmentConfig = environment as {
    config?: {
      build?: {
        outDir?: string;
      };
    };
    build?: {
      outDir?: string;
    };
  };

  return (
    environmentConfig.config?.build?.outDir ?? environmentConfig.build?.outDir
  );
}

function resolveBuiltClientOutputPath(
  cachedPath: string,
  workspaceRoot: string,
  rootDir: string,
  configuredOutDir: string | undefined,
  environment?: unknown,
) {
  const environmentOutDir = getEnvironmentBuildOutDir(environment);
  if (environmentOutDir) {
    const resolvedPath = normalizePath(
      resolve(workspaceRoot, rootDir, environmentOutDir),
    );
    debugNitro('resolveBuiltClientOutputPath using environment outDir', {
      cachedPath,
      workspaceRoot,
      rootDir,
      configuredOutDir,
      environmentOutDir,
      resolvedPath,
    });
    return resolvedPath;
  }

  debugNitro('resolveBuiltClientOutputPath falling back to shared resolver', {
    cachedPath,
    workspaceRoot,
    rootDir,
    configuredOutDir,
    environmentOutDir,
  });
  return resolveClientOutputPath(
    cachedPath,
    workspaceRoot,
    rootDir,
    configuredOutDir,
  );
}

function getNitroPublicOutputDir(nitroConfig: NitroConfig): string {
  const publicDir = nitroConfig.output?.publicDir;
  if (!publicDir) {
    throw new Error(
      'Nitro public output directory is required to build the sitemap.',
    );
  }

  return publicDir;
}

function readDirectoryEntries(path: string): string[] {
  try {
    return readdirSync(path).sort();
  } catch (error) {
    return [
      `<<unable to read directory: ${error instanceof Error ? error.message : String(error)}>>`,
    ];
  }
}

function getPathDebugInfo(path: string) {
  return {
    rawPath: path,
    normalizedPath: normalizePath(path),
    exists: existsSync(path),
    entries: existsSync(path) ? readDirectoryEntries(path) : [],
  };
}

function assetSourceToString(source: string | Uint8Array) {
  return typeof source === 'string'
    ? source
    : Buffer.from(source).toString('utf8');
}

function captureClientIndexHtmlFromBundle(
  bundle: Record<
    string,
    {
      type?: string;
      fileName?: string;
      source?: string | Uint8Array;
    }
  >,
  hook: 'generateBundle' | 'writeBundle',
) {
  const indexHtmlAsset = Object.values(bundle).find(
    (chunk) =>
      chunk.type === 'asset' &&
      chunk.fileName === 'index.html' &&
      typeof chunk.source !== 'undefined',
  );

  if (!indexHtmlAsset?.source) {
    debugNitro(`client bundle did not expose index.html during ${hook}`, {
      hook,
      bundleKeys: Object.keys(bundle).sort(),
      assetFileNames: Object.values(bundle)
        .filter((chunk) => chunk.type === 'asset')
        .map((chunk) => chunk.fileName)
        .filter(Boolean),
    });
    return undefined;
  }

  const indexHtml = assetSourceToString(indexHtmlAsset.source);
  debugNitro(`captured client bundle index.html asset during ${hook}`, {
    hook,
    fileName: indexHtmlAsset.fileName,
    htmlLength: indexHtml.length,
  });
  return indexHtml;
}

// Nitro only needs the HTML template string. Prefer the on-disk file when it
// exists, but allow the captured client asset to cover build flows where the
// client output directory disappears before Nitro assembles its virtual modules.
function registerIndexHtmlVirtual(
  nitroConfig: NitroConfig,
  clientOutputPath: string,
  inlineIndexHtml?: string,
) {
  const indexHtmlPath = resolve(clientOutputPath, 'index.html');
  debugNitro('registerIndexHtmlVirtual inspecting client output', {
    platform: process.platform,
    cwd: process.cwd(),
    clientOutputPath,
    clientOutputPathInfo: getPathDebugInfo(clientOutputPath),
    indexHtmlPath,
    indexHtmlExists: existsSync(indexHtmlPath),
    hasInlineIndexHtml: typeof inlineIndexHtml === 'string',
  });
  if (!existsSync(indexHtmlPath) && typeof inlineIndexHtml !== 'string') {
    debugNitro('registerIndexHtmlVirtual missing index.html', {
      platform: process.platform,
      cwd: process.cwd(),
      clientOutputPath,
      clientOutputPathInfo: getPathDebugInfo(clientOutputPath),
      indexHtmlPath,
      hasInlineIndexHtml: typeof inlineIndexHtml === 'string',
      nitroOutput: nitroConfig.output,
      nitroPublicAssets: nitroConfig.publicAssets,
    });
    throw new Error(
      `[analog] Client build output not found at ${indexHtmlPath}.\n` +
        `Ensure the client environment build completed successfully before the server build.`,
    );
  }
  const indexHtml =
    typeof inlineIndexHtml === 'string'
      ? inlineIndexHtml
      : readFileSync(indexHtmlPath, 'utf8');
  debugNitro('registerIndexHtmlVirtual using HTML template source', {
    source:
      typeof inlineIndexHtml === 'string'
        ? 'captured client bundle asset'
        : 'client output index.html file',
    indexHtmlPath,
  });
  nitroConfig.virtual = {
    ...nitroConfig.virtual,
    '#analog/index': `export default ${JSON.stringify(indexHtml)};`,
  };
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
  let clientIndexHtml: string | undefined;
  let legacyClientSubBuild = false;
  const rollupExternalEntries: string[] = [];
  const sitemapRoutes: string[] = [];
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
        rollupExternalEntries.length = 0;
        clientIndexHtml = undefined;
        sitemapRoutes.length = 0;
        for (const key of Object.keys(routeSitemaps)) {
          delete routeSitemaps[key];
        }
        for (const key of Object.keys(routeSourceFiles)) {
          delete routeSourceFiles[key];
        }

        const resolvedConfigRoot = config.root
          ? resolve(workspaceRoot, config.root)
          : workspaceRoot;
        rootDir = relative(workspaceRoot, resolvedConfigRoot) || '.';
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
        );
        debugNitro('nitro config resolved client output path', {
          platform: process.platform,
          workspaceRoot,
          configRoot: config.root,
          resolvedConfigRoot,
          rootDir,
          buildOutDir: config.build?.outDir,
          clientOutputPath,
          resolvedClientOutputPath,
          hasEnvironmentConfig: !!config.environments,
          clientEnvironmentOutDir:
            config.environments?.['client'] &&
            typeof config.environments['client'] === 'object' &&
            'build' in config.environments['client']
              ? (
                  config.environments['client'] as {
                    build?: { outDir?: string };
                  }
                ).build?.outDir
              : undefined,
        });

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
            '#ANALOG_SSR_RENDERER': ssrRenderer(),
            '#ANALOG_CLIENT_RENDERER': clientRenderer(),
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
          debugNitro(
            'nitro config cached client output path for later SSR/Nitro build',
            {
              ssrBuild,
              isTest,
              clientOutputPath,
            },
          );
        }

        // Start with a clean alias map. #analog/index is registered as a Nitro
        // virtual module after the client build, inlining the HTML template so
        // the server bundle imports it instead of using readFileSync with an
        // absolute path.
        nitroConfig.alias = {};

        if (isBuild) {
          nitroConfig.publicAssets = [
            { dir: normalizePath(resolvedClientOutputPath), maxAge: 0 },
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
            const hasExplicitPrerenderRoutes =
              typeof prerenderRoutes === 'function' ||
              Array.isArray(prerenderRoutes);
            if (
              isArrayWithElements<string | PrerenderContentDir>(prerenderRoutes)
            ) {
              routes = prerenderRoutes;
            } else if (typeof prerenderRoutes === 'function') {
              routes = await prerenderRoutes();
            }

            const resolvedPrerenderRoutes = routes.reduce<string[]>(
              (prev, current) => {
                if (!current) {
                  return prev;
                }
                if (typeof current === 'string') {
                  prev.push(current);
                  sitemapRoutes.push(current);
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
                  sitemapRoutes.push(current.route);

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
                    sitemapRoutes.push(result);

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

            nitroConfig.prerender.routes =
              hasExplicitPrerenderRoutes || resolvedPrerenderRoutes.length
                ? resolvedPrerenderRoutes
                : (nitroConfig.prerender.routes ?? []);
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
          // top-level `build.ssr` flag. That works for SSR-only builds but
          // misses two Vite 6+ paths:
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
          // The widened condition covers all supported build paths:
          //   - `ssrBuild`                             → SSR-only build
          //   - `options?.ssr`                         → Environment API SSR
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
              // sharp is a native module with platform-specific binaries
              // (e.g. @img/sharp-darwin-arm64).  pnpm creates symlinks for
              // ALL optional platform deps but only installs the matching
              // one — leaving broken symlinks that crash Nitro's bundler
              // with ENOENT during realpath().  Externalizing sharp avoids
              // bundling it entirely; it resolves from node_modules at
              // runtime instead.
              'sharp',
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

        // Only configure Vite 8 environments + builder on the top-level
        // build invocation. When buildApp's builder.build() calls re-enter
        // the config hook, returning environments/builder again would create
        // recursive buildApp invocations — each nesting another client build
        // that re-triggers config, producing an infinite loop of
        // "building client environment... ✓ 1 modules transformed".
        //
        // environmentBuild — already inside a buildApp call (recursion guard)
        // ssrBuild         — legacy SSR-only sub-build
        // isServe          — dev server / Vitest test runner (command: 'serve')
        if (environmentBuild || ssrBuild || isServe) {
          return {};
        }

        return {
          environments: {
            client: {
              build: {
                outDir:
                  config?.build?.outDir ||
                  resolve(workspaceRoot, 'dist', rootDir, 'client'),
                emptyOutDir: true,
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
                // Preserve the client build output. The client environment is
                // built first and Nitro reads its index.html after SSR finishes.
                emptyOutDir: false,
              },
            },
          },
          builder: {
            sharedPlugins: true,
            buildApp: async (builder) => {
              environmentBuild = true;
              debugNitro('builder.buildApp starting', {
                platform: process.platform,
                workspaceRoot,
                rootDir,
                cachedClientOutputPath: clientOutputPath,
                configuredBuildOutDir: config.build?.outDir,
                clientEnvironmentOutDir: getEnvironmentBuildOutDir(
                  builder.environments['client'],
                ),
                ssrEnvironmentOutDir: getEnvironmentBuildOutDir(
                  builder.environments['ssr'],
                ),
              });

              // Client must complete before SSR — the server build reads the
              // client's index.html via registerIndexHtmlVirtual(). Running
              // them in parallel caused a race on Windows where emptyOutDir
              // could delete client output before the server read it.
              await builder.build(builder.environments['client']);
              const postClientBuildOutputPath = resolveBuiltClientOutputPath(
                clientOutputPath,
                workspaceRoot,
                rootDir,
                config.build?.outDir,
                builder.environments['client'],
              );
              // Capture the client template before any SSR/prerender work runs.
              // On Windows, later phases can leave the client output directory
              // unavailable even though the client build itself succeeded.
              registerIndexHtmlVirtual(
                nitroConfig,
                postClientBuildOutputPath,
                clientIndexHtml,
              );
              debugNitro('builder.buildApp completed client build', {
                postClientBuildOutputPath,
                postClientBuildOutputInfo: getPathDebugInfo(
                  postClientBuildOutputPath,
                ),
                postClientBuildIndexHtmlPath: resolve(
                  postClientBuildOutputPath,
                  'index.html',
                ),
                postClientBuildIndexHtmlExists: existsSync(
                  resolve(postClientBuildOutputPath, 'index.html'),
                ),
              });

              if (options?.ssr || nitroConfig.prerender?.routes?.length) {
                debugSsr('builder.buildApp starting SSR build', {
                  ssrEnabled: options?.ssr,
                  prerenderRoutes: nitroConfig.prerender?.routes,
                });
                await builder.build(builder.environments['ssr']);
                debugSsr('builder.buildApp completed SSR build', {
                  ssrOutputPath:
                    options?.ssrBuildDir ||
                    resolve(workspaceRoot, 'dist', rootDir, 'ssr'),
                });
              }

              applySsrEntryAlias(nitroConfig, options, workspaceRoot, rootDir);

              const resolvedClientOutputPath = resolveBuiltClientOutputPath(
                clientOutputPath,
                workspaceRoot,
                rootDir,
                config.build?.outDir,
                builder.environments['client'],
              );

              nitroConfig.publicAssets = [
                { dir: normalizePath(resolvedClientOutputPath), maxAge: 0 },
              ];
              debugNitro(
                'builder.buildApp resolved final client output path before Nitro build',
                {
                  resolvedClientOutputPath,
                  resolvedClientOutputInfo: getPathDebugInfo(
                    resolvedClientOutputPath,
                  ),
                  nitroPublicAssets: nitroConfig.publicAssets,
                },
              );

              await buildServer(options, nitroConfig, routeSourceFiles);

              if (
                nitroConfig.prerender?.routes?.length &&
                options?.prerender?.sitemap
              ) {
                console.log('Building Sitemap...');
                // sitemap needs to be built after all directories are built
                await buildSitemap(
                  config,
                  options.prerender.sitemap,
                  sitemapRoutes.length
                    ? sitemapRoutes
                    : nitroConfig.prerender.routes,
                  getNitroPublicOutputDir(nitroConfig),
                  routeSitemaps,
                  { apiPrefix: options?.apiPrefix || 'api' },
                );
              }

              console.log(
                `\n\nThe '@analogjs/platform' server has been successfully built.`,
              );
            },
          },
        };
      },
      generateBundle(
        _options,
        bundle: Record<
          string,
          {
            type?: string;
            fileName?: string;
            source?: string | Uint8Array;
          }
        >,
      ) {
        if (!isBuild || ssrBuild) {
          return;
        }

        clientIndexHtml =
          captureClientIndexHtmlFromBundle(bundle, 'generateBundle') ??
          clientIndexHtml;
      },
      writeBundle(
        _options,
        bundle: Record<
          string,
          {
            type?: string;
            fileName?: string;
            source?: string | Uint8Array;
          }
        >,
      ) {
        if (!isBuild || ssrBuild) {
          return;
        }

        clientIndexHtml =
          captureClientIndexHtmlFromBundle(bundle, 'writeBundle') ??
          clientIndexHtml;
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
          const nitroSourceRoots = [
            normalizePath(
              resolve(workspaceRoot, rootDir, `${sourceRoot}/server`),
            ),
            ...(options?.additionalAPIDirs || []).map((dir) =>
              normalizePath(`${workspaceRoot}${dir}`),
            ),
          ];
          const isNitroSourceFile = (path: string) => {
            const normalizedPath = normalizePath(path);
            return nitroSourceRoots.some(
              (root) =>
                normalizedPath === root ||
                normalizedPath.startsWith(`${root}/`),
            );
          };
          let nitroRebuildPromise: Promise<void> | undefined;
          let nitroRebuildPending = false;
          const rebuildNitroServer = () => {
            if (nitroRebuildPromise) {
              // Coalesce rapid file events so a save that touches multiple server
              // route files results in one follow-up rebuild instead of many.
              nitroRebuildPending = true;
              return nitroRebuildPromise;
            }

            nitroRebuildPromise = (async () => {
              do {
                nitroRebuildPending = false;
                // Nitro API routes are not part of Vite's normal client HMR graph,
                // so rebuild the Nitro dev server to pick up handler edits.
                await build(nitro);
              } while (nitroRebuildPending);

              // Reload the page after the server rebuild completes so the next
              // request observes the updated API route implementation.
              viteServer.ws.send({ type: 'full-reload' });
            })()
              .catch((error: unknown) => {
                viteServer.config.logger.error(
                  `[analog] Failed to rebuild Nitro dev server.\n${error instanceof Error ? error.stack || error.message : String(error)}`,
                );
              })
              .finally(() => {
                nitroRebuildPromise = undefined;
              });

            return nitroRebuildPromise;
          };
          const onNitroSourceChange = (path: string) => {
            if (!isNitroSourceFile(path)) {
              return;
            }

            void rebuildNitroServer();
          };

          // Watch the full Nitro source roots instead of only the API route
          // directory. API handlers often read helper modules, shared data, or
          // middleware from elsewhere under `src/server`, and those edits should
          // still rebuild the Nitro dev server and refresh connected browsers.
          viteServer.watcher.on('add', onNitroSourceChange);
          viteServer.watcher.on('change', onNitroSourceChange);
          viteServer.watcher.on('unlink', onNitroSourceChange);

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
            debugNitro('experimental websocket upgrade handler enabled');
            viteServer.httpServer?.on('upgrade', server.upgrade);
          }

          console.log(
            `\n\nThe server endpoints are accessible under the "${prefix}${apiPrefix}" path.`,
          );
        }
      },

      async closeBundle() {
        if (legacyClientSubBuild) {
          return;
        }

        // When builder.buildApp ran, it already handled the full
        // client → SSR → Nitro pipeline. Skip to avoid double work.
        if (environmentBuild) {
          return;
        }

        // SSR sub-build — Vite re-enters the plugin with build.ssr;
        // Nitro server assembly happens only after the client pass.
        if (ssrBuild) {
          return;
        }

        // Nx executors (and any caller that runs `vite build` without
        // the Environment API) never trigger builder.buildApp, so
        // closeBundle is the only place to drive the SSR + Nitro build.
        if (isBuild) {
          const resolvedClientOutputPath = resolveClientOutputPath(
            clientOutputPath,
            workspaceRoot,
            rootDir,
            config.build?.outDir,
          );
          debugNitro(
            'closeBundle resolved client output path before legacy SSR build',
            {
              platform: process.platform,
              workspaceRoot,
              rootDir,
              cachedClientOutputPath: clientOutputPath,
              configuredBuildOutDir: config.build?.outDir,
              resolvedClientOutputPath,
              resolvedClientOutputInfo: getPathDebugInfo(
                resolvedClientOutputPath,
              ),
            },
          );
          const indexHtmlPath = resolve(resolvedClientOutputPath, 'index.html');
          if (
            !existsSync(indexHtmlPath) &&
            typeof clientIndexHtml !== 'string'
          ) {
            debugNitro(
              'closeBundle rebuilding missing client output before SSR/Nitro',
              {
                platform: process.platform,
                workspaceRoot,
                rootDir,
                configuredBuildOutDir: config.build?.outDir,
                resolvedClientOutputPath,
                indexHtmlPath,
              },
            );
            legacyClientSubBuild = true;
            try {
              await buildClientApp(config, options);
            } finally {
              legacyClientSubBuild = false;
            }
          }
          // Capture the client HTML before kicking off the standalone SSR build.
          // This mirrors the successful sequencing from before the closeBundle
          // refactor and avoids depending on the client directory surviving the
          // nested SSR build on Windows.
          registerIndexHtmlVirtual(
            nitroConfig,
            resolvedClientOutputPath,
            clientIndexHtml,
          );

          if (options?.ssr) {
            console.log('Building SSR application...');
            await buildSSRApp(config, options);
            debugSsr('closeBundle completed standalone SSR build', {
              ssrBuildDir:
                options?.ssrBuildDir ||
                resolve(workspaceRoot, 'dist', rootDir, 'ssr'),
              clientOutputPathInfo: clientOutputPath
                ? getPathDebugInfo(clientOutputPath)
                : null,
            });
          }

          applySsrEntryAlias(nitroConfig, options, workspaceRoot, rootDir);
          debugNitro(
            'closeBundle resolved client output path before Nitro build',
            {
              platform: process.platform,
              workspaceRoot,
              rootDir,
              cachedClientOutputPath: clientOutputPath,
              configuredBuildOutDir: config.build?.outDir,
              resolvedClientOutputPath,
              resolvedClientOutputInfo: getPathDebugInfo(
                resolvedClientOutputPath,
              ),
            },
          );
          registerIndexHtmlVirtual(
            nitroConfig,
            resolvedClientOutputPath,
            clientIndexHtml,
          );

          await buildServer(options, nitroConfig, routeSourceFiles);

          if (
            nitroConfig.prerender?.routes?.length &&
            options?.prerender?.sitemap
          ) {
            console.log('Building Sitemap...');
            await buildSitemap(
              config,
              options.prerender.sitemap,
              sitemapRoutes.length
                ? sitemapRoutes
                : nitroConfig.prerender.routes,
              getNitroPublicOutputDir(nitroConfig),
              routeSitemaps,
              { apiPrefix: options?.apiPrefix || 'api' },
            );
          }

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

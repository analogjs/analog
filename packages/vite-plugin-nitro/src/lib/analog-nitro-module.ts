/**
 * Analog NitroModule — configures Angular-specific behavior on a Nitro instance.
 *
 * This module is designed to be used with Nitro's first-party Vite plugin
 * (`nitro/vite`) via the `plugin.nitro` pattern:
 *
 * ```ts
 * import { nitro } from 'nitro/vite';
 *
 * export default defineConfig({
 *   plugins: [
 *     ...nitro(config),
 *     {
 *       name: '@analogjs/nitro',
 *       nitro: analogNitroModule(options),
 *     },
 *   ],
 * });
 * ```
 */
import type { NitroConfig, RollupConfig } from 'nitro/types';
import { normalizePath } from 'vite';
import { dirname, join, resolve } from 'node:path';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';

import type {
  Options,
  PrerenderContentDir,
  PrerenderContentFile,
  PrerenderRouteConfig,
  PrerenderSitemapConfig,
} from './options.js';
import { getPageHandlers } from './utils/get-page-handlers.js';
import {
  ssrRenderer,
  clientRenderer,
  apiMiddleware,
} from './utils/renderers.js';
import { pageEndpointsPlugin } from './plugins/page-endpoints.js';
import { getMatchingContentFilesWithFrontMatter } from './utils/get-content-files.js';
import { buildSitemap } from './build-sitemap.js';
import { isVercelPreset, isNetlifyPreset } from './nitro-config-factory.js';

interface NitroModule {
  name?: string;
  setup: (nitro: any) => void | Promise<void>;
}

/**
 * Shared state between the NitroModule and the Vite plugin wrapper.
 * The Vite plugin captures the client index.html during `generateBundle`
 * and the module reads it during Nitro's server build.
 */
export interface AnalogBuildState {
  clientIndexHtml?: string;
  rootDir: string;
  resolvedPrerenderRoutes: string[];
  sitemapRoutes: string[];
  routeSitemaps: Record<
    string,
    PrerenderSitemapConfig | (() => PrerenderSitemapConfig)
  >;
  routeSourceFiles: Record<string, string>;
}

export function createAnalogBuildState(): AnalogBuildState {
  return {
    rootDir: '.',
    resolvedPrerenderRoutes: [],
    sitemapRoutes: [],
    routeSitemaps: {},
    routeSourceFiles: {},
  };
}

export function analogNitroModule(
  options: Options | undefined,
  state: AnalogBuildState,
): NitroModule {
  const workspaceRoot = options?.workspaceRoot ?? process.cwd();
  const sourceRoot = options?.sourceRoot ?? 'src';
  const apiPrefix = `/${options?.apiPrefix || 'api'}`;
  const baseURL = process.env['NITRO_APP_BASE_URL'] || '';
  const prefix = baseURL ? baseURL.substring(0, baseURL.length - 1) : '';
  const useAPIMiddleware =
    typeof options?.useAPIMiddleware !== 'undefined'
      ? options?.useAPIMiddleware
      : true;

  return {
    name: 'analog',
    async setup(nitro) {
      // rootDir is set by the Vite plugin's config() hook which runs
      // before nitro:init's config() hook (and thus before this setup).
      const rootDir = state.rootDir || nitro.options.rootDir || '.';

      // Update output paths now that rootDir is resolved.
      // The initial NitroConfig was created with rootDir='.' before
      // the Vite config's `root` was available.
      nitro.options.rootDir = normalizePath(rootDir);
      nitro.options.output = nitro.options.output || {};
      nitro.options.output.dir = normalizePath(
        resolve(workspaceRoot, 'dist', rootDir, 'analog'),
      );
      nitro.options.output.publicDir = normalizePath(
        resolve(workspaceRoot, 'dist', rootDir, 'analog/public'),
      );
      nitro.options.buildDir = normalizePath(
        resolve(workspaceRoot, 'dist', rootDir, '.nitro'),
      );

      // Apply preset-specific output path overrides
      const preset = nitro.options.preset;
      if (isVercelPreset(preset)) {
        nitro.options.output.dir = normalizePath(
          resolve(workspaceRoot, '.vercel', 'output'),
        );
        nitro.options.output.publicDir = normalizePath(
          resolve(workspaceRoot, '.vercel', 'output/static'),
        );
      }
      if (
        isNetlifyPreset(preset) &&
        rootDir === '.' &&
        !existsSync(resolve(workspaceRoot, 'netlify.toml'))
      ) {
        nitro.options.output.dir = normalizePath(
          resolve(workspaceRoot, 'netlify/functions'),
        );
      }

      const hasAPIDir = existsSync(
        resolve(
          workspaceRoot,
          rootDir,
          `${sourceRoot}/server/routes/${options?.apiPrefix || 'api'}`,
        ),
      );
      const sourceSsrEntry = normalizePath(
        options?.entryServer ||
          resolve(workspaceRoot, rootDir, `${sourceRoot}/main.server.ts`),
      );

      // ── Renderer ──────────────────────────────────────────────
      nitro.options.virtual = nitro.options.virtual || {};
      nitro.options.virtual['#ANALOG_SSR_RENDERER'] =
        ssrRenderer(sourceSsrEntry);
      nitro.options.virtual['#ANALOG_CLIENT_RENDERER'] = clientRenderer();
      if (!hasAPIDir) {
        nitro.options.virtual['#ANALOG_API_MIDDLEWARE'] = apiMiddleware;
      }

      const rendererHandler = options?.ssr
        ? '#ANALOG_SSR_RENDERER'
        : '#ANALOG_CLIENT_RENDERER';
      // Set the renderer handler so nitro/vite doesn't auto-detect one.
      nitro.options.renderer = nitro.options.renderer || {};
      nitro.options.renderer.handler = rendererHandler;

      // ── Handlers ──────────────────────────────────────────────
      const pageHandlers = getPageHandlers({
        workspaceRoot,
        sourceRoot,
        rootDir,
        additionalPagesDirs: options?.additionalPagesDirs,
        hasAPIDir,
      });

      nitro.options.handlers = nitro.options.handlers || [];
      if (!hasAPIDir && useAPIMiddleware) {
        nitro.options.handlers.push({
          route: '/**',
          handler: '#ANALOG_API_MIDDLEWARE',
          middleware: true,
        });
      }
      nitro.options.handlers.push(...pageHandlers);
      nitro.options.handlers.push({
        handler: rendererHandler,
        route: '/**',
        lazy: true,
      });

      // ── Route rules ───────────────────────────────────────────
      if (!hasAPIDir && !useAPIMiddleware) {
        nitro.options.routeRules = nitro.options.routeRules || {};
        nitro.options.routeRules[`${prefix}${apiPrefix}/**`] = {
          proxy: { to: '/**' },
        };
      }

      // ── Scan dirs ─────────────────────────────────────────────
      nitro.options.scanDirs = nitro.options.scanDirs || [];
      nitro.options.scanDirs.push(
        normalizePath(`${rootDir}/${sourceRoot}/server`),
      );
      if (options?.additionalAPIDirs) {
        for (const dir of options.additionalAPIDirs) {
          nitro.options.scanDirs.push(normalizePath(`${workspaceRoot}${dir}`));
        }
      }

      // ── Page endpoints Rollup plugin ──────────────────────────
      nitro.options.rollupConfig = nitro.options.rollupConfig || {};
      nitro.options.rollupConfig.plugins =
        nitro.options.rollupConfig.plugins || [];
      if (Array.isArray(nitro.options.rollupConfig.plugins)) {
        nitro.options.rollupConfig.plugins.push(pageEndpointsPlugin());
      }

      // Suppress empty chunk warnings for .server files
      nitro.options.rollupConfig.onwarn = (warning: { message: string }) => {
        if (
          warning.message.includes('empty chunk') &&
          warning.message.endsWith('.server')
        ) {
          return;
        }
      };

      // ── Module side effects ───────────────────────────────────
      if (options?.ssr || nitro.options.prerender?.routes?.length) {
        nitro.options.moduleSideEffects = [
          'zone.js/node',
          'zone.js/fesm2015/zone-node',
        ];

        if (process.platform === 'win32') {
          nitro.options.noExternals = appendNoExternals(
            nitro.options.noExternals,
            'std-env',
          );
        }
      }

      // ── Lazy virtual module resolution ────────────────────────
      // These Rollup plugins resolve #analog/index and #analog/ssr
      // at build time. Since nitro/vite builds client → SSR → nitro
      // sequentially, the files exist on disk when the nitro
      // environment builds.
      nitro.options.rollupConfig.plugins.push({
        name: 'analog-index-html-virtual',
        resolveId(id: string) {
          if (id === '#analog/index') return '\0#analog/index';
          return undefined;
        },
        load(id: string) {
          if (id !== '\0#analog/index') return;
          // Prefer in-memory capture (handles Windows race conditions)
          if (state.clientIndexHtml) {
            return `export default ${JSON.stringify(state.clientIndexHtml)};`;
          }
          // Fall back to reading from disk
          const publicDir = nitro.options.output?.publicDir;
          const clientOutDir = resolve(
            workspaceRoot,
            'dist',
            rootDir,
            'client',
          );
          for (const dir of [publicDir, clientOutDir]) {
            if (!dir) continue;
            const indexPath = resolve(dir, 'index.html');
            if (existsSync(indexPath)) {
              const html = readFileSync(indexPath, 'utf8');
              return `export default ${JSON.stringify(html)};`;
            }
          }
          // In dev mode, read from the source index.html
          const sourceIndex = resolve(
            workspaceRoot,
            rootDir,
            options?.index || 'index.html',
          );
          if (existsSync(sourceIndex)) {
            const html = readFileSync(sourceIndex, 'utf8');
            return `export default ${JSON.stringify(html)};`;
          }
          // Return empty template as fallback (dev mode)
          if (nitro.options.dev) {
            return 'export default "";';
          }
          throw new Error(
            '[analog] Client build output not found. Ensure the client environment build completed successfully.',
          );
        },
      });

      // Set #analog/ssr alias via Nitro config (not Rollup plugin) so it
      // applies to both server and prerender builds. The alias is resolved
      // lazily via a build:before hook since the SSR entry doesn't exist
      // until after the SSR environment build completes.
      nitro.hooks.hook('build:before', () => {
        if (!options?.ssr && !nitro.options.prerender?.routes?.length) return;
        const ssrOutDir =
          options?.ssrBuildDir ||
          resolve(workspaceRoot, 'dist', rootDir, 'ssr');
        const nitroSsrDir = resolve(
          workspaceRoot,
          'dist',
          rootDir,
          '.nitro/vite/services/ssr',
        );
        const candidates = [
          resolve(ssrOutDir, 'main.server.mjs'),
          resolve(ssrOutDir, 'main.server.js'),
          resolve(nitroSsrDir, 'index.mjs'),
        ];
        const ssrEntryPath = candidates.find((p) => existsSync(p));
        if (ssrEntryPath) {
          nitro.options.alias = nitro.options.alias || {};
          nitro.options.alias['#analog/ssr'] = normalizePath(ssrEntryPath);
        }
      });

      // ── Externals and bundler config sanitization ─────────────
      nitro.hooks.hook(
        'rollup:before',
        (_n: unknown, bundlerConfig: RollupConfig) => {
          sanitizeNitroBundlerConfig(bundlerConfig);

          if (!options?.ssr && !nitro.options.prerender?.routes?.length) return;

          const externalEntries = ['rxjs', 'node-fetch-native/dist/polyfill'];
          const isExternal = (source: string) =>
            externalEntries.some(
              (entry) => source === entry || source.startsWith(entry + '/'),
            );

          const existing = bundlerConfig.external;
          if (typeof existing === 'function') {
            const originalFn = existing;
            bundlerConfig.external = (
              source: string,
              importer: string | undefined,
              isResolved: boolean,
            ) => {
              if (isExternal(source)) return true;
              return (originalFn as (...args: unknown[]) => unknown)(
                source,
                importer,
                isResolved,
              );
            };
          } else if (Array.isArray(existing)) {
            bundlerConfig.external = [
              ...existing,
              ...externalEntries,
            ] as string[];
          } else if (existing) {
            bundlerConfig.external = [
              ...(typeof existing === 'string' ? [existing] : []),
              ...externalEntries,
            ];
          } else {
            bundlerConfig.external = externalEntries;
          }
        },
      );

      // ── Prerendering ──────────────────────────────────────────
      await resolveAndRegisterPrerenderRoutes(
        nitro,
        options,
        state,
        workspaceRoot,
        rootDir,
        apiPrefix,
      );

      // ── Post-rendering hooks ──────────────────────────────────
      if (options?.prerender?.postRenderingHooks) {
        for (const hook of options.prerender.postRenderingHooks) {
          nitro.hooks.hook('prerender:generate', hook);
        }
      }

      // ── SSR tsconfig for OXC resolver ─────────────────────────
      nitro.hooks.hook('build:before', () => {
        ensureSsrTsconfig(options, workspaceRoot, rootDir);
      });

      // ── Remove root index.html before prerender ───────────────
      nitro.hooks.hook('prerender:init', () => {
        if (
          options?.ssr &&
          nitro.options.prerender?.routes &&
          nitro.options.prerender.routes.find((route: string) => route === '/')
        ) {
          const publicDir = nitro.options.output?.publicDir ?? '';
          for (const ext of ['', '.br', '.gz']) {
            rmSync(join(publicDir, `index.html${ext}`), { force: true });
          }
        }
      });

      // ── Route source files output ─────────────────────────────
      nitro.hooks.hook('prerender:done', () => {
        if (Object.keys(state.routeSourceFiles).length > 0) {
          const publicDir = nitro.options.output?.publicDir;
          if (!publicDir) return;
          for (const [route, content] of Object.entries(
            state.routeSourceFiles,
          )) {
            const outputPath = join(publicDir, `${route}.md`);
            mkdirSync(dirname(outputPath), { recursive: true });
            writeFileSync(outputPath, content, 'utf8');
          }
        }
      });

      // ── Vercel function config ────────────────────────────────
      nitro.hooks.hook('compiled', () => {
        ensureVercelFunctionConfig(nitro);
      });

      // ── Sitemap generation ────────────────────────────────────
      nitro.hooks.hook('close', async () => {
        if (
          nitro.options.prerender?.routes?.length &&
          options?.prerender?.sitemap
        ) {
          console.log('Building Sitemap...');
          const publicDir = nitro.options.output?.publicDir;
          if (!publicDir) return;
          await buildSitemap(
            {},
            options.prerender.sitemap,
            state.sitemapRoutes.length
              ? state.sitemapRoutes
              : nitro.options.prerender.routes,
            publicDir,
            state.routeSitemaps,
            { apiPrefix: options?.apiPrefix || 'api' },
          );
        }
      });

      // ── Success message ───────────────────────────────────────
      nitro.hooks.hook('close', () => {
        console.log(
          `\n\nThe '@analogjs/platform' server has been successfully built.`,
        );
      });
    },
  };
}

// ── Helpers ─────────────────────────────────────────────────────────

async function resolveAndRegisterPrerenderRoutes(
  nitro: any,
  options: Options | undefined,
  state: AnalogBuildState,
  workspaceRoot: string,
  rootDir: string,
  apiPrefix: string,
) {
  if (!options?.prerender) {
    if (isEmptyPrerenderRoutes(options)) {
      nitro.options.prerender = nitro.options.prerender || {};
      nitro.options.prerender.routes = ['/'];
    }
    return;
  }

  nitro.options.prerender = nitro.options.prerender || {};
  nitro.options.prerender.crawlLinks = options.prerender.discover;

  let routes: (
    | string
    | PrerenderContentDir
    | PrerenderRouteConfig
    | undefined
  )[] = [];

  const prerenderRoutes = options.prerender.routes;
  const hasExplicitPrerenderRoutes =
    typeof prerenderRoutes === 'function' || Array.isArray(prerenderRoutes);

  if (isArrayWithElements<string | PrerenderContentDir>(prerenderRoutes)) {
    routes = prerenderRoutes;
  } else if (typeof prerenderRoutes === 'function') {
    routes = await prerenderRoutes();
  }

  const resolvedPrerenderRoutes = routes.reduce<string[]>((prev, current) => {
    if (!current) return prev;

    if (typeof current === 'string') {
      prev.push(current);
      state.sitemapRoutes.push(current);
      return prev;
    }

    if ('route' in current) {
      if (current.sitemap) {
        state.routeSitemaps[current.route] = current.sitemap;
      }
      if (current.outputSourceFile) {
        const sourcePath = resolve(
          workspaceRoot,
          rootDir,
          current.outputSourceFile,
        );
        state.routeSourceFiles[current.route] = readFileSync(
          sourcePath,
          'utf8',
        );
      }
      prev.push(current.route);
      state.sitemapRoutes.push(current.route);
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
          state.routeSitemaps[result] =
            typeof current.sitemap === 'function'
              ? current.sitemap(f)
              : current.sitemap;
        }
        if (current.outputSourceFile) {
          const sourceContent = current.outputSourceFile(f);
          if (sourceContent) {
            state.routeSourceFiles[result] = sourceContent;
          }
        }
        prev.push(result);
        state.sitemapRoutes.push(result);
        if ('staticData' in current) {
          prev.push(`${apiPrefix}/_analog/pages/${result}`);
        }
      }
    });

    return prev;
  }, []);

  nitro.options.prerender.routes =
    hasExplicitPrerenderRoutes || resolvedPrerenderRoutes.length
      ? resolvedPrerenderRoutes
      : (nitro.options.prerender.routes ?? []);

  // Store resolved routes in shared state for the closeBundle fallback
  state.resolvedPrerenderRoutes = nitro.options.prerender.routes;
}

function resolveBuiltSsrEntryPath(ssrOutDir: string) {
  const candidates = [
    resolve(ssrOutDir, 'main.server.mjs'),
    resolve(ssrOutDir, 'main.server.js'),
    resolve(ssrOutDir, 'main.server'),
  ];

  const ssrEntryPath = candidates.find((p) => existsSync(p));
  if (!ssrEntryPath) {
    throw new Error(
      `Unable to locate the built SSR entry in "${ssrOutDir}". Expected one of: ${candidates.join(', ')}`,
    );
  }
  return ssrEntryPath;
}

function ensureSsrTsconfig(
  options: Options | undefined,
  workspaceRoot: string,
  rootDir: string,
) {
  const ssrOutDir =
    options?.ssrBuildDir || resolve(workspaceRoot, 'dist', rootDir, 'ssr');
  const tsconfigPath = join(ssrOutDir, 'tsconfig.json');

  if (existsSync(tsconfigPath)) return;
  if (!existsSync(ssrOutDir)) return;

  writeFileSync(
    tsconfigPath,
    JSON.stringify(
      { compilerOptions: { module: 'ESNext', moduleResolution: 'bundler' } },
      null,
      2,
    ),
    'utf8',
  );
}

function ensureVercelFunctionConfig(nitro: any) {
  if (!isVercelPreset(nitro.options.preset)) return;

  const serverDir = nitro.options.output.serverDir;
  const configPath = join(serverDir, '.vc-config.json');
  if (existsSync(configPath)) return;

  mkdirSync(serverDir, { recursive: true });
  writeFileSync(
    configPath,
    JSON.stringify(
      {
        handler: 'index.mjs',
        launcherType: 'Nodejs',
        shouldAddHelpers: false,
        supportsResponseStreaming: true,
        ...nitro.options.vercel?.functions,
      },
      null,
      2,
    ),
    'utf8',
  );
}

function sanitizeNitroBundlerConfig(bundlerConfig: RollupConfig) {
  const output = bundlerConfig['output'];
  if (!output || Array.isArray(output) || typeof output !== 'object') return;

  if ('codeSplitting' in output) {
    delete (output as Record<string, unknown>)['codeSplitting'];
  }
  if ('manualChunks' in output) {
    delete (output as Record<string, unknown>)['manualChunks'];
  }

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

function appendNoExternals(
  noExternals: NitroConfig['noExternals'],
  ...entries: string[]
): NitroConfig['noExternals'] {
  if (!noExternals) return entries;
  return Array.isArray(noExternals)
    ? [...noExternals, ...entries]
    : noExternals;
}

function isEmptyPrerenderRoutes(options?: Options): boolean {
  if (!options || isArrayWithElements(options?.prerender?.routes)) return false;
  return !options.prerender?.routes;
}

function isArrayWithElements<T>(arr: unknown): arr is [T, ...T[]] {
  return !!(Array.isArray(arr) && arr.length);
}

/**
 * Resolves prerender routes into the shared build state.
 * Used by the closeBundle fallback when the NitroModule's setup()
 * doesn't run (build-only mode with nitro/vite restricted to serve).
 */
export async function resolveAnalogPrerenderRoutes(
  options: Options | undefined,
  state: AnalogBuildState,
  workspaceRoot: string,
  rootDir: string,
): Promise<void> {
  if (state.resolvedPrerenderRoutes.length > 0) return;

  const apiPrefix = `/${options?.apiPrefix || 'api'}`;

  if (!options?.prerender) {
    if (isEmptyPrerenderRoutes(options)) {
      state.resolvedPrerenderRoutes = ['/'];
    }
    return;
  }

  let routes: (
    | string
    | PrerenderContentDir
    | PrerenderRouteConfig
    | undefined
  )[] = [];

  const prerenderRoutes = options.prerender.routes;
  const hasExplicitPrerenderRoutes =
    typeof prerenderRoutes === 'function' || Array.isArray(prerenderRoutes);

  if (isArrayWithElements<string | PrerenderContentDir>(prerenderRoutes)) {
    routes = prerenderRoutes;
  } else if (typeof prerenderRoutes === 'function') {
    routes = await prerenderRoutes();
  }

  const resolved = routes.reduce<string[]>((prev, current) => {
    if (!current) return prev;

    if (typeof current === 'string') {
      prev.push(current);
      state.sitemapRoutes.push(current);
      return prev;
    }

    if ('route' in current) {
      if (current.sitemap) {
        state.routeSitemaps[current.route] = current.sitemap;
      }
      if (current.outputSourceFile) {
        const sourcePath = resolve(
          workspaceRoot,
          rootDir,
          current.outputSourceFile,
        );
        state.routeSourceFiles[current.route] = readFileSync(
          sourcePath,
          'utf8',
        );
      }
      prev.push(current.route);
      state.sitemapRoutes.push(current.route);
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
          state.routeSitemaps[result] =
            typeof current.sitemap === 'function'
              ? current.sitemap(f)
              : current.sitemap;
        }
        if (current.outputSourceFile) {
          const sourceContent = current.outputSourceFile(f);
          if (sourceContent) {
            state.routeSourceFiles[result] = sourceContent;
          }
        }
        prev.push(result);
        state.sitemapRoutes.push(result);
        if ('staticData' in current) {
          prev.push(`${apiPrefix}/_analog/pages/${result}`);
        }
      }
    });
    return prev;
  }, []);

  state.resolvedPrerenderRoutes =
    hasExplicitPrerenderRoutes || resolved.length ? resolved : ['/'];
}

/**
 * Registers rollup:before hooks for bundler config sanitization and
 * externalization on a Nitro instance. Used by the closeBundle fallback
 * since the NitroModule's setup() only runs on the nitro/vite instance.
 */
export function sanitizeAndExternalize(
  nitro: any,
  needsExternals: boolean,
): void {
  nitro.hooks.hook(
    'rollup:before',
    (_n: unknown, bundlerConfig: RollupConfig) => {
      sanitizeNitroBundlerConfig(bundlerConfig);

      if (!needsExternals) return;

      const externalEntries = ['rxjs', 'node-fetch-native/dist/polyfill'];
      const isExternal = (source: string) =>
        externalEntries.some(
          (entry) => source === entry || source.startsWith(entry + '/'),
        );

      const existing = bundlerConfig.external;
      if (typeof existing === 'function') {
        const originalFn = existing;
        bundlerConfig.external = (
          source: string,
          importer: string | undefined,
          isResolved: boolean,
        ) => {
          if (isExternal(source)) return true;
          return (originalFn as (...args: unknown[]) => unknown)(
            source,
            importer,
            isResolved,
          );
        };
      } else if (Array.isArray(existing)) {
        bundlerConfig.external = [...existing, ...externalEntries] as string[];
      } else if (existing) {
        bundlerConfig.external = [
          ...(typeof existing === 'string' ? [existing] : []),
          ...externalEntries,
        ];
      } else {
        bundlerConfig.external = externalEntries;
      }
    },
  );
}

/**
 * Analog Vite Plugin — composes Nitro's first-party Vite plugin with
 * Angular-specific server behavior (SSR, API routes, prerendering).
 *
 * - Dev mode: nitro/vite handles the dev server, HMR, and API routing
 * - Build mode: closeBundle fallback handles SSR + Nitro builds
 *   (Nx executors don't trigger the Environment API buildApp flow)
 *
 * This is the default export of `@analogjs/vite-plugin-nitro`.
 */
import type { NitroConfig } from 'nitro/types';
import { nitro as nitroVitePlugin, type NitroPluginConfig } from 'nitro/vite';
import type { Plugin, UserConfig } from 'vite';
import { mergeConfig, normalizePath } from 'vite';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { Options } from './options.js';
import {
  buildNitroConfig,
  type NitroConfigContext,
} from './nitro-config-factory.js';
import { ssrRenderer } from './utils/renderers.js';
import {
  analogNitroModule,
  createAnalogBuildState,
  type AnalogBuildState,
} from './analog-nitro-module.js';
import { buildServer } from './build-server.js';
import { buildClientApp, buildSSRApp } from './build-ssr.js';
import { buildSitemap } from './build-sitemap.js';
import { getBundleOptionsKey, isRolldown } from './utils/rolldown.js';
import { pageEndpointsPlugin } from './plugins/page-endpoints.js';

function assetSourceToString(source: string | Uint8Array) {
  return typeof source === 'string'
    ? source
    : Buffer.from(source).toString('utf8');
}

export function createAnalogNitroPlugins(
  options?: Options,
  nitroOptions?: NitroConfig,
): Plugin[] {
  const workspaceRoot = options?.workspaceRoot ?? process.cwd();
  const sourceRoot = options?.sourceRoot ?? 'src';
  const baseURL = process.env['NITRO_APP_BASE_URL'] || '';
  const prefix = baseURL ? baseURL.substring(0, baseURL.length - 1) : '';
  const apiPrefix = `/${options?.apiPrefix || 'api'}`;
  const useAPIMiddleware =
    typeof options?.useAPIMiddleware !== 'undefined'
      ? options?.useAPIMiddleware
      : true;
  const isTest = process.env['NODE_ENV'] === 'test' || !!process.env['VITEST'];

  const state: AnalogBuildState = createAnalogBuildState();
  let rootDir = '.';
  let savedConfig: UserConfig | undefined;
  let legacyClientSubBuild = false;

  const getContext = (): NitroConfigContext => ({
    workspaceRoot,
    rootDir,
    sourceRoot,
    apiPrefix,
    prefix,
    hasAPIDir: existsSync(
      resolve(
        workspaceRoot,
        rootDir,
        `${sourceRoot}/server/routes/${options?.apiPrefix || 'api'}`,
      ),
    ),
    useAPIMiddleware,
  });

  const buildConfig = (): NitroPluginConfig => {
    const ctx = getContext();
    let config = buildNitroConfig(options, nitroOptions, ctx);
    const sourceSsrEntry = normalizePath(
      options?.entryServer ||
        resolve(workspaceRoot, rootDir, `${sourceRoot}/main.server.ts`),
    );
    if (options?.ssr || config.prerender?.routes?.length) {
      config.virtual = config.virtual || {};
      config.virtual['#ANALOG_SSR_RENDERER'] = ssrRenderer(sourceSsrEntry);
    }
    config = mergeConfig(config, nitroOptions as Record<string, any>);
    return config as NitroPluginConfig;
  };

  const viteRolldownOutput = options?.vite?.build?.rolldownOptions?.output;
  const viteRolldownOutputConfig =
    viteRolldownOutput && !Array.isArray(viteRolldownOutput)
      ? viteRolldownOutput
      : undefined;
  const codeSplitting = viteRolldownOutputConfig?.codeSplitting;

  return [
    // ── Plugin 1: Analog Nitro Plugin ─────────────────────────────
    {
      name: '@analogjs/vite-plugin-nitro',
      // Carry the NitroModule so nitro/vite collects it during init
      nitro: analogNitroModule(options, state),
      config(userConfig) {
        const resolvedConfigRoot = userConfig.root
          ? resolve(workspaceRoot, userConfig.root)
          : workspaceRoot;
        rootDir =
          resolvedConfigRoot === workspaceRoot
            ? '.'
            : normalizePath(
                resolve(workspaceRoot, userConfig.root || '.'),
              ).replace(normalizePath(workspaceRoot) + '/', '');
        const sourceSsrEntry = normalizePath(
          options?.entryServer ||
            resolve(workspaceRoot, rootDir, `${sourceRoot}/main.server.ts`),
        );
        state.rootDir = rootDir;
        savedConfig = userConfig;

        if (isTest) return {};

        return {
          environments: {
            client: {
              build: {
                outDir:
                  userConfig?.build?.outDir ||
                  resolve(workspaceRoot, 'dist', rootDir, 'client'),
                emptyOutDir: true,
                ...(isRolldown() && codeSplitting !== undefined
                  ? {
                      rolldownOptions: {
                        output: {
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
                emptyOutDir: false,
              },
            },
          },
        };
      },
      generateBundle(
        _options: unknown,
        bundle: Record<
          string,
          { type?: string; fileName?: string; source?: string | Uint8Array }
        >,
      ) {
        const indexHtmlAsset = Object.values(bundle).find(
          (chunk) =>
            chunk.type === 'asset' &&
            chunk.fileName === 'index.html' &&
            typeof chunk.source !== 'undefined',
        );
        if (indexHtmlAsset?.source) {
          state.clientIndexHtml = assetSourceToString(indexHtmlAsset.source);
        }
      },
      writeBundle(
        _options: unknown,
        bundle: Record<
          string,
          { type?: string; fileName?: string; source?: string | Uint8Array }
        >,
      ) {
        const indexHtmlAsset = Object.values(bundle).find(
          (chunk) =>
            chunk.type === 'asset' &&
            chunk.fileName === 'index.html' &&
            typeof chunk.source !== 'undefined',
        );
        if (indexHtmlAsset?.source) {
          state.clientIndexHtml = assetSourceToString(indexHtmlAsset.source);
        }
      },

      // ── closeBundle: production build orchestration ─────────────
      // When nitro/vite's buildApp doesn't fire (Nx executors),
      // this drives the SSR → Nitro build pipeline.
      async closeBundle() {
        if (isTest || legacyClientSubBuild) return;

        const ssrBuild = (this as any).environment?.name === 'ssr';
        if (ssrBuild) return;

        const nitroOutputPath = resolve(
          workspaceRoot,
          'dist',
          rootDir,
          'analog/server/index.mjs',
        );
        if (existsSync(nitroOutputPath)) return;

        // Resolve client output path
        const resolvedClientOutputPath = savedConfig?.build?.outDir
          ? normalizePath(
              resolve(workspaceRoot, rootDir, savedConfig.build.outDir),
            )
          : normalizePath(resolve(workspaceRoot, 'dist', rootDir, 'client'));

        const indexHtmlPath = resolve(resolvedClientOutputPath, 'index.html');
        if (
          !existsSync(indexHtmlPath) &&
          typeof state.clientIndexHtml !== 'string'
        ) {
          legacyClientSubBuild = true;
          try {
            await buildClientApp(savedConfig || {}, options);
          } finally {
            legacyClientSubBuild = false;
          }
        }

        if (typeof state.clientIndexHtml !== 'string') {
          const htmlPath = resolve(resolvedClientOutputPath, 'index.html');
          if (existsSync(htmlPath)) {
            state.clientIndexHtml = readFileSync(htmlPath, 'utf8');
          }
        }

        // Resolve prerender routes
        const { resolveAnalogPrerenderRoutes } =
          await import('./analog-nitro-module.js');
        await resolveAnalogPrerenderRoutes(
          options,
          state,
          workspaceRoot,
          rootDir,
        );

        // Build Nitro config
        const ctx = getContext();
        let nitroConfig = buildNitroConfig(options, nitroOptions, ctx);
        nitroConfig = mergeConfig(
          nitroConfig,
          nitroOptions as Record<string, any>,
        );

        // Register client HTML virtual module
        nitroConfig.virtual = nitroConfig.virtual || {};
        nitroConfig.virtual['#analog/index'] = `export default ${JSON.stringify(
          state.clientIndexHtml || '',
        )};`;

        // Build SSR
        if (options?.ssr || state.resolvedPrerenderRoutes.length > 0) {
          console.log('Building SSR application...');
          await buildSSRApp(savedConfig || {}, options);
        }

        // Set SSR entry alias
        const ssrOutDir =
          options?.ssrBuildDir ||
          resolve(workspaceRoot, 'dist', rootDir, 'ssr');
        if (options?.ssr || state.resolvedPrerenderRoutes.length > 0) {
          const candidates = [
            resolve(ssrOutDir, 'main.server.mjs'),
            resolve(ssrOutDir, 'main.server.js'),
          ];
          const ssrEntry = candidates.find((p) => existsSync(p));
          if (ssrEntry) {
            nitroConfig.alias = {
              ...nitroConfig.alias,
              '#analog/ssr': normalizePath(ssrEntry),
            };
          }
        }

        // Re-register HTML after SSR build
        nitroConfig.virtual['#analog/index'] = `export default ${JSON.stringify(
          state.clientIndexHtml || '',
        )};`;

        nitroConfig.publicAssets = [
          { dir: normalizePath(resolvedClientOutputPath), maxAge: 0 },
        ];
        if (state.resolvedPrerenderRoutes.length > 0) {
          nitroConfig.prerender = nitroConfig.prerender || {};
          nitroConfig.prerender.routes = state.resolvedPrerenderRoutes;
        }
        if (options?.ssr || state.resolvedPrerenderRoutes.length > 0) {
          nitroConfig.moduleSideEffects = [
            'zone.js/node',
            'zone.js/fesm2015/zone-node',
          ];
        }

        await buildServer(options, nitroConfig, state.routeSourceFiles);

        if (
          nitroConfig.prerender?.routes?.length &&
          options?.prerender?.sitemap
        ) {
          console.log('Building Sitemap...');
          const publicDir = nitroConfig.output?.publicDir;
          if (publicDir) {
            await buildSitemap(
              savedConfig || {},
              options.prerender.sitemap,
              state.sitemapRoutes.length
                ? state.sitemapRoutes
                : nitroConfig.prerender.routes,
              publicDir,
              state.routeSitemaps,
              { apiPrefix: options?.apiPrefix || 'api' },
            );
          }
        }

        console.log(
          `\n\nThe '@analogjs/platform' server has been successfully built.`,
        );
      },
    } as Plugin,

    // ── Plugin 2: API prefix define ──────────────────────────────
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

    // ── Plugin 3: Page endpoints transform (dev SSR) ───────────
    // In dev mode, Nitro loads .server.ts page files via Vite's
    // SSR module loader. The pageEndpointsPlugin wraps them into
    // proper Nitro handlers (they export `load`/`action`, not a
    // default defineHandler). Only needed during serve — build
    // mode uses the Rollup plugin registered in the NitroModule.
    {
      ...pageEndpointsPlugin(),
      name: '@analogjs/vite-plugin-nitro-page-endpoints',
      apply: 'serve' as const,
    } as Plugin,

    // ── Plugin 4: nitro/vite (dev server only) ─────────────────
    // Nitro's first-party Vite plugins handle dev server, HMR,
    // and preview. Production builds use the closeBundle fallback
    // since nitro/vite's buildApp conflicts with Nx executor flow
    // and Nitro alias timing.
    ...(isTest
      ? []
      : (nitroVitePlugin(buildConfig()) as Plugin[]).map((p) => ({
          ...p,
          apply: 'serve' as const,
        }))),
  ];
}

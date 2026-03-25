/**
 * Analog Vite Plugin — composes Nitro's first-party Vite plugin with
 * Angular-specific server behavior (SSR, API routes, prerendering).
 *
 * Architecture:
 *   Dev mode  → nitro/vite handles the dev server, HMR, and API routing.
 *   Build mode → closeBundle fallback drives the SSR → Nitro pipeline
 *                because Nx executors don't trigger the Environment API
 *                buildApp flow that nitro/vite expects.
 *
 * Plugins returned (in order):
 *   1. @analogjs/vite-plugin-nitro            — main plugin: config, bundle
 *      capture, closeBundle build pipeline, and carries the NitroModule
 *   2. @analogjs/vite-plugin-nitro-api-prefix — injects ANALOG_API_PREFIX
 *   3. @analogjs/vite-plugin-nitro-page-endpoints — dev-only transform that
 *      wraps .server.ts page files into Nitro handlers
 *   4. nitro/vite plugins (serve only)        — first-party Nitro dev server
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
  // Guards against recursive closeBundle from nested sub-builds
  // (buildClientApp / buildSSRApp call Vite's build() which re-enters plugins).
  let legacyClientSubBuild = false;
  // Prevents duplicate closeBundle execution across Vite 8 environments.
  // Vite 8 fires closeBundle once per environment (client, ssr, nitro, services).
  // Multiple client-like environments can exist (the main client + nitro/vite's
  // client), so the environment name check alone is insufficient — this flag
  // ensures at-most-once semantics for the production build pipeline.
  let closeBundleRunning = false;

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

  /**
   * Builds the NitroPluginConfig passed to nitro/vite.
   * Called eagerly at plugin creation time — rootDir is still '.' here.
   * The NitroModule's setup() corrects paths once the real rootDir is known.
   */
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
    // Core plugin that attaches the NitroModule, configures Vite
    // environments (client + ssr), captures client index.html during
    // bundling, and drives the production build pipeline in closeBundle.
    {
      name: '@analogjs/vite-plugin-nitro',
      // nitro/vite reads plugin.nitro during init and registers it as a
      // NitroModule whose setup() configures handlers, renderers, virtual
      // modules, and build hooks on the Nitro instance.
      nitro: analogNitroModule(options, state),
      // Resolve rootDir from Vite config root (e.g. 'apps/analog-app')
      // relative to workspace root, shared with NitroModule via state.
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
      // Capture client index.html from the bundle for SSR/prerender use.
      // Both hooks needed: generateBundle catches the in-memory asset before
      // disk write (faster), writeBundle catches it after (fallback).
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
      // Drives the SSR → Nitro build pipeline when nitro/vite's
      // Environment API buildApp doesn't fire (Nx executors, CLI builds).
      //
      // Pipeline: resolve client output → resolve prerender routes →
      // build Nitro config → build SSR → set #analog/ssr alias →
      // build Nitro server → build sitemap
      async closeBundle() {
        if (isTest || legacyClientSubBuild || closeBundleRunning) return;

        // Vite 8 fires closeBundle once per environment. Only proceed from
        // client environments — skip SSR, nitro, and service environments.
        // closeBundleRunning prevents duplicate runs when multiple client-like
        // environments exist (main client + nitro/vite's client environment).
        const envName = (this as any).environment?.name;
        if (envName && envName !== 'client') return;

        closeBundleRunning = true;
        try {
          // Skip if Nitro already built (idempotency across environments)
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
          nitroConfig.virtual['#analog/index'] =
            `export default ${JSON.stringify(state.clientIndexHtml || '')};`;

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
          nitroConfig.virtual['#analog/index'] =
            `export default ${JSON.stringify(state.clientIndexHtml || '')};`;

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
        } finally {
          closeBundleRunning = false;
        }
      },
    } as Plugin,

    // ── Plugin 2: API prefix define ──────────────────────────────
    // Injects ANALOG_API_PREFIX as a compile-time constant so client
    // and server code can reference the configured API prefix.
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

    // ── Plugin 3: Page endpoints transform (dev only) ────────────
    // In dev mode, Nitro loads .server.ts page files via Vite's SSR
    // module runner. These files export `load`/`action` functions but
    // Nitro expects a default `defineHandler` export. This plugin wraps
    // them into proper Nitro handlers at transform time.
    //
    // Only needed during serve — production builds apply the same
    // transform via the Rollup plugin registered on
    // nitro.options.rollupConfig.plugins in the NitroModule's setup().
    {
      ...pageEndpointsPlugin(),
      name: '@analogjs/vite-plugin-nitro-page-endpoints',
      apply: 'serve' as const,
    } as Plugin,

    // ── Plugin 4: nitro/vite (dev server only) ───────────────────
    // Nitro's first-party Vite plugins handle the srvx HTTP server,
    // HMR, and preview mode. Restricted to serve via `apply`.
    //
    // Production builds use the closeBundle fallback (Plugin 1) because
    // nitro/vite's buildApp conflicts with Nx executor flow and Nitro
    // alias timing (aliases resolve before SSR output exists on disk).
    ...(isTest
      ? []
      : (nitroVitePlugin(buildConfig()) as Plugin[]).map((p) => ({
          ...p,
          apply: 'serve' as const,
        }))),
  ];
}

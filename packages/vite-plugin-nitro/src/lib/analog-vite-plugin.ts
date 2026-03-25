/**
 * Analog Vite Plugin — composes Nitro's first-party Vite plugin with
 * the Analog NitroModule for Angular-specific server behavior.
 *
 * This is the default export of `@analogjs/vite-plugin-nitro`.
 */
import type { NitroConfig } from 'nitro/types';
import {
  build as nitroBuild,
  copyPublicAssets,
  createNitro,
  prepare,
  prerender,
} from 'nitro/builder';
import { nitro as nitroVitePlugin, type NitroPluginConfig } from 'nitro/vite';
import * as vite from 'vite';
import type { Plugin, UserConfig } from 'vite';
import { mergeConfig, normalizePath } from 'vite';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { Options } from './options.js';
import {
  buildNitroConfig,
  type NitroConfigContext,
} from './nitro-config-factory.js';
import {
  analogNitroModule,
  createAnalogBuildState,
  type AnalogBuildState,
} from './analog-nitro-module.js';
import { getBundleOptionsKey, isRolldown } from './utils/rolldown.js';

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

  // Build context lazily in the config hook once we have the resolved root
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

  // Build the Nitro config and merge with user options
  const buildConfig = (): NitroPluginConfig => {
    const ctx = getContext();
    let config = buildNitroConfig(options, nitroOptions, ctx);
    config = mergeConfig(config, nitroOptions as Record<string, any>);
    return config as NitroPluginConfig;
  };

  // Rolldown code splitting config from user options
  const viteRolldownOutput = options?.vite?.build?.rolldownOptions?.output;
  const viteRolldownOutputConfig =
    viteRolldownOutput && !Array.isArray(viteRolldownOutput)
      ? viteRolldownOutput
      : undefined;
  const codeSplitting = viteRolldownOutputConfig?.codeSplitting;

  return [
    // ── Plugin 1: Analog Nitro Module carrier ─────────────────────
    // This Vite plugin carries the NitroModule via the `nitro` property.
    // nitro/vite collects all plugins with this property and adds them
    // as Nitro modules during initialization.
    {
      name: '@analogjs/nitro-module',
      nitro: analogNitroModule(options, state),
      config(userConfig, { command }) {
        const resolvedConfigRoot = userConfig.root
          ? resolve(workspaceRoot, userConfig.root)
          : workspaceRoot;
        rootDir =
          resolvedConfigRoot === workspaceRoot
            ? '.'
            : normalizePath(
                resolve(workspaceRoot, userConfig.root || '.'),
              ).replace(normalizePath(workspaceRoot) + '/', '');
        // Share rootDir with the NitroModule so it can set output paths
        state.rootDir = rootDir;
        savedConfig = userConfig;

        if (isTest) return {};

        return {
          appType: 'custom',
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
      // Capture client index.html for the NitroModule's virtual module
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
      // Fallback for Nx executors and callers that don't trigger
      // the Environment API buildApp flow. When nitro/vite's buildApp
      // doesn't fire, we manually run SSR + Nitro builds here.
      async closeBundle() {
        if (isTest) return;

        const ssrBuild = (this as any).environment?.name === 'ssr';
        if (ssrBuild) return;

        const nitroOutputDir = resolve(
          workspaceRoot,
          'dist',
          rootDir,
          'analog/server/index.mjs',
        );
        // If the Nitro server output already exists, buildApp ran
        if (existsSync(nitroOutputDir)) return;

        // Locate client build output — check both legacy (client/)
        // and nitro/vite (analog/public/) output locations
        const candidateClientDirs = [
          resolve(workspaceRoot, 'dist', rootDir, 'client'),
          resolve(workspaceRoot, 'dist', rootDir, 'analog/public'),
        ];
        const clientOutDir =
          candidateClientDirs.find((dir) =>
            existsSync(resolve(dir, 'index.html')),
          ) || candidateClientDirs[0];
        const clientIndexPath = resolve(clientOutDir, 'index.html');

        // Need client build to exist
        if (!existsSync(clientIndexPath) && !state.clientIndexHtml) return;

        // Capture client HTML if not already captured
        if (!state.clientIndexHtml && existsSync(clientIndexPath)) {
          state.clientIndexHtml = readFileSync(clientIndexPath, 'utf8');
        }

        // Build SSR entry
        const ssrOutDir =
          options?.ssrBuildDir ||
          resolve(workspaceRoot, 'dist', rootDir, 'ssr');
        if (options?.ssr || state.resolvedPrerenderRoutes.length > 0) {
          console.log('Building SSR application...');
          const ssrConfig = mergeConfig(savedConfig || {}, {
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
              outDir: ssrOutDir,
              emptyOutDir: false,
            },
          });
          await vite.build(ssrConfig);
        }

        // Resolve prerender routes (NitroModule setup doesn't run for
        // build-only mode since nitro/vite is restricted to serve)
        const { resolveAnalogPrerenderRoutes } =
          await import('./analog-nitro-module.js');
        await resolveAnalogPrerenderRoutes(
          options,
          state,
          workspaceRoot,
          rootDir,
        );

        // Build Nitro server
        const ctx = getContext();
        let nitroConfig = buildNitroConfig(options, nitroOptions, ctx);
        nitroConfig = mergeConfig(
          nitroConfig,
          nitroOptions as Record<string, any>,
        );

        // Register client HTML virtual module
        nitroConfig.virtual = nitroConfig.virtual || {};
        nitroConfig.virtual['#analog/index'] = `export default ${JSON.stringify(
          state.clientIndexHtml,
        )};`;

        // Set SSR entry alias — check both legacy (ssr/) and
        // nitro/vite (.nitro/vite/services/ssr/) output locations
        if (options?.ssr || state.resolvedPrerenderRoutes.length > 0) {
          const candidates = [
            resolve(ssrOutDir, 'main.server.mjs'),
            resolve(ssrOutDir, 'main.server.js'),
            resolve(
              workspaceRoot,
              'dist',
              rootDir,
              '.nitro/vite/services/ssr/index.mjs',
            ),
          ];
          const ssrEntry = candidates.find((p) => existsSync(p));
          if (ssrEntry) {
            nitroConfig.alias = {
              ...nitroConfig.alias,
              '#analog/ssr': normalizePath(ssrEntry),
            };
          }
        }

        // Set public assets
        nitroConfig.publicAssets = [
          { dir: normalizePath(clientOutDir), maxAge: 0 },
        ];

        // Apply resolved prerender routes from the NitroModule
        if (state.resolvedPrerenderRoutes.length > 0) {
          nitroConfig.prerender = nitroConfig.prerender || {};
          nitroConfig.prerender.routes = state.resolvedPrerenderRoutes;
        }

        // Add externals and bundler sanitization
        if (options?.ssr || state.resolvedPrerenderRoutes.length > 0) {
          nitroConfig.moduleSideEffects = [
            'zone.js/node',
            'zone.js/fesm2015/zone-node',
          ];
        }

        console.log('Building Server...');
        const nitro = await createNitro({
          dev: false,
          ...nitroConfig,
          builder: nitroConfig.builder ?? 'rollup',
        });

        // Register hooks that the NitroModule normally handles
        const { sanitizeAndExternalize } =
          await import('./analog-nitro-module.js');
        sanitizeAndExternalize(
          nitro,
          !!(options?.ssr || (nitroConfig.prerender?.routes?.length ?? 0) > 0),
        );
        await prepare(nitro);
        await copyPublicAssets(nitro);
        if (
          nitroConfig.prerender?.routes &&
          nitroConfig.prerender.routes.length > 0
        ) {
          console.log('Prerendering static pages...');
          await prerender(nitro);
        }
        if (!options?.static) {
          await nitroBuild(nitro);
        }
        await nitro.close();

        // Build sitemap
        if (
          nitroConfig.prerender?.routes?.length &&
          options?.prerender?.sitemap
        ) {
          console.log('Building Sitemap...');
          const { buildSitemap } = await import('./build-sitemap.js');
          const publicDir = nitroConfig.output?.publicDir;
          if (publicDir) {
            await buildSitemap(
              {},
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

    // ── Plugin 3: nitro/vite (dev server only) ─────────────────
    // Spread Nitro's first-party Vite plugins for dev server, HMR,
    // and preview. Production builds use the closeBundle fallback
    // to avoid conflicts with Nx executor output management.
    ...(isTest
      ? []
      : (nitroVitePlugin(buildConfig()) as Plugin[]).map((p) => ({
          ...p,
          // Skip nitro/vite's build orchestration during production
          // builds — the closeBundle fallback handles it instead.
          apply: 'serve' as const,
        }))),
  ];
}

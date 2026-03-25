/**
 * Analog Vite Plugin — composes Nitro's first-party Vite plugin with
 * the Analog NitroModule for Angular-specific server behavior.
 *
 * This is the default export of `@analogjs/vite-plugin-nitro`.
 */
import type { NitroConfig } from 'nitro/types';
import { nitro as nitroVitePlugin } from 'nitro/vite';
import type { Plugin } from 'vite';
import { mergeConfig, normalizePath } from 'vite';
import { existsSync } from 'node:fs';
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
  let rootDir = workspaceRoot;

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
  const buildConfig = () => {
    const ctx = getContext();
    let config = buildNitroConfig(options, nitroOptions, ctx);
    config = mergeConfig(config, nitroOptions as Record<string, any>);
    return config;
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

    // ── Plugin 3: nitro/vite ─────────────────────────────────────
    // Spread Nitro's first-party Vite plugins. They handle instance
    // creation, dev server, build orchestration, HMR, and preview.
    ...(isTest ? [] : (nitroVitePlugin(buildConfig()) as Plugin[])),
  ];
}

import type { NitroConfig } from 'nitro/types';
import { normalizePath } from 'vite';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

import type { Options } from './options.js';
import { pageEndpointsPlugin } from './plugins/page-endpoints.js';
import { getPageHandlers } from './utils/get-page-handlers.js';
import {
  ssrRenderer,
  clientRenderer,
  apiMiddleware,
} from './utils/renderers.js';

/**
 * Patches Nitro's internal Rollup/Rolldown bundler config to work around
 * incompatibilities in the Nitro v3 alpha series.
 */
function sanitizeNitroBundlerConfig(bundlerConfig: any) {
  const output = bundlerConfig['output'];
  if (!output || Array.isArray(output) || typeof output !== 'object') return;

  if ('codeSplitting' in output) {
    delete output['codeSplitting'];
  }
  if ('manualChunks' in output) {
    delete output['manualChunks'];
  }

  const VALID_ROLLUP_PLACEHOLDER = /^\[(?:name|hash|format|ext)\]$/;
  const chunkFileNames = output['chunkFileNames'];
  if (typeof chunkFileNames === 'function') {
    const originalFn = chunkFileNames;
    output['chunkFileNames'] = (...args: unknown[]) => {
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

export interface NitroConfigContext {
  workspaceRoot: string;
  rootDir: string;
  sourceRoot: string;
  apiPrefix: string;
  prefix: string;
  hasAPIDir: boolean;
  useAPIMiddleware: boolean;
}

function createNitroMiddlewareHandler(handler: string) {
  return {
    route: '/**',
    handler,
    middleware: true,
  };
}

export function buildNitroConfig(
  options: Options | undefined,
  nitroOptions: NitroConfig | undefined,
  ctx: NitroConfigContext,
): NitroConfig {
  const { workspaceRoot, rootDir, sourceRoot, apiPrefix, prefix } = ctx;
  const { hasAPIDir, useAPIMiddleware } = ctx;

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

  const rendererHandler = options?.ssr
    ? '#ANALOG_SSR_RENDERER'
    : '#ANALOG_CLIENT_RENDERER';

  let nitroConfig: NitroConfig = {
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
      dir: normalizePath(resolve(workspaceRoot, 'dist', rootDir, 'analog')),
      publicDir: normalizePath(
        resolve(workspaceRoot, 'dist', rootDir, 'analog/public'),
      ),
    },
    buildDir: normalizePath(resolve(workspaceRoot, 'dist', rootDir, '.nitro')),
    typescript: { generateTsConfig: false },
    runtimeConfig: {
      apiPrefix: apiPrefix.substring(1),
      prefix,
    },
    // Analog's NitroModule sets the real renderer handler in setup().
    // Use an empty object so nitro/vite's `renderer ??= {}` doesn't
    // try to set properties on a boolean.
    renderer: {},
    imports: { autoImport: false },
    hooks: {
      'rollup:before': (_nitro: unknown, bundlerConfig: any) => {
        sanitizeNitroBundlerConfig(bundlerConfig);
      },
    },
    rollupConfig: {
      onwarn(warning: { message: string }) {
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
      {
        handler: rendererHandler,
        route: '/**',
        lazy: true,
      },
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
    alias: {},
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

  return nitroConfig;
}

// ── Preset helpers ────────────────────────────────────────────────────

export function isVercelPreset(preset: string | undefined): boolean {
  return !!preset?.toLowerCase().includes('vercel');
}

const isCloudflarePreset = (buildPreset: string | undefined) =>
  process.env['CF_PAGES'] ||
  (buildPreset &&
    (buildPreset.toLowerCase().includes('cloudflare-pages') ||
      buildPreset.toLowerCase().includes('cloudflare_pages')));

export const isNetlifyPreset = (
  buildPreset: string | undefined,
): string | boolean | undefined =>
  process.env['NETLIFY'] ||
  (buildPreset && buildPreset.toLowerCase().includes('netlify'));

const isFirebaseAppHosting = () => !!process.env['NG_BUILD_LOGS_JSON'];

const withVercelOutputAPI = (
  nitroConfig: NitroConfig | undefined,
  workspaceRoot: string,
) => ({
  ...nitroConfig,
  preset: nitroConfig?.preset ?? 'vercel',
  vercel: {
    ...(nitroConfig as any)?.vercel,
    entryFormat: (nitroConfig as any)?.vercel?.entryFormat ?? 'node',
    functions: {
      runtime: (nitroConfig as any)?.vercel?.functions?.runtime ?? 'nodejs24.x',
      ...(nitroConfig as any)?.vercel?.functions,
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

const withCloudflareOutput = (nitroConfig: NitroConfig | undefined) => ({
  ...nitroConfig,
  output: {
    ...nitroConfig?.output,
    serverDir: '{{ output.publicDir }}/_worker.js',
  },
});

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
          console.log(JSON.stringify(buildOutput, null, 2));
          hasOutput = true;
        }
      },
    },
  };
};

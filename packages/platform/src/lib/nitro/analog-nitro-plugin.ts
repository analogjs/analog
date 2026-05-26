import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import type { Nitro, NitroEventHandler, PrerenderRoute } from 'nitro/types';
import type { Plugin, UserConfig } from 'vite';

import type { Options } from '../options.js';
import type {
  PrerenderContentDir,
  PrerenderContentFile,
  PrerenderRouteConfig,
  PrerenderSitemapConfig,
} from './types.js';
import { getPageHandlers } from './get-page-handlers.js';
import { pageEndpointsPlugin } from './page-endpoints-plugin.js';
import { getMatchingContentFilesWithFrontMatter } from './get-content-files.js';
import { buildSitemap } from './build-sitemap.js';
import { addPostRenderingHooks } from './post-rendering-hook.js';
import {
  expandRoutesWithLocales,
  createI18nPostRenderingHook,
} from './i18n-prerender.js';
import { angularLinkerPlugin } from './angular-linker-plugin.js';

const SSR_ENTRY_VIRTUAL_ID = '\0virtual:@analogjs/nitro/ssr-entry';

/**
 * Angular packages that ship in partial-compilation form and must pass
 * through the linker before the SSR / nitro bundle can execute without
 * JIT. Wired into `ssr.optimizeDeps.rolldownOptions.plugins`.
 */
const ANGULAR_SSR_DEPS = [
  '@angular/compiler',
  '@angular/core',
  '@angular/common',
  '@angular/platform-browser',
  '@angular/platform-server',
];

interface NitroPluginContext {
  workspaceRoot: string;
  rootDir: string;
  sourceRoot: string;
}

type RouteSitemap =
  | PrerenderSitemapConfig
  | (() => PrerenderSitemapConfig)
  | undefined;

/**
 * Analog's NitroModule. Plug it into the Vite plugin chain alongside
 * `nitro()` from `nitro/vite`; nitro/vite picks up the `.nitro` property
 * and runs `setup(nitro)` once the Nitro instance is ready.
 */
export function analogNitroPlugin(options: Options = {}): Plugin {
  const workspaceRoot =
    options.workspaceRoot ?? process.env['NX_WORKSPACE_ROOT'] ?? process.cwd();
  const sourceRoot = 'src';
  const ssr = options.ssr ?? true;
  const apiPrefix = options.apiPrefix ?? 'api';

  let context: NitroPluginContext = {
    workspaceRoot,
    rootDir: '.',
    sourceRoot,
  };
  let ssrEntryMarkerPath = '';
  let userPublicDir: string | undefined;

  function refreshContext(viteRoot: string | undefined) {
    const root = viteRoot ?? process.cwd();
    context = {
      workspaceRoot,
      rootDir: relative(workspaceRoot, root) || '.',
      sourceRoot,
    };
    ssrEntryMarkerPath = resolve(
      context.workspaceRoot,
      context.rootDir,
      '.analog/__ssr-entry.mjs',
    );
  }

  function readIndexHtml(): string {
    const indexFile = options.index ?? 'index.html';
    const candidates = [
      resolve(context.workspaceRoot, context.rootDir, indexFile),
      resolve(
        context.workspaceRoot,
        'dist',
        context.rootDir,
        'client',
        indexFile,
      ),
    ];
    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return readFileSync(candidate, 'utf-8');
      }
    }
    return '<!doctype html><html><body><div id="app"></div></body></html>';
  }

  function resolveEntryServer(): string {
    return (
      options.entryServer ??
      resolve(
        context.workspaceRoot,
        context.rootDir,
        `${sourceRoot}/main.server.ts`,
      )
    );
  }

  const plugin: Plugin & {
    nitro: { setup: (nitro: Nitro) => void | Promise<void> };
  } = {
    name: '@analogjs/nitro',
    enforce: 'pre',

    config(userConfig) {
      refreshContext(userConfig.root);

      // Capture the user's Vite `publicDir` so the nitro `setup()` hook can
      // register it as a Nitro `publicAssets` source. nitro/vite forces the
      // client environment's `build.copyPublicDir` to `false`
      // (vite.mjs:248), expecting Nitro to manage public assets — but
      // doesn't auto-add the user's `publicDir`. Without this, anything
      // under `src/public/` (e.g. `/assets/shipping.json`) 404s during SSR
      // and ofetch consumers parse the catch-all SSR HTML as JSON.
      if (userConfig.publicDir !== false) {
        userPublicDir = resolve(
          context.workspaceRoot,
          context.rootDir,
          (userConfig.publicDir as string | undefined) ?? 'public',
        );
      }

      // Bridge the legacy `BUILD_PRESET` env var that `@analogjs/vite-plugin-nitro`
      // accepted into Nitro v3's `NITRO_PRESET`, and auto-pick the matching
      // preset when the build runs inside a host's CI (each host sets its
      // own well-known env var). Mirrors the legacy plugin's behavior so
      // users upgrading don't need to change their CI configuration.
      if (!process.env['NITRO_PRESET']) {
        if (process.env['BUILD_PRESET']) {
          process.env['NITRO_PRESET'] = process.env['BUILD_PRESET'];
        } else if (process.env['VERCEL']) {
          process.env['NITRO_PRESET'] = 'vercel';
        } else if (process.env['NETLIFY']) {
          process.env['NITRO_PRESET'] = 'netlify';
        } else if (process.env['CF_PAGES']) {
          process.env['NITRO_PRESET'] = 'cloudflare-pages';
        }
      }

      const overrides: UserConfig = {
        // Vite 8 defaults `server.fs.allow` to `[searchForWorkspaceRoot(root)]`,
        // which should already cover the workspace root. In practice, nitro/vite's
        // env-runner loads its own `dev-entry.mjs` from a pnpm content-hash path
        // (`node_modules/.pnpm/nitro@.../...`) through Vite's ModuleRunner and
        // hits an `ERR_LOAD_URL`/"Does the file exist?" error unless an explicit
        // allow entry covers the same root. Whitelist the workspace root here so
        // users don't have to write the workaround in every vite.config.ts.
        server: {
          fs: {
            allow: [context.workspaceRoot],
          },
        },
      };

      if (ssr) {
        // Two-pronged registration: `experimental.vite.services.ssr.entry`
        // is the documented hook, but nitro/vite's setupNitroContext also
        // accepts an `environments.ssr.build.rollupOptions.input` entry
        // (see node_modules/nitro/dist/vite.mjs:710-734). When `analog()`
        // and `nitro()` are invoked separately, the `services` slot on
        // `nitro()`'s pluginConfig is empty, so the rollupOptions.input
        // path is how we get our wrapper entry recognized.
        overrides.experimental = {
          vite: {
            services: {
              ssr: { entry: ssrEntryMarkerPath },
            },
          },
        };
        overrides.environments = {
          ssr: {
            build: {
              outDir: resolve(
                context.workspaceRoot,
                'dist',
                context.rootDir,
                'ssr',
              ),
              rollupOptions: {
                input: { index: ssrEntryMarkerPath },
              },
            },
            optimizeDeps: {
              include: ANGULAR_SSR_DEPS,
              rolldownOptions: {
                plugins: [angularLinkerPlugin()],
              },
            },
          },
        } as UserConfig['environments'];
      }

      return overrides;
    },

    resolveId(id) {
      if (id === ssrEntryMarkerPath || id === SSR_ENTRY_VIRTUAL_ID) {
        return SSR_ENTRY_VIRTUAL_ID;
      }
      return null;
    },

    load(id) {
      if (id !== SSR_ENTRY_VIRTUAL_ID) return null;
      return generateSsrEntryWrapper(resolveEntryServer(), readIndexHtml());
    },

    nitro: {
      async setup(nitro) {
        // refreshContext may not have run yet if nitro/vite resolved the
        // plugin before `config()`; fall back to nitro's own root.
        if (!context || context.rootDir === '.') {
          refreshContext(nitro.options.rootDir);
        }

        // Preserve the legacy `@analogjs/vite-plugin-nitro` final output
        // layout so downstream tooling (deploy scripts, docs, the
        // `dist/analog/server` start command) keeps working. nitro/vite's
        // default `<rootDir>/.output` would otherwise drop artifacts in an
        // unexpected location for users upgrading from v2.
        //
        // Build only. During dev, leaving the output paths at Nitro's
        // defaults keeps the dev server's `readAsset` happy — those
        // virtuals expect to read from the in-memory module graph, not
        // from a `dist/` directory that doesn't exist yet.
        //
        // `buildDir` (Nitro's intermediate scratch dir) stays at its default
        // inside the project root. Nitro's prerender phase re-bundles SSR
        // chunks out of `<buildDir>/vite/services/ssr/`, and Rolldown's
        // resolver walks up from those files looking for `node_modules/`.
        // Keeping `buildDir` adjacent to the project root means workspace
        // packages installed at `<rootDir>/node_modules/` (the usual install
        // shape for both standalone and Nx setups) remain reachable.
        if (!nitro.options.dev) {
          // Deployment presets (Vercel, Netlify, Cloudflare, Firebase, ...)
          // own their own output layout — Vercel writes the Build Output API
          // tree under `.vercel/output/`, Netlify expects functions under
          // `.netlify/functions-internal/` with static assets under `dist/`,
          // and so on. Clobbering `output.{dir,publicDir,serverDir}` for
          // those presets leaves functions and static files in different
          // trees and breaks the deploy. Only override when running the
          // default node-server preset (or no preset at all) so docs and
          // the legacy `dist/analog/server` start command keep working for
          // standalone Node deployments.
          const preset = (nitro.options.preset ?? '').toLowerCase();
          const isManagedPreset =
            preset !== '' &&
            preset !== 'node-server' &&
            preset !== 'node' &&
            preset !== 'nitro-dev';

          // Vercel's Build Output API expects `.vercel/output/` at the cwd
          // `vercel build` runs from (the repo root). Nitro's preset anchors
          // to `{{rootDir}}`, so in Nx monorepos artifacts land at
          // `apps/<name>/.vercel/output/` and the deploy can't find them.
          // Hoist to workspace root and apply Analog's runtime defaults.
          if (preset.includes('vercel')) {
            const vercel = (nitro.options as { vercel?: Record<string, any> })
              .vercel;
            (nitro.options as { vercel?: Record<string, any> }).vercel = {
              ...vercel,
              entryFormat: vercel?.entryFormat ?? 'node',
              functions: {
                runtime: vercel?.functions?.runtime ?? 'nodejs24.x',
                ...vercel?.functions,
              },
            };
            const vercelDir = resolve(context.workspaceRoot, '.vercel/output');
            nitro.options.output = {
              ...nitro.options.output,
              dir: vercelDir,
              serverDir: resolve(vercelDir, 'functions/__server.func'),
              publicDir: resolve(vercelDir, 'static'),
            };
          }

          // Netlify auto-discovers functions under
          // `<workspaceRoot>/.netlify/functions-internal/`. Nitro's netlify
          // preset anchors that to `{{rootDir}}`, which in Nx monorepos
          // becomes `apps/<name>/.netlify/...` and is invisible to the
          // Netlify deploy. Hoist the functions to the workspace root so
          // `nx build <app>` produces a deploy-ready tree at the repo root.
          // Keep `publicDir` under `dist/<rootDir>/analog/public/` (the
          // legacy Analog Netlify publish layout) — the user wires their
          // `netlify.toml` publish path to it.
          if (preset === 'netlify' || preset === 'netlify-edge') {
            const netlifyDir = resolve(
              context.workspaceRoot,
              '.netlify/functions-internal',
            );
            nitro.options.output = {
              ...nitro.options.output,
              dir: netlifyDir,
              serverDir: resolve(netlifyDir, 'server'),
              publicDir: resolve(
                context.workspaceRoot,
                'dist',
                context.rootDir,
                'analog/public',
              ),
            };
          }

          // Cloudflare Pages/Workers presets anchor their output at
          // `{{rootDir}}/dist` or `{{rootDir}}/.output`, which puts the
          // deploy tree at `apps/<name>/...` for Nx monorepos. Hoist to
          // `<workspaceRoot>/dist/<rootDir>/` so `wrangler pages deploy
          // dist/<rootDir>` from the workspace root finds `_worker.js/`
          // alongside the static assets.
          if (preset.includes('cloudflare')) {
            const cfDir = resolve(
              context.workspaceRoot,
              'dist',
              context.rootDir,
            );
            nitro.options.output = {
              ...nitro.options.output,
              dir: cfDir,
              publicDir: cfDir,
              serverDir: resolve(cfDir, '_worker.js'),
            };
          }

          if (!isManagedPreset) {
            const distRoot = resolve(
              context.workspaceRoot,
              'dist',
              context.rootDir,
            );
            nitro.options.output = {
              ...nitro.options.output,
              dir: resolve(distRoot, 'analog'),
              publicDir: resolve(distRoot, 'analog/public'),
              serverDir: resolve(distRoot, 'analog/server'),
            };
          }

          // Nitro v3's prerender writer compares `filePath.startsWith(publicDir)`
          // with `filePath` built via `node:path.join` (platform-native
          // separators on Windows) and `publicDir` set via `resolveNitroPath`
          // (always forward slashes via pathe). On Windows the two sides
          // disagree and every route is marked `(skipped)` — no HTML is
          // written. Hook `prerender:route` and write the file ourselves
          // when Nitro has skipped it but the route generated content.
          nitro.hooks.hook('prerender:route', async (route) => {
            if (!route.skip || route.error) return;
            const buffer = route.data;
            if (!buffer || !route.fileName) return;
            const filePath = resolve(
              nitro.options.output.publicDir,
              route.fileName.replace(/^[\\/]+/, ''),
            );
            try {
              await mkdir(dirname(filePath), { recursive: true });
              await writeFile(filePath, Buffer.from(buffer));
              route.skip = false;
            } catch {
              // leave Nitro's skip in place if the manual write also fails
            }
          });
        }

        // Register the user's Vite `publicDir` (e.g. `src/public/`) as a
        // Nitro public asset source. nitro/vite turns off Vite's own copy
        // of publicDir so Nitro can take over, but doesn't auto-bridge the
        // user's setting — without this entry, files like
        // `src/public/assets/shipping.json` aren't served and `HttpClient`
        // SSR fetches fall through to the catch-all SSR renderer, leaking
        // HTML where consumers expected JSON.
        if (userPublicDir && existsSync(userPublicDir)) {
          const already = nitro.options.publicAssets.some(
            (asset) => asset.dir === userPublicDir,
          );
          if (!already) {
            nitro.options.publicAssets.push({
              dir: userPublicDir,
              baseURL: '/',
              maxAge: 0,
              fallthrough: true,
            });
          }
        }

        // Bridge the outer Nitro's `output.publicDir` into the prerender's
        // own Nitro instance. Nitro spawns a nested `nitroRenderer` for the
        // prerender pass (`createNitro({ preset: 'nitro-prerender' })`) and
        // builds the public-assets manifest by glob-scanning that
        // instance's `output.publicDir`. The nested config resets
        // `output.publicDir` to undefined and resolves it against the
        // prerender preset defaults (`<rootDir>/.output/public`), so the
        // scan hits an empty directory and the manifest is empty — every
        // `HttpClient.get('/assets/...')` during SSR then falls through to
        // the catch-all SSR renderer and the consumer parses HTML as JSON.
        // Force the nested publicDir to match the outer publicDir (which
        // `copyPublicAssets` has already populated by this point).
        nitro.hooks.hook(
          'prerender:config',
          (prerendererConfig: { output?: Record<string, unknown> }) => {
            prerendererConfig.output = {
              ...prerendererConfig.output,
              publicDir: nitro.options.output.publicDir,
            };
          },
        );

        const hasAPIDir = existsSync(
          resolve(
            context.workspaceRoot,
            context.rootDir,
            `${context.sourceRoot}/server/routes/api`,
          ),
        );

        const pageHandlers: NitroEventHandler[] = getPageHandlers({
          workspaceRoot: context.workspaceRoot,
          sourceRoot: context.sourceRoot,
          rootDir: context.rootDir,
          additionalPagesDirs: options.additionalPagesDirs,
          hasAPIDir,
        });
        nitro.options.handlers.push(...pageHandlers);

        const serverDir = resolve(
          context.workspaceRoot,
          context.rootDir,
          `${context.sourceRoot}/server`,
        );
        if (
          existsSync(serverDir) &&
          !nitro.options.scanDirs.includes(serverDir)
        ) {
          nitro.options.scanDirs.push(serverDir);
        }

        nitro.hooks.hook('rollup:before', (_n, rollupConfig: any) => {
          if (Array.isArray(rollupConfig.plugins)) {
            rollupConfig.plugins.push(pageEndpointsPlugin());
          }
          applyAnalogNitroExternals(rollupConfig);
          sanitizeNitroBundlerConfig(rollupConfig);
        });

        if (ssr) {
          // Override Nitro's auto-detected template-serving renderer with one
          // that routes HTML requests to our SSR service. Nitro's
          // `resolveRendererOptions` finds `index.html` at the project root
          // and installs `internal/routes/renderer-template[.dev]`, which
          // just serves the raw template. nitro/vite's own SSR-routing
          // renderer only auto-installs when both `renderer.handler` and
          // `renderer.template` are empty (vite.mjs:574), which never holds
          // for a typical app — so we install our own renderer virtual
          // explicitly here.
          //
          // `#analog/ssr` is a Nitro virtual (not a Vite virtual) so it
          // resolves under both Vite-built bundles (main) and Rolldown-built
          // bundles (Nitro's prerender, which forces builder: 'rolldown' —
          // see nitro/dist/_chunks/nitro.mjs:769). That sidesteps nitro/vite's
          // prodSetup polyfill, which is Vite-only and leaves
          // `__nitro_vite_envs__` unset in the prerender bundle.
          nitro.options.virtual['#analog/ssr'] = () =>
            generateSsrServiceVirtual(nitro);
          nitro.options.virtual['#analog/ssr-renderer'] =
            generateSsrRendererVirtual(readIndexHtml());
          nitro.options.renderer ??= {};
          nitro.options.renderer.handler = '#analog/ssr-renderer';
          delete nitro.options.renderer.template;
        }
        // When ssr === false, Nitro's auto-detected template-serving
        // renderer is exactly what we want (serve the raw index.html for
        // every HTML request) — leave it in place.

        injectAnalogRouteRuleHeaders(nitro);

        await wirePrerender(nitro, options, context, apiPrefix);

        if (options.i18n) {
          addPostRenderingHooks(nitro, [
            createI18nPostRenderingHook({
              defaultLocale: options.i18n.defaultLocale,
              locales: options.i18n.locales,
            }),
          ]);
        }
      },
    },
  };

  return plugin;
}

/**
 * Builds the h3 handler installed as Nitro's `renderer.handler`. Short-circuits
 * `ssr: false` routes to the raw client template; otherwise dispatches the
 * request to the SSR service env (`fetchViteEnv("ssr", req)` works in dev via
 * the env-runner and in prod via the `__nitro_vite_envs__` global set up by
 * nitro/vite's `prodSetup`).
 */
function generateSsrRendererVirtual(template: string): string {
  return `
import { defineHandler } from 'nitro/h3';
import ssr from '#analog/ssr';

const TEMPLATE = ${JSON.stringify(template)};

export default defineHandler(async (event) => {
  event.res.headers.set('content-type', 'text/html; charset=utf-8');
  // 'x-analog-no-ssr' is stamped on response headers by
  // injectAnalogRouteRuleHeaders for routeRules with \`ssr: false\`. Nitro
  // applies routeRule headers to the response before the renderer fires,
  // so we can short-circuit by reading them here.
  if (event.res.headers.get('x-analog-no-ssr') === 'true') {
    return TEMPLATE;
  }
  const service = ssr.default ?? ssr;
  return service.fetch(event.req);
});
`;
}

/**
 * Resolves \`#analog/ssr\` to the SSR fetch handler. The shape returned by
 * this function is bundler-agnostic: works in Vite-built main bundles and
 * Rolldown-built prerender bundles alike.
 *
 * - Dev: dispatch through nitro/vite's env runner (\`fetchViteEnv\`); the SSR
 *   service module isn't on disk yet, so we delegate to the runner.
 * - Build / prerender: re-export the built SSR entry directly from the
 *   filesystem. By the time Nitro's bundlers ask for \`#analog/ssr\`, Vite has
 *   already produced \`<buildDir>/vite/services/ssr/<entry>.mjs\`.
 */
function generateSsrServiceVirtual(nitro: Nitro): string {
  if (nitro.options.dev) {
    return `
import { fetchViteEnv } from 'nitro/vite/runtime';
export default {
  async fetch(req) {
    return fetchViteEnv('ssr', req);
  },
};
`;
  }

  const ssrDir = resolve(nitro.options.buildDir, 'vite/services/ssr');
  if (!existsSync(ssrDir)) {
    return `export default { async fetch() { throw new Error('Analog SSR service directory missing: ${ssrDir}'); } };`;
  }
  const entries = readdirSync(ssrDir).filter((f) => f.endsWith('.mjs'));
  if (entries.length === 0) {
    return `export default { async fetch() { throw new Error('No Analog SSR entry file built in: ${ssrDir}'); } };`;
  }
  // Prefer 'main.server.mjs' if present; otherwise take the only entry.
  const entry = entries.find((f) => f === 'main.server.mjs') ?? entries[0];
  const entryPath = resolve(ssrDir, entry);
  return `export { default } from ${JSON.stringify(entryPath)};`;
}

/**
 * Packages Analog forces external in the Nitro server bundle. Each entry is
 * here for a specific reason — see comments.
 */
const ANALOG_NITRO_EXTERNALS = [
  // rxjs ships per-entry CJS/ESM facades that confuse the Nitro/Rolldown
  // resolver during bundling.
  'rxjs',
  // node-fetch-native's polyfill subpath rewrites global fetch and isn't
  // safe to inline into the Nitro bundle.
  'node-fetch-native/dist/polyfill',
  // sharp ships platform-specific native binaries under @img/sharp-*. pnpm
  // creates symlinks for ALL optional platform deps but only installs the
  // matching one, leaving broken symlinks that crash Nitro's externals
  // plugin with ENOENT during realpath(). Externalizing sharp avoids
  // bundling it; the user's app resolves it from node_modules at runtime.
  'sharp',
];

function applyAnalogNitroExternals(rollupConfig: { external?: unknown }): void {
  // Rolldown's `external` only accepts `Array<string | RegExp>`; promote
  // whatever shape Nitro gave us (regex, single string, undefined) to an
  // array and append Analog's entries as regex patterns that also match
  // sub-paths (e.g. `sharp` matches `sharp/lib/foo`).
  const prev = rollupConfig.external;
  const existing: Array<string | RegExp> =
    prev === undefined
      ? []
      : Array.isArray(prev)
        ? (prev as Array<string | RegExp>)
        : prev instanceof RegExp
          ? [prev]
          : typeof prev === 'string'
            ? [prev]
            : [];

  const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  for (const entry of ANALOG_NITRO_EXTERNALS) {
    const pattern = new RegExp(`^${escapeRegExp(entry)}(?:/|$)`);
    if (!existing.some((p) => String(p) === String(pattern))) {
      existing.push(pattern);
    }
  }

  rollupConfig.external = existing;
}

/**
 * Workarounds for Nitro v3 + Rolldown bundler interaction quirks. Each
 * is narrowly scoped and can be removed once the upstream bug is fixed:
 *
 * 1. `output.codeSplitting` — Nitro 3.0.x sets this; Rolldown rejects it
 *    as an unknown key.
 * 2. `output.manualChunks` — Nitro's default manual chunking crashes
 *    Nitro's prerender rebundle.
 * 3. `output.chunkFileNames` — Nitro's chunk-name function produces
 *    route-derived `[token]` patterns which Rollup/Rolldown interprets as
 *    placeholders; we rewrite non-standard tokens to `_token_`.
 */
function sanitizeNitroBundlerConfig(rollupConfig: { output?: unknown }): void {
  const output = rollupConfig.output;
  if (!output || Array.isArray(output) || typeof output !== 'object') return;
  const out = output as Record<string, unknown>;

  if ('codeSplitting' in out) delete out['codeSplitting'];
  if ('manualChunks' in out) delete out['manualChunks'];

  const VALID_ROLLUP_PLACEHOLDER = /^\[(?:name|hash|format|ext)\]$/;
  const chunkFileNames = out['chunkFileNames'];
  if (typeof chunkFileNames === 'function') {
    const originalFn = chunkFileNames as (...args: unknown[]) => unknown;
    out['chunkFileNames'] = (...args: unknown[]) => {
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

/**
 * Walks Nitro's resolved routeRules and stamps `x-analog-no-ssr: true` onto
 * any rule with `ssr: false`. Kept as a response-header hint for downstream
 * consumers (CDN, edge logic); the actual SSR short-circuit happens inside
 * the SSR renderer virtual above.
 */
function injectAnalogRouteRuleHeaders(nitro: Nitro): void {
  const routeRules = nitro.options.routeRules as
    | Record<string, { ssr?: boolean; headers?: Record<string, string> }>
    | undefined;
  if (!routeRules) return;

  for (const rule of Object.values(routeRules)) {
    if (rule?.ssr === false) {
      rule.headers = { ...rule.headers, 'x-analog-no-ssr': 'true' };
    }
  }
}

/**
 * Builds the SSR service entry source. The wrapper imports the user's
 * `main.server.ts` Angular renderer and adapts it to the `{ fetch(req) }`
 * shape that nitro/vite's service mechanism expects.
 */
function generateSsrEntryWrapper(
  entryServer: string,
  template: string,
): string {
  return `
// Import \`serverFetch\` from the root \`nitro\` entry rather than \`nitro/app\`.
// The /app subpath creates a fresh \`useNitroApp()\` instance scoped to the
// importing bundle, which in our setup is the standalone SSR vite bundle —
// it has no route handlers, so every fetch 404s. The root entry instead
// reads \`globalThis.__nitro__.{default,prerender}\`, which the surrounding
// Nitro server (prerender pass or production runtime) has already
// populated with the real app + handlers.
import { serverFetch as nitroServerFetch } from 'nitro';
import { createFetch } from 'ofetch';
import renderer from ${JSON.stringify(entryServer)};

const TEMPLATE = ${JSON.stringify(template)};

const normalizeRequestPath = (url) =>
  url.replace(/\\/index\\.html(?=$|[?#])/, '/');

// In-process fetch wired into Nitro's request pipeline. Angular's HttpClient
// (via withFetch()) and Analog's injectLoad() call this during SSR/prerender
// so they hit the running app's page-endpoint and API routes without going
// through the network — the prerender pipeline doesn't have a listening
// socket. Without this, every SSR data fetch ECONNREFUSEs and Angular's
// router fails to resolve any data-bound route, producing an empty
// <router-outlet/> in the prerendered HTML.
const ssrFetch = (resource, init) => {
  let url = typeof resource === 'string'
    ? resource
    : resource instanceof URL
      ? resource.href
      : resource.url;
  // Relative URLs from injectAPIPrefix() etc. need a host for Nitro's
  // Request constructor to accept them.
  if (typeof url === 'string' && url.startsWith('/')) {
    url = 'http://localhost' + url;
  }
  return nitroServerFetch(url, init);
};

// Wrap in ofetch so consumers that expect \`$fetch.raw()\` (the router's
// request-context interceptor short-circuits SSR HttpClient calls through
// \`globalThis.$fetch.raw\`) can call it. Set on globalThis so router code
// running inside the Angular renderer can find it.
const ssrOFetch = createFetch({ fetch: ssrFetch });
if (typeof globalThis.$fetch === 'undefined') {
  globalThis.$fetch = ssrOFetch;
}

export default {
  async fetch(req) {
    const url = new URL(req.url);
    const requestPath = normalizeRequestPath(url.pathname);
    // Preserve the query string so Angular's router + injectQuery() and
    // server data loaders that read from req.url see the full path+query.
    const requestUrl = requestPath + url.search;

    if (req.headers.get('x-analog-no-ssr') === 'true') {
      return new Response(TEMPLATE, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }

    const reqShim = {
      headers: Object.fromEntries(req.headers.entries()),
      url: requestUrl,
      originalUrl: requestUrl,
      connection: {},
    };

    try {
      const html = await renderer(requestUrl, TEMPLATE, {
        req: reqShim,
        // Pass the ofetch-wrapped fetch — INTERNAL_FETCH is consumed by the
        // router's request-context interceptor via \`serverFetch.raw(...)\`,
        // which is ofetch's response-shape API. Plain fetch lacks \`.raw\`
        // and throws TypeError during prerender/SSR.
        fetch: ssrOFetch,
      });
      return new Response(html, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    } catch (err) {
      console.error('[analog ssr]', err);
      return new Response(TEMPLATE, {
        status: 500,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }
  },
};
`;
}

async function wirePrerender(
  nitro: Nitro,
  options: Options,
  context: NitroPluginContext,
  apiPrefix: string,
): Promise<void> {
  const prerender = options.prerender;
  if (!prerender && !options.i18n) return;

  const {
    routes: collected,
    sitemaps: routeSitemaps,
    routeSourceFiles,
  } = await collectRoutes(prerender?.routes, context, apiPrefix);

  const expanded = options.i18n
    ? expandRoutesWithLocales(collected, {
        defaultLocale: options.i18n.defaultLocale,
        locales: options.i18n.locales,
      })
    : collected;

  const nitroPrerender = (nitro.options.prerender ??= {}) as Record<
    string,
    any
  >;
  nitroPrerender.routes ??= [];
  nitroPrerender.routes.push(...expanded);
  if (prerender?.discover ?? false) {
    nitroPrerender.crawlLinks = true;
  }

  if (prerender?.postRenderingHooks?.length) {
    addPostRenderingHooks(nitro, prerender.postRenderingHooks);
  }

  if (Object.keys(routeSourceFiles).length > 0) {
    // Mirror the legacy `@analogjs/vite-plugin-nitro` behavior: after
    // prerender completes, write the route's source content alongside the
    // prerendered HTML at `<publicDir>/<route>.md`. Drives the
    // `outputSourceFile` option on both `PrerenderRouteConfig` (string path
    // to source markdown) and `PrerenderContentDir` (per-file callback).
    nitro.hooks.hook('prerender:done', async () => {
      const publicDir = resolve(nitro.options.output.publicDir);
      const { mkdirSync, writeFileSync } = await import('node:fs');
      const { dirname, join } = await import('node:path');
      for (const [route, content] of Object.entries(routeSourceFiles)) {
        const outputPath = join(publicDir, `${route}.md`);
        mkdirSync(dirname(outputPath), { recursive: true });
        writeFileSync(outputPath, content, 'utf8');
      }
    });
  }

  const sitemapConfig = prerender?.sitemap;
  if (sitemapConfig) {
    nitro.hooks.hook('prerender:done', async (result) => {
      const prerenderedRoutes = (result?.prerenderedRoutes ?? []).map(
        (r: PrerenderRoute) => r.route,
      );
      const publicDir = resolve(nitro.options.output.publicDir);
      await buildSitemap(
        {} as any,
        sitemapConfig,
        prerenderedRoutes,
        publicDir,
        routeSitemaps,
        { apiPrefix },
      );
    });
  }
}

async function collectRoutes(
  routesInput: Options['prerender'] extends infer P
    ? P extends { routes?: infer R }
      ? R
      : never
    : never,
  context: NitroPluginContext,
  apiPrefix: string,
): Promise<{
  routes: string[];
  sitemaps: Record<string, RouteSitemap>;
  routeSourceFiles: Record<string, string>;
}> {
  const out: string[] = [];
  const sitemaps: Record<string, RouteSitemap> = {};
  const routeSourceFiles: Record<string, string> = {};

  if (!routesInput) return { routes: out, sitemaps, routeSourceFiles };

  const inputs = Array.isArray(routesInput)
    ? routesInput
    : typeof routesInput === 'function'
      ? await routesInput()
      : [];

  for (const entry of inputs) {
    if (!entry) continue;

    if (typeof entry === 'string') {
      out.push(entry);
      continue;
    }

    if ('contentDir' in entry) {
      const dir = entry as PrerenderContentDir;
      const files = getMatchingContentFilesWithFrontMatter(
        context.workspaceRoot,
        context.rootDir,
        dir.contentDir,
        !!dir.recursive,
      );
      for (const file of files) {
        const route = dir.transform(file);
        if (route === false) continue;
        out.push(route);
        if (dir.sitemap) {
          sitemaps[route] =
            typeof dir.sitemap === 'function'
              ? (
                  dir.sitemap as (
                    f: PrerenderContentFile,
                  ) => PrerenderSitemapConfig
                )(file)
              : dir.sitemap;
        }
        if (dir.outputSourceFile) {
          const sourceContent = dir.outputSourceFile(file);
          if (typeof sourceContent === 'string') {
            routeSourceFiles[route] = sourceContent;
          }
        }
      }
      continue;
    }

    if ('route' in entry) {
      const cfg = entry as PrerenderRouteConfig;
      out.push(cfg.route);
      if (cfg.sitemap) {
        sitemaps[cfg.route] = cfg.sitemap;
      }
      if (cfg.outputSourceFile) {
        const sourcePath = resolve(
          context.workspaceRoot,
          context.rootDir,
          cfg.outputSourceFile,
        );
        if (existsSync(sourcePath)) {
          routeSourceFiles[cfg.route] = readFileSync(sourcePath, 'utf8');
        }
      }
      if (cfg.staticData) {
        // Mirror the legacy plugin: when staticData is requested, also
        // prerender the page's data-fetching endpoint so the JSON payload
        // is available statically.
        const prefix = apiPrefix.startsWith('/') ? apiPrefix : `/${apiPrefix}`;
        const route = cfg.route.startsWith('/') ? cfg.route : `/${cfg.route}`;
        out.push(`${prefix}/_analog/pages${route}`);
      }
    }
  }

  return { routes: out, sitemaps, routeSourceFiles };
}

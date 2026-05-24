import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';
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

      const overrides: UserConfig = {};

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
        });

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
        // prodSetup polyfill, which is Vite-only and leaves `__nitro_vite_envs__`
        // unset in the prerender bundle.
        nitro.options.virtual['#analog/ssr'] = () =>
          generateSsrServiceVirtual(nitro);
        nitro.options.virtual['#analog/ssr-renderer'] =
          generateSsrRendererVirtual(readIndexHtml());
        nitro.options.renderer ??= {};
        nitro.options.renderer.handler = '#analog/ssr-renderer';
        delete nitro.options.renderer.template;

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
import renderer from ${JSON.stringify(entryServer)};

const TEMPLATE = ${JSON.stringify(template)};

const normalizeRequestPath = (url) =>
  url.replace(/\\/index\\.html(?=$|[?#])/, '/');

export default {
  async fetch(req) {
    const url = new URL(req.url);
    const requestPath = normalizeRequestPath(url.pathname);

    if (req.headers.get('x-analog-no-ssr') === 'true') {
      return new Response(TEMPLATE, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }

    const reqShim = {
      headers: Object.fromEntries(req.headers.entries()),
      url: requestPath,
      originalUrl: requestPath,
      connection: {},
    };

    try {
      const html = await renderer(requestPath, TEMPLATE, { req: reqShim });
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

  const { routes: collected, sitemaps: routeSitemaps } = await collectRoutes(
    prerender?.routes,
    context,
  );

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
): Promise<{ routes: string[]; sitemaps: Record<string, RouteSitemap> }> {
  const out: string[] = [];
  const sitemaps: Record<string, RouteSitemap> = {};

  if (!routesInput) return { routes: out, sitemaps };

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
      }
      continue;
    }

    if ('route' in entry) {
      const cfg = entry as PrerenderRouteConfig;
      out.push(cfg.route);
      if (cfg.sitemap) {
        sitemaps[cfg.route] = cfg.sitemap;
      }
    }
  }

  return { routes: out, sitemaps };
}

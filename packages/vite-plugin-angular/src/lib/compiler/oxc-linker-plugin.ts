/* ───────────────────────────────────────────────────────────────────────────
 * TEMPORARY: inline port of `@oxc-angular/vite`'s linker plugin.
 *
 * Upstream source: `@oxc-angular/vite@0.0.30` → `vite-plugin/angular-linker-
 * plugin.ts`. This file is plugin shell — `optimizeDeps.exclude` filtering,
 * a Rolldown pre-bundle `load` hook, and a Vite `transform` hook — wrapped
 * around the public `linkAngularPackage` NAPI export.
 *
 * Ported here (with the OXC-equivalents memory rule in mind) because the
 * `angularLinkerPlugin()` factory itself isn't on `@oxc-angular/vite/api`,
 * only `linkAngularPackage` is. Per the rule, the actual linking work
 * still runs through OXC's NAPI; what's local is the Vite/Rolldown glue
 * routing files into that NAPI call.
 *
 * TODO(oxc-engine): swap this file for a `re-export { angularLinkerPlugin }
 * from '@oxc-angular/vite/<entry>'` once OXC exposes the plugin factory
 * publicly (alongside the helpers tracked in `oxc-hmr-helpers.ts`).
 *
 * The only regex use here is path-matching (file extensions, node_modules
 * paths) plus an `includes('ɵɵngDeclare')` fast-path bailout — both
 * explicitly allowed by the prefer-OXC-AST rule, since neither parses
 * source code.
 * ─────────────────────────────────────────────────────────────────────── */
import type { Plugin, ResolvedConfig } from 'vite';

import { loadOxcHmrApi } from './oxc-engine.js';

const LINKER_DECLARATION_PREFIX = 'ɵɵngDeclare';

// Skip these packages — they don't need linking.
const SKIP_REGEX = /[\\/]@angular[\\/](?:compiler|core)[\\/]/;

// Broad filter for the transform hook — deliberately simple so every
// Vite/Rolldown version can evaluate it. Precise extension + query-string
// checks happen inside the handler.
const NODE_MODULES_JS_REGEX = /node_modules/;

// Precise check inside the handler: matches .js / .mjs / .cjs with an
// optional Vite query string (?v=…) on Unix and Windows paths.
const JS_EXT_REGEX = /\.[cm]?js(?:\?.*)?$/;

function createExcludeFilter(
  exclude: readonly string[],
): (id: string) => boolean {
  return (id: string): boolean => {
    if (exclude.length === 0) return false;
    const normalizedId = id.replace(/\\/g, '/');
    return exclude.some((ex) => {
      const pkg = ex.endsWith('/*') ? ex.slice(0, -2) : ex;
      // npm / pnpm / Yarn (node-modules linker)
      if (
        normalizedId.includes(`/node_modules/${pkg}/`) ||
        normalizedId.endsWith(`/node_modules/${pkg}`)
      ) {
        return true;
      }
      // Yarn PnP cache paths
      if (
        normalizedId.includes(`/.yarn/cache/${pkg}-`) ||
        normalizedId.includes(
          `/.yarn/cache/${pkg.replace('@', '').replace('/', '+')}-`,
        ) ||
        (normalizedId.includes('/.yarn/cache/') &&
          normalizedId.includes(`/${pkg}/`))
      ) {
        return true;
      }
      return false;
    });
  };
}

async function linkCode(
  code: string,
  id: string,
): Promise<{ code: string; map: string | null; linked: boolean }> {
  const api = await loadOxcHmrApi();
  const result = await api.linkAngularPackage(code, id);
  return {
    code: result.linked ? result.code : code,
    map: result.map ?? null,
    linked: result.linked,
  };
}

/**
 * Vite plugin that links pre-compiled Angular library code from
 * node_modules. Mount only when `fastCompileEngine: 'oxc'` so the TS
 * engine path keeps its existing behavior.
 */
export function oxcLinkerPlugin(): Plugin {
  let optimizeDepsExclude: readonly string[] = [];

  return {
    name: '@analogjs/vite-plugin-angular-oxc-linker',

    configResolved(config: ResolvedConfig) {
      optimizeDepsExclude = config.optimizeDeps?.exclude ?? [];
    },

    config(_, { command }) {
      return {
        optimizeDeps: {
          // Rolldown-vite only: a pre-bundle `load` hook so linked output
          // is what gets bundled into the dep-optimizer chunks (avoiding a
          // second pass at request time). The hook is a no-op on classic
          // Vite — Vite's esbuild-based dep optimizer doesn't read it.
          rolldownOptions: {
            transform: {
              define: {
                ngJitMode: 'false',
                ngI18nClosureMode: 'false',
                ...(command === 'serve' ? {} : { ngDevMode: 'false' }),
              },
            },
            plugins: [
              {
                name: 'angular-linker-preload',
                load: {
                  filter: { id: /\.[cm]?js$/ },
                  async handler(id: string) {
                    if (createExcludeFilter(optimizeDepsExclude)(id)) return;
                    if (SKIP_REGEX.test(id)) return;

                    const code = await this.fs.readFile(id, {
                      encoding: 'utf8',
                    });
                    if (!code.includes(LINKER_DECLARATION_PREFIX)) return;

                    const result = await linkCode(code, id);
                    if (!result.linked) return;
                    return result.code;
                  },
                },
              },
            ],
          },
        },
      };
    },

    transform: {
      filter: { id: NODE_MODULES_JS_REGEX },
      async handler(code, id) {
        if (createExcludeFilter(optimizeDepsExclude)(id)) return;
        if (!JS_EXT_REGEX.test(id)) return;
        if (!code.includes(LINKER_DECLARATION_PREFIX)) return;
        if (SKIP_REGEX.test(id)) return;

        const result = await linkCode(code, id);
        if (!result.linked) return;
        return { code: result.code, map: result.map };
      },
    },
  };
}

/* ───────────────────────────────────────────────────────────────────────────
 * TEMPORARY: inline port of `@oxc-angular/vite`'s build-optimizer plugin.
 *
 * Upstream source: `@oxc-angular/vite@0.0.30` → `vite-plugin/angular-build-
 * optimizer-plugin.ts`. The plugin sets up Angular production build defines
 * (ngDevMode, ngJitMode, ngI18nClosureMode, ngServerMode) and runs OXC's
 * `optimizeAngularPackage` over FESM packages from node_modules in
 * production builds.
 *
 * Optimizations applied (matches OXC defaults):
 *   - elideMetadata: drop `ɵsetClassMetadata(...)` calls for tree-shaking
 *   - wrapStaticMembers: pure-IIFE-wrap static Ivy member assignments
 *   - markPure: annotate top-level calls with /* @__PURE__ *\/
 *   - adjustEnums: optimize TS enum patterns into pure IIFEs
 *
 * Ported because the `buildOptimizerPlugin()` factory isn't on
 * `@oxc-angular/vite/api`. The actual optimization work runs through the
 * public `optimizeAngularPackage` NAPI export.
 *
 * TODO(oxc-engine): swap for a re-export of `buildOptimizerPlugin` once
 * OXC exposes the plugin factory publicly.
 *
 * Regex use is limited to file-path filtering (`fesm20.*\.[cm]?js$`) —
 * allowed by the prefer-OXC-AST rule.
 * ─────────────────────────────────────────────────────────────────────── */
import type { Plugin, UserConfig } from 'vite';

import { loadOxcHmrApi } from './oxc-engine.js';

interface OxcOptimizeOptions {
  sourcemap?: boolean;
  elideMetadata?: boolean;
  wrapStaticMembers?: boolean;
  markPure?: boolean;
  adjustEnums?: boolean;
}

interface OxcOptimizerPluginOptions {
  jit: boolean;
  sourcemap: boolean;
}

// FESM packages — what OXC's optimizer targets. Matches Angular's
// own published bundles (`@angular/core/fesm2022/core.mjs`, etc.) and
// most third-party Angular libraries publishing in the same layout.
const FESM_REGEX = /fesm20.*\.[cm]?js$/;

export function oxcOptimizerPlugin({
  jit,
  sourcemap,
}: OxcOptimizerPluginOptions): Plugin {
  let isProd = false;

  return {
    name: '@analogjs/vite-plugin-angular-oxc-optimizer',
    apply: 'build',

    config(userConfig) {
      isProd =
        userConfig.mode === 'production' ||
        process.env['NODE_ENV'] === 'production';
      const isSSR = !!userConfig.build?.ssr;
      const ngServerMode = `${isSSR}`;

      if (isProd) {
        const defines = {
          ngJitMode: jit ? 'true' : 'false',
          ngI18nClosureMode: 'false',
          ngDevMode: 'false',
          ngServerMode,
        };
        return {
          define: defines,
          oxc: { define: defines },
        } as UserConfig;
      }

      // Dev SSR still needs `ngServerMode` so the runtime branches
      // into platform-server. Production-only flags stay unset.
      if (isSSR) {
        const defines = { ngServerMode };
        return {
          define: defines,
          oxc: { define: defines },
        } as UserConfig;
      }

      return undefined;
    },

    transform: {
      filter: { id: FESM_REGEX },
      async handler(code, id) {
        // Optimization only kicks in for production — dev keeps source
        // legible and avoids pure-IIFE wrapping that hampers debugging.
        if (!isProd) return;

        try {
          const api = await loadOxcHmrApi();
          const result = await api.optimizeAngularPackage(code, id, {
            sourcemap,
            elideMetadata: true,
            wrapStaticMembers: true,
            markPure: true,
            adjustEnums: true,
          } as OxcOptimizeOptions);

          return { code: result.code, map: result.map ?? null };
        } catch (e) {
          console.warn(
            `[oxc-optimizer] Failed to optimize ${id}: ${(e as Error)?.message ?? e}`,
          );
          return;
        }
      },
    },
  };
}

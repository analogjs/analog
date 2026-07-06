import type { Plugin } from 'vite';

/**
 * Pure transform that injects the streaming-SSR per-block resolution hook into
 * `@angular/core`'s compiled output. It is the same class of transform as
 * `i18nDefRegistryPlugin` in ./ssr-build-plugin — a string patch of Angular's
 * bundle applied only to SSR builds. Exported separately so it can be unit
 * tested against a bundle string.
 *
 * Two edits, both keyed on single-occurrence anchors in the module that holds
 * the defer runtime:
 *   1. Inside `applyDeferBlockState`, fire `globalThis.__analogSsrDeferCapture`
 *      when a `@defer` block reaches `Complete` on the server, passing the
 *      block's live `lContainer` — this is the per-block resolution signal a
 *      streaming renderer consumes.
 *   2. Expose `collectNativeNodesInLContainer` via `globalThis.__analogSsrInternals`
 *      so the renderer can serialize a block's subtree.
 *
 * Returns `null` when the module is not the one carrying the defer runtime, so
 * it is a no-op on every other Angular module.
 */
export function injectDeferStreamingHook(code: string): string | null {
  const END_ANCHOR = 'profiler(ProfilerEvent.DeferBlockStateEnd);';
  if (
    !code.includes('function applyDeferBlockState(') ||
    !code.includes(END_ANCHOR)
  ) {
    return null;
  }

  const capture =
    `if (newState === DeferBlockState.Complete && ` +
    `typeof ngServerMode !== 'undefined' && ngServerMode && ` +
    `typeof globalThis.__analogSsrDeferCapture === 'function') { ` +
    `try { globalThis.__analogSsrDeferCapture({ ssrUniqueId: lDetails[SSR_UNIQUE_ID], lContainer, hostLView }); } catch (e) {} }\n  `;

  let out = code.replace(END_ANCHOR, capture + END_ANCHOR);

  if (code.includes('function collectNativeNodesInLContainer(')) {
    out +=
      '\nglobalThis.__analogSsrInternals = Object.assign(globalThis.__analogSsrInternals || {}, { collectNativeNodesInLContainer });\n';
  }

  return out;
}

/**
 * Vite plugin that applies {@link injectDeferStreamingHook} to `@angular/core`
 * during SSR builds, so `@analogjs/router`'s `renderStream` can flush `@defer`
 * blocks as they resolve on the server — without hand-patching node_modules.
 *
 * Only active for SSR. Mirrors the enforce/filter/ssr-gate shape of
 * `i18nDefRegistryPlugin`.
 */
export function deferStreamingPlugin(): Plugin {
  return {
    name: 'analogjs-defer-streaming',
    enforce: 'post',
    transform: {
      filter: {
        id: /\/@angular\/core\//,
      },
      handler(code, _id, options) {
        if (!options?.ssr) return;
        const out = injectDeferStreamingHook(code);
        return out ? { code: out } : undefined;
      },
    },
  };
}

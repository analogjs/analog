import type { Plugin } from 'vite';

/**
 * Minimum Angular major whose compiled `@angular/core` FESM matches the
 * streaming patch anchors. Incremental hydration is a stable public API from
 * v20 (`withIncrementalHydration`, `@publicApi 20.0`), but v20's FESM inlines
 * the injection anchor's `DeferBlockStateEnd` profiler event to its numeric
 * ordinal, whereas v21+ keeps the symbolic `ProfilerEvent.DeferBlockStateEnd`
 * form the anchor matches on. Keying on the literal ordinal would be fragile
 * (enum values shift between versions), so v21 is the floor.
 */
export const MIN_STREAMING_ANGULAR_MAJOR = 21;

/**
 * Whether the streaming SSR patch can be applied to the installed Angular.
 * A `null` major (version undetectable) returns `true`: don't block on a failed
 * detection — the plugin's anchor-drift detection catches a real mismatch at
 * build time and falls back to buffered rendering.
 */
export function streamingSupportedOnAngular(major: number | null): boolean {
  return major === null || major >= MIN_STREAMING_ANGULAR_MAJOR;
}

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
 * Classify an `@angular/core` module for the streaming patch. The patch anchors
 * on internal symbol names, so when Angular changes those the transform would
 * otherwise become a silent no-op and streaming would degrade to buffered with
 * no signal. This distinguishes "not the target module" (skip quietly) from
 * "this IS the `@defer` runtime module but the anchors drifted" (worth warning).
 */
export function inspectAngularCoreModule(
  code: string,
):
  | { kind: 'not-target' }
  | { kind: 'patchable' }
  | { kind: 'drifted'; reason: string } {
  if (!code.includes('function applyDeferBlockState(')) {
    return { kind: 'not-target' };
  }
  const missing: string[] = [];
  if (!code.includes('profiler(ProfilerEvent.DeferBlockStateEnd);')) {
    missing.push('DeferBlockStateEnd profiler anchor');
  }
  if (!code.includes('function collectNativeNodesInLContainer(')) {
    missing.push('collectNativeNodesInLContainer');
  }
  return missing.length === 0
    ? { kind: 'patchable' }
    : { kind: 'drifted', reason: `missing ${missing.join(', ')}` };
}

/**
 * Vite plugin that applies {@link injectDeferStreamingHook} to `@angular/core`
 * during SSR builds, so `@analogjs/router`'s `renderStream` can flush `@defer`
 * blocks as they resolve on the server — without hand-patching node_modules.
 *
 * Only active for SSR. Mirrors the enforce/filter/ssr-gate shape of
 * `i18nDefRegistryPlugin`. If the `@defer` runtime module is found but its
 * anchors have drifted (Angular changed internals), or if it is never
 * encountered at all, the plugin warns rather than silently producing a build
 * that falls back to buffered rendering.
 */
export function deferStreamingPlugin(): Plugin {
  let applied = false;
  let warnedDrift = false;
  return {
    name: 'analogjs-defer-streaming',
    enforce: 'post',
    transform: {
      filter: {
        id: /\/@angular\/core\//,
      },
      handler(code, _id, options) {
        if (!options?.ssr) return;
        const info = inspectAngularCoreModule(code);
        if (info.kind === 'not-target') return;
        if (info.kind === 'drifted') {
          if (!warnedDrift) {
            warnedDrift = true;
            this.warn(
              `experimental streaming SSR: found @angular/core's @defer runtime ` +
                `but could not apply the resolution hook (${info.reason}). The ` +
                `installed Angular version likely changed internals the patch ` +
                `depends on; streaming will fall back to buffered rendering.`,
            );
          }
          return;
        }
        const out = injectDeferStreamingHook(code);
        if (!out) return;
        applied = true;
        return { code: out };
      },
    },
    buildEnd() {
      if (!applied && !warnedDrift) {
        this.warn(
          `experimental streaming SSR is enabled but @angular/core's @defer ` +
            `runtime module was never encountered during the SSR build, so the ` +
            `resolution hook was not injected. Streaming will fall back to ` +
            `buffered rendering.`,
        );
      }
    },
  };
}

import type { RegistryEntry } from './registry.js';

/**
 * Generate HMR code using Angular's ɵɵreplaceMetadata.
 *
 * The applyMetadata callback re-defines ɵcmp and ɵfac on the old class
 * by copying from the newly compiled class in the hot-updated module.
 * ɵɵreplaceMetadata then merges the old/new definitions and recreates
 * matching LViews in the component tree.
 *
 * Falls back to page reload if ɵɵreplaceMetadata throws.
 */
export function generateHmrCode(components: RegistryEntry[]): string {
  // Export applyMetadata functions so the accept callback can access them
  const applyFns = components
    .map(
      (c) => `
export function ɵhmr_${c.className}(type, namespaces) {
  type.ɵcmp = ${c.className}.ɵcmp;
  type.ɵfac = ${c.className}.ɵfac;
}`,
    )
    .join('\n');

  const replaceBlocks = components
    .map(
      (c) => `
      try {
        i0.ɵɵreplaceMetadata(
          ${c.className},
          newModule.ɵhmr_${c.className},
          { i0 },
          [],
          import.meta,
          "${c.className}"
        );
        replaced = true;
      } catch(e) {
        // ɵɵreplaceMetadata failed — will fall back to page reload
      }`,
    )
    .join('\n');

  return `\n${applyFns}
if (import.meta.hot) {
  import.meta.hot.accept((newModule) => {
    if (!newModule) return;
    let replaced = false;${replaceBlocks}
    if (!replaced) {
      // Fallback: if no component was successfully replaced (e.g. root component),
      // trigger a full page reload
      import.meta.hot.invalidate('Component HMR failed, reloading');
    }
  });
}`;
}

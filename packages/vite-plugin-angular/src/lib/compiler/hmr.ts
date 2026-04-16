import type { RegistryEntry } from './registry.js';

/**
 * Generate HMR code using Angular's ɵɵreplaceMetadata for components,
 * and simple field-swap + invalidation for directives/pipes.
 *
 * The applyMetadata callback dynamically copies all ɵ-prefixed static
 * fields (ɵcmp, ɵfac, ɵdir, ɵpipe, etc.) from the newly compiled class
 * to the old class reference that Angular's runtime is tracking.
 *
 * For components, ɵɵreplaceMetadata then merges the old/new definitions
 * and recreates matching LViews in the component tree.
 *
 * For directives and pipes, ɵɵreplaceMetadata does not support them, so
 * we fall back to a full page reload via import.meta.hot.invalidate().
 */
export function generateHmrCode(
  declarations: RegistryEntry[],
  localDepClassNames: string[] = [],
): string {
  const components = declarations.filter((d) => d.kind === 'component');
  const nonComponents = declarations.filter((d) => d.kind !== 'component');

  // Export applyMetadata functions so the accept callback can access them.
  // Dynamically copy all ɵ-prefixed static fields to handle ɵcmp, ɵfac,
  // ɵdir, ɵpipe, ɵmod, ɵinj, ɵprov, and any future Ivy fields.
  const applyFns = declarations
    .map(
      (c) => `
export function ɵhmr_${c.className}(type) {
  for (const key of Object.getOwnPropertyNames(${c.className})) {
    if (key.startsWith('ɵ')) type[key] = ${c.className}[key];
  }
}`,
    )
    .join('\n');

  // Components: use ɵɵreplaceMetadata for full LView recreation
  const localDepsArray =
    localDepClassNames.length > 0 ? `[${localDepClassNames.join(', ')}]` : '[]';

  const replaceBlocks = components
    .map(
      (c) => `
      try {
        i0.ɵɵreplaceMetadata(
          ${c.className},
          newModule.ɵhmr_${c.className},
          { i0 },
          ${localDepsArray},
          import.meta,
          "${c.className}"
        );
        replaced = true;
      } catch(e) {
        // ɵɵreplaceMetadata failed — will fall back to page reload
      }`,
    )
    .join('\n');

  // Directives/pipes: swap static fields and invalidate
  const swapBlocks = nonComponents
    .map(
      (c) => `
      try {
        newModule.ɵhmr_${c.className}(${c.className});
        swapped = true;
      } catch(e) {}`,
    )
    .join('\n');

  let acceptBody = `
    if (!newModule) return;`;

  if (components.length > 0) {
    acceptBody += `
    let replaced = false;${replaceBlocks}
    if (!replaced) {
      import.meta.hot.invalidate('Component HMR failed, reloading');
      return;
    }`;
  }

  if (nonComponents.length > 0) {
    acceptBody += `
    let swapped = false;${swapBlocks}
    if (swapped) {
      // Directive/pipe definitions updated — full reload needed for Angular
      // to pick up the new behavior since ɵɵreplaceMetadata only supports components.
      import.meta.hot.invalidate('Directive/pipe changed, reloading');
    }`;
  }

  return `\n${applyFns}
if (import.meta.hot) {
  import.meta.hot.accept((newModule) => {${acceptBody}
  });
}`;
}

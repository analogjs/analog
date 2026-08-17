/**
 * Maps registered by the esbuild builders' injected boot module. On the
 * Vite path the build injects the content globs into this package's
 * module graph directly; the esbuild path cannot (patching the FESM
 * would bypass the Angular linker), so the boot module calls the setter
 * below instead. Module-scoped, not a global: the Angular builder
 * bundles the server entry and main.server as separate graphs, each
 * with its own copy of this module.
 */
export interface AnalogEsbuildContentMaps {
  contentFilesList?: Record<string, Record<string, any>>;
  contentFiles?: Record<string, () => Promise<string>>;
}

let maps: AnalogEsbuildContentMaps = {};

/** @internal Called by the esbuild builders' injected boot module. */
export function ɵsetAnalogEsbuildContentMaps(
  next: AnalogEsbuildContentMaps,
): void {
  maps = next;
}

export function analogEsbuildContentMaps(): AnalogEsbuildContentMaps {
  return maps;
}

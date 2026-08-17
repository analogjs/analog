import type { Files } from './routes';

/**
 * Maps registered by the esbuild builders' injected boot module. On the
 * Vite path the build injects the route/endpoint globs into this
 * package's module graph directly; the esbuild path cannot (patching
 * the FESM would bypass the Angular linker), so the boot module calls
 * the setter below instead. The state is module-scoped, not a global,
 * on purpose: the Angular builder bundles the server entry and
 * main.server as separate graphs, each with its own copy of this
 * module — a process-wide global would hand one graph's import thunks
 * (and component defs) to the other graph's router.
 */
export interface AnalogEsbuildMaps {
  routeFiles?: Files;
  routeFilesMeta?: Record<string, { prerender?: boolean; streaming?: boolean }>;
  pageEndpoints?: Record<string, unknown>;
}

let maps: AnalogEsbuildMaps = {};

/** @internal Called by the esbuild builders' injected boot module. */
export function ɵsetAnalogEsbuildMaps(next: AnalogEsbuildMaps): void {
  maps = next;
}

export function analogEsbuildMaps(): AnalogEsbuildMaps {
  return maps;
}

/**
 * Nulls `def.tView` on every component definition that Angular has
 * compiled in this process. Angular caches the result of `consts()` on
 * `def.tView` — that factory is where `$localize` tagged templates are
 * evaluated — so without this reset the first rendered locale would be
 * frozen into the cache for the process lifetime.
 *
 * The set on `globalThis.__ngComponentDefs` is populated by a Vite
 * transform in `@analogjs/platform` that patches `@angular/core`'s
 * `getComponentId()` to mirror every compiled component definition to
 * a global Set, bypassing the `ngServerMode` guard that normally
 * prevents registration on the server.
 */
export function resetComponentDefTViews(): void {
  const defs = (globalThis as any).__ngComponentDefs as Set<any> | undefined;
  if (!defs) return;
  for (const def of defs) {
    def.tView = null;
  }
}

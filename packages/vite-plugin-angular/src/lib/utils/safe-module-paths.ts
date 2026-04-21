import { normalizePath, type ResolvedConfig } from 'vite';

/**
 * Mark a style file path as safe in Vite's `safeModulePaths` set so the
 * `?inline` import passes the Denied ID security check without needing
 * the plugin to intercept the load.
 *
 * Vite's own import-analysis transform does the same thing (adds the clean
 * URL to `safeModulePaths` during transform). We additionally add the
 * `?inline` form because `isServerAccessDeniedForTransform` checks *both*
 * `cleanUrl(id)` and the full `id` (with query) against the allow list.
 *
 * This lets `?inline` CSS flow through Vite's native CSS pipeline, which
 * handles preprocessing, `test.css` semantics, and browser-vs-node
 * differences without the plugin having to reimplement any of it.
 */
export function markStylePathSafe(
  config: ResolvedConfig | undefined,
  absPath: string,
): void {
  if (!config) return;
  const normalized = normalizePath(absPath);
  const safeModulePaths = (config as any).safeModulePaths as
    | Set<string>
    | undefined;
  if (safeModulePaths) {
    safeModulePaths.add(normalized);
    safeModulePaths.add(normalized + '?inline');
  }
}

import type { Plugin } from 'esbuild';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Loads the app's own esbuild plugins from `analog.plugins` module
 * paths (workspace-root-relative). Each module default-exports a
 * `Plugin`, a `Plugin[]`, or a zero-argument factory returning either.
 * They are appended after Analog's plugins, so the `analog:*` virtual
 * modules and route discovery stay authoritative, and apply to both
 * the browser and server bundles.
 */
export async function loadUserPlugins(
  paths: string[] | undefined,
  workspaceRoot: string,
): Promise<Plugin[]> {
  const plugins: Plugin[] = [];
  for (const path of paths ?? []) {
    const module = await import(
      pathToFileURL(resolve(workspaceRoot, path)).href
    );
    let exported = module.default ?? module;
    if (typeof exported === 'function') {
      exported = await exported();
    }
    for (const plugin of Array.isArray(exported) ? exported : [exported]) {
      if (
        typeof plugin?.name !== 'string' ||
        typeof plugin?.setup !== 'function'
      ) {
        throw new Error(
          `[analog] plugins: ${path} does not export an esbuild plugin ({ name, setup })`,
        );
      }
      plugins.push(plugin);
    }
  }
  return plugins;
}

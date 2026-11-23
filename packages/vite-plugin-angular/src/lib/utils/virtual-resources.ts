// Shared Vite plugin helpers for routing component resources (templates)
// through virtual module ids. Both angular-vite-plugin and fast-compile-plugin
// use these so the rewriting + loading behavior stays in sync between them.
//
// Style ?inline imports now flow through Vite's native CSS pipeline via
// safeModulePaths (see safe-module-paths.ts). Only template ?raw imports
// still use virtual ids.

import { promises as fsPromises, statSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { normalizePath, type ResolvedConfig } from 'vite';

import { markStylePathSafe } from './safe-module-paths.js';
import {
  fromVirtualRawId,
  isVirtualRawId,
  toVirtualRawId,
} from './virtual-ids.js';

interface PluginContextLike {
  addWatchFile(path: string): void;
}

function resolveImportPath(
  id: string,
  importer: string | undefined,
): string | undefined {
  const filePath = id.split('?')[0];
  return isAbsolute(filePath)
    ? normalizePath(filePath)
    : importer
      ? normalizePath(resolve(dirname(importer), filePath))
      : undefined;
}

/**
 * Rewrite a user `.html?raw` import to a virtual raw id. Returns undefined
 * when the id doesn't match, so callers can fall through to the next check.
 *
 * Routed through a virtual id (rather than `?analog-raw`) so the path Vite
 * sees has no file extension — keeps vite:asset / vite:css from re-tagging
 * the id before our load hook runs.
 */
export function rewriteHtmlRawImport(
  id: string,
  importer: string | undefined,
): string | undefined {
  if (!id.includes('.html?raw')) return undefined;
  const resolved = resolveImportPath(id, importer);
  return resolved ? toVirtualRawId(resolved) : undefined;
}

const FS_PREFIX = '/@fs/';

function isDirectory(path: string): boolean {
  return statSync(path, { throwIfNoEntry: false })?.isDirectory() ?? false;
}

/**
 * The file a URL that Vite wrote into a module's code points at. Vitest
 * resolves the imports of a module restored from `fsModuleCache` by these
 * URLs, so they must resolve to the same file as the original import.
 * `/@fs/<path>` is that path. A root-relative URL (`/src/app/a.css`) is the
 * file under the Vite root when there is one; otherwise the caller reads it
 * as the path given, which is the order Vite tries the two in. A URL that
 * already starts with the root's path is root-relative only when the root
 * holds a directory at its own path (`/app/app`), as in Vite's resolver.
 */
function resolveViteUrl(
  url: string,
  root: string | undefined,
): string | undefined {
  if (url.startsWith(FS_PREFIX)) {
    const fsPath = url.slice(FS_PREFIX.length);
    // `/@fs/C:/a.css` on Windows, `/@fs/home/a.css` elsewhere.
    return /^[A-Z]:/i.test(fsPath) ? fsPath : `/${fsPath}`;
  }
  if (!root || !url.startsWith('/')) {
    return undefined;
  }
  if (url.startsWith(`${root}/`) && !isDirectory(join(root, root))) {
    return undefined;
  }
  const filePath = join(root, url);
  return statSync(filePath, { throwIfNoEntry: false })?.isFile()
    ? filePath
    : undefined;
}

/**
 * Resolve a user `.scss?inline` / `.css?inline` import to its file and mark
 * it safe, so Vite's native CSS pipeline handles it. Returns undefined when
 * the id doesn't match, so callers can fall through to the next check.
 */
export function resolveStyleInlineImport(
  id: string,
  importer: string | undefined,
  config: ResolvedConfig | undefined,
): string | undefined {
  if (!/\.(css|scss|sass|less)\?inline$/.test(id) || !importer) {
    return undefined;
  }
  const filePath = id.split('?')[0];
  const resolved = normalizePath(
    resolveViteUrl(filePath, config?.root) ??
      (isAbsolute(filePath) ? filePath : resolve(dirname(importer), filePath)),
  );
  markStylePathSafe(config, resolved);
  return resolved + '?inline';
}

/**
 * Load a virtual raw module: reads the backing file, registers it for HMR
 * watching, and returns its content as a default-exported string. Returns
 * undefined when the id is not a virtual raw id.
 */
export async function loadVirtualRawModule(
  ctx: PluginContextLike,
  id: string,
): Promise<string | undefined> {
  if (!isVirtualRawId(id)) return undefined;
  const filePath = fromVirtualRawId(id);
  ctx.addWatchFile(filePath);
  const content = await fsPromises.readFile(filePath, 'utf-8');
  return `export default ${JSON.stringify(content)}`;
}

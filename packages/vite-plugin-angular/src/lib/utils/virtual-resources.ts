// Shared Vite plugin helpers for routing component resources (templates)
// through virtual module ids. Both angular-vite-plugin and
// analog-compiler-plugin use these so the rewriting + loading behavior stays
// in sync between them.
//
// Style ?inline imports now flow through Vite's native CSS pipeline via
// safeModulePaths (see safe-module-paths.ts). Only template ?raw imports
// still use virtual ids.

import { promises as fsPromises } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { normalizePath } from 'vite';

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

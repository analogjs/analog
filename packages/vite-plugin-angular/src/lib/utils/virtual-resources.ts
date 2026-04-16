// Shared Vite plugin helpers for routing component resources (templates,
// external styles) through virtual module ids. Both angular-vite-plugin and
// analog-compiler-plugin use these so the rewriting + loading behavior stays
// in sync between them.

import { promises as fsPromises } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { normalizePath, preprocessCSS, type ResolvedConfig } from 'vite';

import {
  fromVirtualRawId,
  fromVirtualStyleId,
  isVirtualRawId,
  isVirtualStyleId,
  toVirtualRawId,
  toVirtualStyleId,
} from './virtual-ids.js';

const INLINE_STYLE_QUERY_RE = /\.(css|scss|sass|less)\?inline$/;

interface PluginContextLike {
  addWatchFile(path: string): void;
}

type CssPattern = string | RegExp;

type VitestCssOption =
  | boolean
  | undefined
  | {
      // Vitest accepts both single patterns and arrays for include/exclude.
      include?: CssPattern | CssPattern[];
      exclude?: CssPattern | CssPattern[];
    };

/**
 * True when the given stylesheet should be run through Vite's `preprocessCSS`,
 * given Vitest's `test.css` semantics:
 *
 *   - non-test contexts        → always preprocess
 *   - `test.css: true`         → always preprocess
 *   - `test.css: false`        → never preprocess
 *   - `test.css: { include }`  → preprocess only when `filePath` matches an
 *                                 include pattern and isn't excluded
 *   - `test.css` unset         → Vitest defaults to `include: []`, so nothing
 *                                 matches and we don't preprocess
 *
 * Used to gate `preprocessCSS` calls in test mode so we don't surface SCSS
 * deprecation noise or pay preprocessing cost the user didn't ask for. (#2297)
 */
export function shouldPreprocessTestCss(
  config: ResolvedConfig | undefined,
  filePath?: string,
): boolean {
  const isTest = process.env['NODE_ENV'] === 'test' || !!process.env['VITEST'];
  if (!isTest) return true;

  const cssOpt = (
    config as
      | (ResolvedConfig & { test?: { css?: VitestCssOption } })
      | undefined
  )?.test?.css;

  if (cssOpt === true) return true;
  if (cssOpt === false || cssOpt == null) return false;

  const toArray = <T>(value: T | T[] | undefined): T[] =>
    value == null ? [] : Array.isArray(value) ? value : [value];
  const include = toArray(cssOpt.include);
  const exclude = toArray(cssOpt.exclude);
  if (!filePath || include.length === 0) return false;

  const matches = (patterns: CssPattern[]) =>
    patterns.some((p) =>
      typeof p === 'string' ? filePath.includes(p) : p.test(filePath),
    );

  return matches(include) && !matches(exclude);
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
 * Rewrite a user `.scss?inline` / `.css?inline` / … import to a virtual
 * style id. Returns undefined when the id doesn't match.
 */
export function rewriteInlineStyleImport(
  id: string,
  importer: string | undefined,
): string | undefined {
  if (!INLINE_STYLE_QUERY_RE.test(id)) return undefined;
  const resolved = resolveImportPath(id, importer);
  return resolved ? toVirtualStyleId(resolved) : undefined;
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

/**
 * Load a virtual style module: reads the backing stylesheet, runs it through
 * Vite's CSS preprocessor, and returns the result as a default-exported
 * string. Returns undefined when the id is not a virtual style id.
 */
export async function loadVirtualStyleModule(
  ctx: PluginContextLike,
  id: string,
  resolvedConfig: ResolvedConfig,
): Promise<string | undefined> {
  if (!isVirtualStyleId(id)) return undefined;
  const filePath = fromVirtualStyleId(id);
  ctx.addWatchFile(filePath);
  const code = await fsPromises.readFile(filePath, 'utf-8');
  // In tests, mirror Vitest's `test.css` rules — defaults to no preprocessing
  // (matches Vite's CSS pipeline behavior under Vitest). (#2297)
  if (!shouldPreprocessTestCss(resolvedConfig, filePath)) {
    return `export default ${JSON.stringify(code)}`;
  }
  const result = await preprocessCSS(code, filePath, resolvedConfig);
  return `export default ${JSON.stringify(result.code)}`;
}

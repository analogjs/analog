import * as path from 'node:path';
import * as fs from 'node:fs';
import { type ResolvedConfig, preprocessCSS } from 'vite';
import { extractInlineStyles, extractStyleUrls } from './style-ast.js';

const STYLE_EXTS = new Set(['.scss', '.sass', '.less', '.styl']);

/**
 * Extract styleUrl/styleUrls from source using OXC parser,
 * read and preprocess them via Vite.
 * Returns a Map of absolute path → compiled CSS for the compiler to use.
 */
export async function resolveStyleFiles(
  code: string,
  id: string,
  resolvedConfig: ResolvedConfig,
): Promise<Map<string, string> | undefined> {
  if (!code.includes('styleUrl')) return undefined;

  const styleUrls = extractStyleUrls(code, id);
  if (styleUrls.length === 0) return undefined;

  const result = new Map<string, string>();
  const dir = path.dirname(id);

  for (const url of styleUrls) {
    if (!STYLE_EXTS.has(path.extname(url))) continue;
    const filePath = path.resolve(dir, url);
    try {
      const source = fs.readFileSync(filePath, 'utf-8');
      const processed = await preprocessCSS(source, filePath, resolvedConfig);
      result.set(filePath, processed.code);
    } catch (e: any) {
      console.warn(
        `[fast-compile] Style preprocessing failed for ${filePath}: ${e.message}`,
      );
    }
  }

  return result.size > 0 ? result : undefined;
}

/**
 * Preprocess inline styles that contain SCSS/Sass syntax.
 * Uses OXC parser to extract style strings from decorator arguments
 * and runs them through Vite's preprocessCSS.
 */
export async function preprocessInlineStyles(
  code: string,
  id: string,
  inlineStyleLanguage: string,
  resolvedConfig: ResolvedConfig,
): Promise<Map<number, string> | undefined> {
  if (inlineStyleLanguage === 'css') return undefined;
  if (!code.includes('styles')) return undefined;

  const styleStrings = extractInlineStyles(code, id);
  if (styleStrings.length === 0) return undefined;

  const result = new Map<number, string>();
  for (let i = 0; i < styleStrings.length; i++) {
    try {
      const fakePath = id.replace(
        /\.ts$/,
        `.inline-${i}.${inlineStyleLanguage}`,
      );
      const processed = await preprocessCSS(
        styleStrings[i],
        fakePath,
        resolvedConfig,
      );
      result.set(i, processed.code);
    } catch (e: any) {
      console.warn(
        `[fast-compile] Inline style preprocessing failed in ${id}: ${e.message}`,
      );
    }
  }

  return result.size > 0 ? result : undefined;
}

import * as path from 'node:path';
import * as fs from 'node:fs';
import { type ResolvedConfig, preprocessCSS } from 'vite';

/**
 * Extract styleUrl/styleUrls from source, read and preprocess them via Vite.
 * Returns a Map of absolute path → compiled CSS for the compiler to use.
 */
export async function resolveStyleFiles(
  code: string,
  id: string,
  resolvedConfig: ResolvedConfig,
): Promise<Map<string, string> | undefined> {
  // Quick check: does the source reference external styles?
  if (!code.includes('styleUrl')) return undefined;

  // Extract styleUrl and styleUrls paths with a simple regex
  const styleUrls: string[] = [];
  const singleMatch = code.match(/styleUrl\s*:\s*['"`]([^'"`]+)['"`]/);
  if (singleMatch) styleUrls.push(singleMatch[1]);
  const arrayMatch = code.matchAll(/styleUrls\s*:\s*\[([^\]]+)\]/g);
  for (const m of arrayMatch) {
    const urls = m[1].matchAll(/['"`]([^'"`]+)['"`]/g);
    for (const u of urls) styleUrls.push(u[1]);
  }

  if (styleUrls.length === 0) return undefined;

  const result = new Map<string, string>();
  const dir = path.dirname(id);

  for (const url of styleUrls) {
    if (!/\.(scss|sass|less|styl)$/.test(url)) continue;
    const filePath = path.resolve(dir, url);
    try {
      const source = fs.readFileSync(filePath, 'utf-8');
      const processed = await preprocessCSS(source, filePath, resolvedConfig);
      result.set(filePath, processed.code);
    } catch (e: any) {
      console.warn(
        `[angular-compiler] Style preprocessing failed for ${filePath}: ${e.message}`,
      );
    }
  }

  return result.size > 0 ? result : undefined;
}

/**
 * Preprocess inline styles that contain SCSS/Sass syntax.
 * Uses TypeScript AST to extract style strings from decorator arguments
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

  // Use TypeScript AST to reliably extract inline style strings
  const ts = await import('typescript');
  const sf = ts.createSourceFile(id, code, ts.ScriptTarget.Latest, true);
  const styleStrings: string[] = [];

  // Walk AST to find styles property in decorator arguments
  function visit(node: any) {
    if (ts.isPropertyAssignment(node) && node.name.getText(sf) === 'styles') {
      const val = node.initializer;
      if (ts.isArrayLiteralExpression(val)) {
        for (const el of val.elements) {
          if (
            ts.isStringLiteral(el) ||
            ts.isNoSubstitutionTemplateLiteral(el)
          ) {
            styleStrings.push(el.text);
          }
        }
      } else if (
        ts.isStringLiteral(val) ||
        ts.isNoSubstitutionTemplateLiteral(val)
      ) {
        // styles: `...` (singular string)
        styleStrings.push(val.text);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);

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
        `[angular-compiler] Inline style preprocessing failed in ${id}: ${e.message}`,
      );
    }
  }

  return result.size > 0 ? result : undefined;
}

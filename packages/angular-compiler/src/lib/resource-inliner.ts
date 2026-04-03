import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseSync } from 'oxc-parser';
import MagicString from 'magic-string';
import { extractInlineStyles as extractStylesFromAst } from './style-ast.js';

/**
 * Inline external templateUrl and styleUrl/styleUrls into the source code
 * using OXC parser for precise AST-based rewriting.
 *
 * Replaces:
 *   templateUrl: './file.html'  →  template: "...file contents..."
 *   styleUrl: './file.css'      →  styles: ["...file contents..."]
 *   styleUrls: ['./a.css']      →  styles: ["...contents..."]
 *
 * Returns the modified source code, or the original if no changes were needed.
 */
export function inlineResourceUrls(code: string, fileName: string): string {
  if (!code.includes('templateUrl') && !code.includes('styleUrl')) {
    return code;
  }

  const { program } = parseSync(fileName, code);
  const ms = new MagicString(code);
  let changed = false;
  const dir = path.dirname(fileName);

  for (const node of program.body) {
    const decl =
      node.type === 'ExportNamedDeclaration' ||
      node.type === 'ExportDefaultDeclaration'
        ? (node as any).declaration
        : node;
    if (!decl || decl.type !== 'ClassDeclaration') continue;

    for (const dec of decl.decorators || []) {
      const expr = dec.expression;
      if (!expr || expr.type !== 'CallExpression') continue;
      if (expr.callee?.name !== 'Component') continue;

      const arg = expr.arguments?.[0];
      if (!arg || arg.type !== 'ObjectExpression') continue;

      for (const prop of arg.properties) {
        if (prop.type !== 'Property') continue;
        const key: string = prop.key?.name || prop.key?.value;
        const val = prop.value;

        // templateUrl: './file.html' → template: "...contents..."
        if (
          key === 'templateUrl' &&
          val?.type === 'Literal' &&
          typeof val.value === 'string'
        ) {
          try {
            const filePath = path.resolve(dir, val.value);
            const content = fs.readFileSync(filePath, 'utf-8');
            ms.overwrite(
              prop.start,
              prop.end,
              `template: ${JSON.stringify(content)}`,
            );
            changed = true;
          } catch {
            // Keep original if file can't be read
          }
        }

        // styleUrl: './file.css' → styles: ["...contents..."]
        if (
          key === 'styleUrl' &&
          val?.type === 'Literal' &&
          typeof val.value === 'string'
        ) {
          try {
            const filePath = path.resolve(dir, val.value);
            const content = fs.readFileSync(filePath, 'utf-8');
            ms.overwrite(
              prop.start,
              prop.end,
              `styles: [${JSON.stringify(content)}]`,
            );
            changed = true;
          } catch {
            // Keep original if file can't be read
          }
        }

        // styleUrls: ['./a.css', './b.css'] → styles: ["...a...", "...b..."]
        if (key === 'styleUrls' && val?.type === 'ArrayExpression') {
          const contents: string[] = [];
          let allRead = true;
          for (const el of val.elements) {
            if (el?.type === 'Literal' && typeof el.value === 'string') {
              try {
                const filePath = path.resolve(dir, el.value);
                contents.push(fs.readFileSync(filePath, 'utf-8'));
              } catch {
                allRead = false;
                break;
              }
            }
          }
          if (allRead && contents.length > 0) {
            ms.overwrite(
              prop.start,
              prop.end,
              `styles: [${contents.map((c) => JSON.stringify(c)).join(', ')}]`,
            );
            changed = true;
          }
        }
      }
    }
  }

  return changed ? ms.toString() : code;
}

/**
 * Extract inline style strings from Angular @Component decorator using OXC parser.
 * Returns an array of style string values for preprocessing.
 */
export function extractInlineStyles(code: string, fileName: string): string[] {
  if (!code.includes('styles')) return [];
  return extractStylesFromAst(code, fileName);
}

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
 * When the decorator already has a `styles: [...]` array, inlined CSS is
 * merged into that existing array instead of emitting a second `styles`
 * property (which would be a duplicate object literal key).
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

      // First pass: locate an existing `styles: [...]` array in the same
      // decorator. Inlined CSS will be merged into it to avoid duplicate keys.
      let existingStylesArray: any = null;
      for (const prop of arg.properties) {
        if (prop.type !== 'Property') continue;
        const key: string = prop.key?.name ?? prop.key?.value;
        if (key === 'styles' && prop.value?.type === 'ArrayExpression') {
          existingStylesArray = prop.value;
          break;
        }
      }

      // Collect the props we want to rewrite. Contents from styleUrl /
      // styleUrls are accumulated so that multiple url-based props in one
      // decorator collapse into a single `styles` array write.
      const templateUrlRewrites: Array<{ prop: any; content: string }> = [];
      const cssProps: Array<{ prop: any; contents: string[] }> = [];

      for (const prop of arg.properties) {
        if (prop.type !== 'Property') continue;
        const key: string = prop.key?.name ?? prop.key?.value;
        const val = prop.value;

        if (
          key === 'templateUrl' &&
          val?.type === 'Literal' &&
          typeof val.value === 'string'
        ) {
          try {
            const filePath = path.resolve(dir, val.value);
            const content = fs.readFileSync(filePath, 'utf-8');
            templateUrlRewrites.push({ prop, content });
          } catch {
            // Keep original if file can't be read
          }
          continue;
        }

        if (
          key === 'styleUrl' &&
          val?.type === 'Literal' &&
          typeof val.value === 'string'
        ) {
          try {
            const filePath = path.resolve(dir, val.value);
            const content = fs.readFileSync(filePath, 'utf-8');
            cssProps.push({ prop, contents: [content] });
          } catch {
            // Keep original if file can't be read
          }
          continue;
        }

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
            cssProps.push({ prop, contents });
          }
        }
      }

      for (const { prop, content } of templateUrlRewrites) {
        ms.overwrite(
          prop.start,
          prop.end,
          `template: ${JSON.stringify(content)}`,
        );
        changed = true;
      }

      if (cssProps.length > 0) {
        const allContents = cssProps.flatMap((c) => c.contents);

        if (existingStylesArray) {
          // Filter out null holes in case the source already has a sparse array.
          const realElements = (existingStylesArray.elements as any[]).filter(
            (e) => e != null,
          );

          if (realElements.length > 0) {
            // Insert right after the last real element. This preserves any
            // trailing comma the source may have (e.g. Prettier output) and
            // avoids producing a sparse `[existing, , "new"]` element, which
            // would crash downstream decorator metadata extraction.
            const lastElement = realElements[realElements.length - 1];
            const insertion = allContents
              .map((c) => `, ${JSON.stringify(c)}`)
              .join('');
            ms.appendRight(lastElement.end, insertion);
          } else {
            // Empty array — drop the leading comma.
            const insertion = allContents
              .map((c) => JSON.stringify(c))
              .join(', ');
            ms.appendLeft(existingStylesArray.end - 1, insertion);
          }

          for (const { prop } of cssProps) {
            removePropertyWithSeparator(ms, code, prop.start, prop.end);
          }
        } else {
          // No existing `styles` array — rewrite the first styleUrl/styleUrls
          // prop with the merged contents and drop any additional ones so we
          // don't emit multiple `styles` properties.
          const [first, ...rest] = cssProps;
          ms.overwrite(
            first.prop.start,
            first.prop.end,
            `styles: [${allContents.map((c) => JSON.stringify(c)).join(', ')}]`,
          );
          for (const { prop } of rest) {
            removePropertyWithSeparator(ms, code, prop.start, prop.end);
          }
        }
        changed = true;
      }
    }
  }

  return changed ? ms.toString() : code;
}

/**
 * Remove a property from an object literal while also eating one surrounding
 * comma so the resulting object stays syntactically valid. Prefers the
 * trailing comma; falls back to the leading comma when the property is the
 * last entry in the object.
 */
function removePropertyWithSeparator(
  ms: MagicString,
  code: string,
  propStart: number,
  propEnd: number,
): void {
  let i = propEnd;
  while (i < code.length && isWhitespace(code[i])) i++;
  if (code[i] === ',') {
    ms.remove(propStart, i + 1);
    return;
  }
  let j = propStart - 1;
  while (j >= 0 && isWhitespace(code[j])) j--;
  if (code[j] === ',') {
    ms.remove(j, propEnd);
    return;
  }
  ms.remove(propStart, propEnd);
}

function isWhitespace(ch: string): boolean {
  return (
    ch === ' ' ||
    ch === '\t' ||
    ch === '\n' ||
    ch === '\r' ||
    ch === '\f' ||
    ch === '\v'
  );
}

/**
 * Extract inline style strings from Angular @Component decorator using OXC parser.
 * Returns an array of style string values for preprocessing.
 */
export function extractInlineStyles(code: string, fileName: string): string[] {
  if (!code.includes('styles')) return [];
  return extractStylesFromAst(code, fileName);
}

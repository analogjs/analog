import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseSync } from 'oxc-parser';
import MagicString from 'magic-string';
import { extractInlineStyles as extractStylesFromAst } from './style-ast.js';

export interface InlineResourceResult {
  /** The modified source code, or the original if no changes were needed. */
  code: string;
  /**
   * Source extension (without the leading dot, lower-cased — e.g. `scss`) of
   * each inlined external style, keyed by its position in the flat per-file
   * style list produced by {@link extractInlineStyles}. Lets the caller run
   * each external `styleUrl` through the right preprocessor by its own file
   * extension, independent of the `inlineStylesExtension` option (which governs
   * truly-inline `styles: [...]` template strings).
   */
  styleExtensions: Map<number, string>;
}

/** Whether a node is an inline style value (string literal or single-quasi template). */
function isInlineStyleValue(node: any): boolean {
  return (
    (node?.type === 'Literal' && typeof node.value === 'string') ||
    (node?.type === 'TemplateLiteral' && node.quasis?.length === 1)
  );
}

/** Count the elements of a `styles: [...]` array that {@link extractInlineStyles} would emit. */
function countInlineStyleLiterals(arrayExpr: any): number {
  let count = 0;
  for (const el of arrayExpr.elements ?? []) {
    if (el?.type === 'Literal' && typeof el.value === 'string') count++;
    else if (el?.type === 'TemplateLiteral' && el.quasis?.length === 1) count++;
  }
  return count;
}

/**
 * Inline external templateUrl and styleUrl/styleUrls into the source code
 * using OXC parser for precise AST-based rewriting.
 *
 * Replaces:
 *   templateUrl: './file.html'  →  template: "...file contents..."
 *   styleUrl: './file.scss'     →  styles: ["...file contents..."]
 *   styleUrls: ['./a.scss']     →  styles: ["...contents..."]
 *
 * When the decorator already has a `styles: [...]` array, inlined CSS is
 * merged into that existing array instead of emitting a second `styles`
 * property (which would be a duplicate object literal key).
 *
 * Returns the modified source code plus the per-style-index extension map
 * (see {@link InlineResourceResult}).
 */
export function inlineResourceUrls(
  code: string,
  fileName: string,
): InlineResourceResult {
  const styleExtensions = new Map<number, string>();

  if (!code.includes('templateUrl') && !code.includes('styleUrl')) {
    return { code, styleExtensions };
  }

  const { program } = parseSync(fileName, code);
  const ms = new MagicString(code);
  let changed = false;
  const dir = path.dirname(fileName);

  // Running base index into the flat per-file style list (matching the order
  // `extractInlineStyles` walks classes/decorators/properties) so external
  // styles can be mapped to the index `resolvedInlineStyles` later keys on.
  let flatStyleBase = 0;

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

      // First pass: locate an existing `styles` property in the same decorator.
      // Inlined CSS is merged into it — converting a singular string/template
      // value to an array when needed — to avoid emitting a duplicate `styles`
      // key.
      let existingStylesProp: any = null;
      let existingStylesArray: any = null;
      for (const prop of arg.properties) {
        if (prop.type !== 'Property') continue;
        const key: string = prop.key?.name ?? prop.key?.value;
        if (key === 'styles') {
          existingStylesProp = prop;
          if (prop.value?.type === 'ArrayExpression') {
            existingStylesArray = prop.value;
          }
          break;
        }
      }

      // Inline `styles` entries already present come first in the flat list;
      // appended external styles follow them.
      const existingInlineCount = existingStylesArray
        ? countInlineStyleLiterals(existingStylesArray)
        : isInlineStyleValue(existingStylesProp?.value)
          ? 1
          : 0;

      // Collect the props we want to rewrite. Contents from styleUrl /
      // styleUrls are accumulated so that multiple url-based props in one
      // decorator collapse into a single `styles` array write. `extensions`
      // tracks each content's source extension in the same order.
      const templateUrlRewrites: Array<{ prop: any; content: string }> = [];
      const cssProps: Array<{
        prop: any;
        contents: string[];
        extensions: string[];
      }> = [];

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
            cssProps.push({
              prop,
              contents: [content],
              extensions: [extensionOf(filePath)],
            });
          } catch {
            // Keep original if file can't be read
          }
          continue;
        }

        if (key === 'styleUrls' && val?.type === 'ArrayExpression') {
          const contents: string[] = [];
          const extensions: string[] = [];
          let allRead = true;
          for (const el of val.elements) {
            if (el?.type === 'Literal' && typeof el.value === 'string') {
              try {
                const filePath = path.resolve(dir, el.value);
                contents.push(fs.readFileSync(filePath, 'utf-8'));
                extensions.push(extensionOf(filePath));
              } catch {
                allRead = false;
                break;
              }
            }
          }
          if (allRead && contents.length > 0) {
            cssProps.push({ prop, contents, extensions });
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
        const allExtensions = cssProps.flatMap((c) => c.extensions);

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
        } else if (isInlineStyleValue(existingStylesProp?.value)) {
          // Singular `styles: '...'` / `styles: \`...\`` — wrap the original
          // value into an array merged with the inlined styles, then drop the
          // styleUrl props so only one `styles` key remains.
          const original = code.slice(
            existingStylesProp.value.start,
            existingStylesProp.value.end,
          );
          const merged = allContents
            .map((c) => `, ${JSON.stringify(c)}`)
            .join('');
          ms.overwrite(
            existingStylesProp.value.start,
            existingStylesProp.value.end,
            `[${original}${merged}]`,
          );
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

        // The appended external styles occupy the flat indices after any
        // pre-existing inline styles for this component.
        const externalBase = flatStyleBase + existingInlineCount;
        allExtensions.forEach((ext, k) => {
          if (ext) styleExtensions.set(externalBase + k, ext);
        });
        flatStyleBase = externalBase + allContents.length;
      } else {
        flatStyleBase += existingInlineCount;
      }
    }
  }

  return { code: changed ? ms.toString() : code, styleExtensions };
}

/** Lower-cased file extension without the leading dot (e.g. `scss`), or `''`. */
function extensionOf(filePath: string): string {
  return path.extname(filePath).slice(1).toLowerCase();
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

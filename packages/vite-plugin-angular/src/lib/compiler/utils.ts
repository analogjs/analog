import * as path from 'node:path';
import {
  parseSync,
  rawTransferSupported,
  type ParseResult,
  type ParserOptions,
} from 'oxc-parser';

// Raw transfer reads the AST straight from Rust memory instead of going
// through JSON (~3x faster). Not yet in oxc-parser's published types.
const parserOptions = {
  experimentalRawTransfer: rawTransferSupported(),
} as ParserOptions;

/** Parse with oxc-parser, using raw transfer when the platform supports it. */
export function parseOxc(fileName: string, code: string): ParseResult {
  return parseSync(fileName, code, parserOptions);
}

/** Recursively find all class declarations in an OXC AST, including nested scopes. */
export function findAllClasses(program: any): any[] {
  const result: any[] = [];
  walkOxc(program, (node) => {
    if (node.type === 'ClassDeclaration') result.push(node);
    return true;
  });
  return result;
}

/**
 * Depth-first walk over OXC AST nodes. `visit` returns `false` to skip a
 * node's children.
 */
export function walkOxc(node: any, visit: (node: any) => boolean): void {
  if (Array.isArray(node)) {
    for (const child of node) walkOxc(child, visit);
    return;
  }
  if (!node || typeof node.type !== 'string' || !visit(node)) return;
  for (const key in node) {
    const value = node[key];
    if (value && typeof value === 'object') walkOxc(value, visit);
  }
}

/** Unwrap forwardRef(() => X) to X for OXC AST nodes. Returns the original node if not a forwardRef call. */
export function unwrapForwardRefOxc(node: any): any {
  if (
    node?.type === 'CallExpression' &&
    node.callee?.type === 'Identifier' &&
    node.callee.name === 'forwardRef'
  ) {
    const arg = node.arguments?.[0];
    if (arg?.type === 'ArrowFunctionExpression') {
      if (
        arg.body?.type === 'FunctionBody' ||
        arg.body?.type === 'BlockStatement'
      ) {
        const stmts = arg.body.statements || arg.body.body || [];
        const stmt = stmts[0];
        if (stmt?.type === 'ReturnStatement' && stmt.argument)
          return stmt.argument;
      } else {
        // Expression body: forwardRef(() => X)
        return arg.body;
      }
    }
    if (arg?.type === 'FunctionExpression') {
      const stmts = arg.body?.statements || arg.body?.body || [];
      if (stmts.length === 1) {
        const stmt = stmts[0];
        if (stmt?.type === 'ReturnStatement' && stmt.argument)
          return stmt.argument;
      }
    }
  }
  return node;
}

/**
 * Resolve the module specifier to use for a synthetic import of a registry
 * declaration referenced from `currentFileName`.
 *
 * Order of preference:
 *  1. `entry.sourcePackage` — external packages scanned from `.d.ts` resolve
 *     via their package name (proper barrel exports).
 *  2. A relative path derived from `currentFileName` to `entry.fileName` — for
 *     local workspace classes scanned from real source files. This is what
 *     NgModule/tuple export expansion must use: the class lives in its own
 *     file, not the module/barrel file that re-exports it, so importing from
 *     the module specifier fails with
 *     `"X" is not exported by ".../the.module.ts"`.
 *  3. `fallbackSpecifier` — the import path of the module/tuple itself, used
 *     for `.d.ts` entries (whose file path is not a usable import target) and
 *     when the registry has no file location for the class.
 *
 * Returns `undefined` when the class is declared in `currentFileName` itself
 * (already in scope — no synthetic import needed).
 */
export function resolveSyntheticImportSpecifier(
  currentFileName: string,
  entry: { sourcePackage?: string; fileName?: string },
  fallbackSpecifier: string | undefined,
): string | undefined {
  if (entry.sourcePackage) return entry.sourcePackage;
  // `.d.ts` entries come from scanning external package type declarations;
  // their file path is not a usable relative import target, so defer to the
  // module/tuple specifier the consumer already imports from.
  if (entry.fileName && !entry.fileName.endsWith('.d.ts')) {
    if (entry.fileName === currentFileName) return undefined;
    return deriveRelativeImportPath(currentFileName, entry.fileName);
  }
  return fallbackSpecifier;
}

/**
 * Derive a relative module specifier from `fromFile` to `toFile`, suitable for
 * a synthetic `import { … } from '…'` statement: strips the file extension,
 * normalizes to POSIX separators, and ensures an explicit `./` prefix.
 */
export function deriveRelativeImportPath(
  fromFile: string,
  toFile: string,
): string {
  let rel = path.relative(path.dirname(fromFile), toFile);
  rel = rel.replace(/\.[cm]?[jt]sx?$/, '');
  rel = rel.split(path.sep).join('/');
  if (!rel.startsWith('.')) rel = './' + rel;
  return rel;
}

export { ANGULAR_DECORATORS } from './constants.js';

import * as ts from 'typescript';
import * as path from 'node:path';

/** Collect type-only imported names: `import type { X }` and `import { type X }`. */
export function collectTypeOnlyImports(sf: ts.SourceFile): Set<string> {
  const result = new Set<string>();
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || !stmt.importClause) continue;
    const clause = stmt.importClause;
    if (clause.isTypeOnly) {
      if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const el of clause.namedBindings.elements)
          result.add(el.name.text);
      }
      if (clause.name) result.add(clause.name.text);
    } else if (
      clause.namedBindings &&
      ts.isNamedImports(clause.namedBindings)
    ) {
      for (const el of clause.namedBindings.elements) {
        if (el.isTypeOnly) result.add(el.name.text);
      }
    }
  }
  return result;
}

/** Recursively find all class declarations in a source file, including nested scopes. */
export function findAllClasses(sf: ts.SourceFile): ts.ClassDeclaration[] {
  const result: ts.ClassDeclaration[] = [];
  function walk(node: ts.Node) {
    if (ts.isClassDeclaration(node)) result.push(node);
    ts.forEachChild(node, walk);
  }
  walk(sf);
  return result;
}

/** Unwrap forwardRef(() => X) to X. Returns the original node if not a forwardRef call. */
export function unwrapForwardRef(node: ts.Expression): ts.Expression {
  if (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'forwardRef'
  ) {
    const arg = node.arguments[0];
    if (arg && ts.isArrowFunction(arg)) {
      if (ts.isBlock(arg.body)) {
        const stmt = arg.body.statements[0];
        if (stmt && ts.isReturnStatement(stmt) && stmt.expression)
          return stmt.expression;
      } else {
        return arg.body;
      }
    }
    if (
      arg &&
      ts.isFunctionExpression(arg) &&
      arg.body.statements.length === 1
    ) {
      const stmt = arg.body.statements[0];
      if (ts.isReturnStatement(stmt) && stmt.expression) return stmt.expression;
    }
  }
  return node;
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

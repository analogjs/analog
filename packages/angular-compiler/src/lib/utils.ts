import * as ts from 'typescript';

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

export { ANGULAR_DECORATORS } from './constants.js';

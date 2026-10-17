import { Rule, SchematicContext, Tree } from '@angular-devkit/schematics';
import * as ts from 'typescript';

import {
  applyEdits,
  rewriteSourceFiles,
  type Edit,
} from '../utils/source-edits';

const ROUTER_PKG = '@analogjs/router';
const INJECT_TOKENS: Record<string, string> = {
  injectRouter: 'Router',
  injectActivatedRoute: 'ActivatedRoute',
};
const REMOVED_APIS = new Set([
  'defineRouteMeta',
  ...Object.keys(INJECT_TOKENS),
]);
const MIGRATION_DOC_URL =
  'https://analogjs.org/docs/guides/migrating-v2-to-v3#deprecated-router-apis-were-removed';

function getNamedImports(
  sourceFile: ts.SourceFile,
  moduleName: string,
): ts.ImportDeclaration[] {
  return sourceFile.statements.filter(
    (statement): statement is ts.ImportDeclaration =>
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === moduleName &&
      !!statement.importClause?.namedBindings &&
      ts.isNamedImports(statement.importClause.namedBindings),
  );
}

function getImportElements(
  declaration: ts.ImportDeclaration,
): readonly ts.ImportSpecifier[] {
  return (declaration.importClause?.namedBindings as ts.NamedImports).elements;
}

function getImportedNames(
  sourceFile: ts.SourceFile,
  moduleName: string,
  valuesOnly = false,
): Set<string> {
  return new Set(
    getNamedImports(sourceFile, moduleName).flatMap((declaration) =>
      valuesOnly && declaration.importClause?.isTypeOnly
        ? []
        : getImportElements(declaration)
            .filter((element) => !(valuesOnly && element.isTypeOnly))
            .map((element) => element.name.text),
    ),
  );
}

/**
 * Replaces `defineRouteMeta({...})` with the object literal typed as
 * `RouteMeta`, and `injectRouter()` / `injectActivatedRoute()` with
 * `inject(Router)` / `inject(ActivatedRoute)`.
 *
 * Returns `null` when the file doesn't use the removed APIs, and the
 * unchanged source when a non-call reference needs a manual migration.
 */
export function migrateRouterSource(
  filePath: string,
  source: string,
): string | null {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  // Local binding name -> removed API name.
  const removedBindings = new Map<string, string>();
  const routerImports: ts.ImportDeclaration[] = [];
  for (const declaration of getNamedImports(sourceFile, ROUTER_PKG)) {
    const removed = getImportElements(declaration).filter((element) =>
      REMOVED_APIS.has((element.propertyName ?? element.name).text),
    );
    for (const element of removed) {
      removedBindings.set(
        element.name.text,
        (element.propertyName ?? element.name).text,
      );
    }
    if (removed.length > 0) routerImports.push(declaration);
  }
  if (routerImports.length === 0) return null;

  const edits: Edit[] = [];
  const angularRouterNames = new Set<string>();
  let needsInject = false;
  let needsRouteMeta = false;
  let hasNonCallReference = false;

  function visit(node: ts.Node): void {
    if (
      ts.isIdentifier(node) &&
      removedBindings.has(node.text) &&
      !ts.isImportSpecifier(node.parent) &&
      !(ts.isCallExpression(node.parent) && node.parent.expression === node)
    ) {
      hasNonCallReference = true;
    }
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      removedBindings.has(node.expression.text)
    ) {
      const api = removedBindings.get(node.expression.text)!;
      const callStart = node.getStart(sourceFile);
      if (api === 'defineRouteMeta') {
        const [routeMeta] = node.arguments;
        if (routeMeta) {
          // Strip only the call wrapper so rewrites nested in the argument
          // don't overlap this edit.
          edits.push(
            { start: callStart, end: routeMeta.getStart(sourceFile), text: '' },
            { start: routeMeta.end, end: node.end, text: '' },
          );
          const parent = node.parent;
          if (
            ts.isVariableDeclaration(parent) &&
            parent.initializer === node &&
            !parent.type
          ) {
            edits.push({
              start: parent.name.end,
              end: parent.name.end,
              text: ': RouteMeta',
            });
            needsRouteMeta = true;
          }
        }
      } else {
        const token = INJECT_TOKENS[api];
        edits.push({
          start: callStart,
          end: node.end,
          text: `inject(${token})`,
        });
        needsInject = true;
        angularRouterNames.add(token);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  if (hasNonCallReference) return source;

  const routerNames = getImportedNames(sourceFile, ROUTER_PKG);
  const ngRouterNames = getImportedNames(sourceFile, '@angular/router', true);
  const missingTokens = [...angularRouterNames].filter(
    (name) => !ngRouterNames.has(name),
  );
  const addedImports: string[] = [];
  if (
    needsInject &&
    !getImportedNames(sourceFile, '@angular/core', true).has('inject')
  ) {
    addedImports.push(`import { inject } from '@angular/core';`);
  }
  if (missingTokens.length > 0) {
    addedImports.push(
      `import { ${missingTokens.join(', ')} } from '@angular/router';`,
    );
  }

  routerImports.forEach((declaration, index) => {
    const remaining = getImportElements(declaration)
      .filter(
        (element) =>
          !REMOVED_APIS.has((element.propertyName ?? element.name).text),
      )
      .map((element) => element.getText(sourceFile));
    if (index === 0 && needsRouteMeta && !routerNames.has('RouteMeta')) {
      remaining.push('type RouteMeta');
    }

    const lines = index === 0 ? [...addedImports] : [];
    if (remaining.length > 0) {
      lines.push(`import { ${remaining.join(', ')} } from '${ROUTER_PKG}';`);
    }

    const start = declaration.getStart(sourceFile);
    let end = declaration.end;
    if (lines.length === 0 && source[end] === '\n') {
      end++;
    }
    edits.push({ start, end, text: lines.join('\n') });
  });

  return applyEdits(source, edits);
}

export default function migrateDeprecatedRouterApis(): Rule {
  return (tree: Tree, context: SchematicContext) => {
    const manual: string[] = [];
    const rewritten = rewriteSourceFiles(tree, ROUTER_PKG, (path, source) => {
      const result = migrateRouterSource(path, source);
      if (result === source) manual.push(path);
      return result;
    });
    if (manual.length > 0) {
      context.logger.warn(
        `Migrate the removed @analogjs/router APIs by hand in:\n${manual
          .map((file) => `  - ${file}`)
          .join('\n')}\nSee ${MIGRATION_DOC_URL}`,
      );
    }
    if (rewritten.length > 0) {
      context.logger.info(
        `Replaced removed @analogjs/router APIs (defineRouteMeta, injectRouter, injectActivatedRoute) in:\n${rewritten
          .map((file) => `  - ${file}`)
          .join('\n')}\nSee ${MIGRATION_DOC_URL}`,
      );
    }
    return tree;
  };
}

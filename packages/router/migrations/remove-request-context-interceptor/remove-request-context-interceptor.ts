import type { Rule, SchematicContext, Tree } from '@angular-devkit/schematics';
import * as ts from 'typescript';

const INTERCEPTOR = 'requestContextInterceptor';

interface Edit {
  start: number;
  end: number;
}

interface NamedImport {
  declaration: ts.ImportDeclaration;
  bindings: ts.NamedImports;
}

function getNamedImports(sourceFile: ts.SourceFile): NamedImport[] {
  return sourceFile.statements.flatMap((declaration) => {
    const bindings = ts.isImportDeclaration(declaration)
      ? declaration.importClause?.namedBindings
      : undefined;
    return bindings && ts.isNamedImports(bindings)
      ? [{ declaration: declaration as ts.ImportDeclaration, bindings }]
      : [];
  });
}

/** Local names imported for `exportName` from `moduleName`. */
function getImportNames(
  imports: NamedImport[],
  moduleName: string,
  exportName: string,
): Set<string> {
  const names = new Set<string>();
  for (const { declaration, bindings } of imports) {
    if (
      !ts.isStringLiteral(declaration.moduleSpecifier) ||
      declaration.moduleSpecifier.text !== moduleName
    ) {
      continue;
    }
    for (const element of bindings.elements) {
      if ((element.propertyName ?? element.name).text === exportName) {
        names.add(element.name.text);
      }
    }
  }
  return names;
}

function isCallTo(
  node: ts.Node,
  names: Set<string>,
): node is ts.CallExpression {
  return (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    names.has(node.expression.text)
  );
}

/** Removes one element of a comma-separated list along with its separator. */
function removeListElement(
  elements: ts.NodeArray<ts.Node>,
  index: number,
  listEnd: number,
  sourceFile: ts.SourceFile,
): Edit {
  if (elements.length === 1) {
    return { start: elements.pos, end: listEnd };
  }
  if (index < elements.length - 1) {
    return {
      start: elements[index].getStart(sourceFile),
      end: elements[index + 1].getStart(sourceFile),
    };
  }
  return { start: elements[index - 1].getEnd(), end: elements[index].getEnd() };
}

function countReferences(sourceFile: ts.SourceFile, name: string): number {
  let count = 0;
  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node)) return;
    if (ts.isIdentifier(node) && node.text === name) count++;
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return count;
}

/** Removes the import specifier for `name`, or the whole import if it is the only one. */
function removeImport(
  imports: NamedImport[],
  name: string,
  sourceFile: ts.SourceFile,
): Edit | undefined {
  for (const { declaration, bindings } of imports) {
    const index = bindings.elements.findIndex((el) => el.name.text === name);
    if (index === -1) continue;

    if (bindings.elements.length === 1 && !declaration.importClause?.name) {
      const end = declaration.getEnd();
      return {
        start: declaration.getStart(sourceFile),
        end: sourceFile.text[end] === '\n' ? end + 1 : end,
      };
    }
    return removeListElement(
      bindings.elements,
      index,
      bindings.getEnd() - 1,
      sourceFile,
    );
  }
  return undefined;
}

function removeFromSource(filePath: string, source: string): string {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const imports = getNamedImports(sourceFile);
  const interceptorNames = getImportNames(
    imports,
    '@analogjs/router',
    INTERCEPTOR,
  );
  if (!interceptorNames.size) return source;

  const provideHttpClientNames = getImportNames(
    imports,
    '@angular/common/http',
    'provideHttpClient',
  );
  const withInterceptorsNames = getImportNames(
    imports,
    '@angular/common/http',
    'withInterceptors',
  );

  const edits: Edit[] = [];
  const removed = new Map<string, number>();
  const markRemoved = (name: string) =>
    removed.set(name, (removed.get(name) ?? 0) + 1);

  function visit(node: ts.Node): void {
    if (isCallTo(node, provideHttpClientNames)) {
      node.arguments.forEach((arg, argIndex) => {
        if (!isCallTo(arg, withInterceptorsNames)) return;
        const [interceptors] = arg.arguments;
        if (!interceptors || !ts.isArrayLiteralExpression(interceptors)) return;

        const index = interceptors.elements.findIndex(
          (el) => ts.isIdentifier(el) && interceptorNames.has(el.text),
        );
        if (index === -1) return;

        markRemoved((interceptors.elements[index] as ts.Identifier).text);
        if (interceptors.elements.length === 1) {
          markRemoved((arg.expression as ts.Identifier).text);
          edits.push(
            removeListElement(
              node.arguments,
              argIndex,
              node.getEnd() - 1,
              sourceFile,
            ),
          );
        } else {
          edits.push(
            removeListElement(
              interceptors.elements,
              index,
              interceptors.getEnd() - 1,
              sourceFile,
            ),
          );
        }
      });
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  for (const [name, count] of removed) {
    if (countReferences(sourceFile, name) === count) {
      const edit = removeImport(imports, name, sourceFile);
      if (edit) edits.push(edit);
    }
  }

  let result = source;
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    result = result.slice(0, edit.start) + result.slice(edit.end);
  }
  return result;
}

export default function removeRequestContextInterceptor(): Rule {
  return (tree: Tree, context: SchematicContext) => {
    const updatedFiles: string[] = [];
    const remainingFiles: string[] = [];

    tree.visit((filePath) => {
      if (filePath.includes('/node_modules/') || !filePath.endsWith('.ts')) {
        return;
      }
      const source = tree.read(filePath)?.toString('utf-8');
      if (!source?.includes(INTERCEPTOR)) return;

      const result = removeFromSource(filePath, source);
      if (result !== source) {
        tree.overwrite(filePath, result);
        updatedFiles.push(filePath);
      }
      if (result.includes(INTERCEPTOR)) {
        remainingFiles.push(filePath);
      }
    });

    if (updatedFiles.length) {
      context.logger.info(
        `Removed requestContextInterceptor, now registered by provideFileRouter(), from: ${updatedFiles.join(', ')}`,
      );
    }
    if (remainingFiles.length) {
      context.logger.warn(
        `requestContextInterceptor is still referenced in: ${remainingFiles.join(', ')}. ` +
          'provideFileRouter() now registers it automatically, so remove any manual registration.',
      );
    }

    return tree;
  };
}

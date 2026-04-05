import { Rule, SchematicContext, Tree } from '@angular-devkit/schematics';
import ts from 'typescript';

const ANGULAR_DECORATOR_NAMES = new Set(['Component', 'Directive', 'Pipe']);
const SUPPORTED_EXTENSIONS = ['.ts', '.mts', '.js', '.mjs'];

export default function removeStandaloneTrue(): Rule {
  return (tree: Tree, context: SchematicContext) => {
    const angularMajor = getAngularMajorVersion(tree);

    if (angularMajor === null) {
      context.logger.info(
        'Skipped redundant standalone migration because @angular/core could not be found in package.json.',
      );
      return tree;
    }

    if (angularMajor < 19) {
      context.logger.info(
        `Skipped redundant standalone migration because Angular ${angularMajor} still requires explicit standalone metadata in some templates.`,
      );
      return tree;
    }

    const updatedFiles: string[] = [];

    tree.visit((filePath) => {
      if (filePath.includes('/node_modules/')) {
        return;
      }

      if (
        !SUPPORTED_EXTENSIONS.some((extension) => filePath.endsWith(extension))
      ) {
        return;
      }

      const content = tree.read(filePath);
      if (!content) {
        return;
      }

      const text = content.toString('utf-8');
      if (!text.includes('standalone: true')) {
        return;
      }

      const updated = removeStandaloneTrueFromSource(text, filePath);

      if (updated !== text) {
        tree.overwrite(filePath, updated);
        updatedFiles.push(filePath);
      }
    });

    if (updatedFiles.length > 0) {
      context.logger.info(
        `Removed redundant standalone metadata from ${updatedFiles.length} file(s):`,
      );

      for (const file of updatedFiles) {
        context.logger.info(`  - ${file}`);
      }
    }

    return tree;
  };
}

function getAngularMajorVersion(tree: Tree): number | null {
  const packageJson = tree.read('/package.json');
  if (!packageJson) {
    return null;
  }

  const pkg = JSON.parse(packageJson.toString('utf-8'));
  const version =
    pkg.dependencies?.['@angular/core'] ??
    pkg.devDependencies?.['@angular/core'] ??
    pkg.peerDependencies?.['@angular/core'];

  if (typeof version !== 'string') {
    return null;
  }

  const match = version.match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

export function removeStandaloneTrueFromSource(
  sourceText: string,
  filePath = 'source.ts',
): string {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    getScriptKind(filePath),
  );
  const removals: Array<{ start: number; end: number }> = [];

  visitNode(sourceFile);

  if (removals.length === 0) {
    return sourceText;
  }

  let updated = sourceText;
  for (const { start, end } of removals.sort((a, b) => b.start - a.start)) {
    updated = updated.slice(0, start) + updated.slice(end);
  }

  return updated;

  function visitNode(node: ts.Node): void {
    if (ts.isClassDeclaration(node)) {
      const decorators = ts.canHaveDecorators(node)
        ? (ts.getDecorators(node) ?? [])
        : [];

      for (const decorator of decorators) {
        collectStandaloneRemovalRanges(decorator, sourceFile, removals);
      }
    }

    ts.forEachChild(node, visitNode);
  }
}

function collectStandaloneRemovalRanges(
  decorator: ts.Decorator,
  sourceFile: ts.SourceFile,
  removals: Array<{ start: number; end: number }>,
): void {
  if (!ts.isCallExpression(decorator.expression)) {
    return;
  }

  const callExpression = decorator.expression;
  if (
    !ts.isIdentifier(callExpression.expression) ||
    !ANGULAR_DECORATOR_NAMES.has(callExpression.expression.text)
  ) {
    return;
  }

  const metadata = callExpression.arguments[0];
  if (!metadata || !ts.isObjectLiteralExpression(metadata)) {
    return;
  }

  const standaloneIndex = metadata.properties.findIndex(
    (property) =>
      ts.isPropertyAssignment(property) &&
      getPropertyName(property.name) === 'standalone' &&
      property.initializer.kind === ts.SyntaxKind.TrueKeyword,
  );

  if (standaloneIndex === -1) {
    return;
  }

  const standaloneProperty = metadata.properties[
    standaloneIndex
  ] as ts.PropertyAssignment;
  const previousProperty =
    standaloneIndex > 0 ? metadata.properties[standaloneIndex - 1] : null;
  const nextProperty =
    standaloneIndex < metadata.properties.length - 1
      ? metadata.properties[standaloneIndex + 1]
      : null;

  let start = standaloneProperty.getStart(sourceFile);
  let end = standaloneProperty.getEnd();

  if (nextProperty) {
    end = nextProperty.getFullStart();
  } else if (previousProperty) {
    start = previousProperty.getEnd();
  } else {
    start = standaloneProperty.getFullStart();
  }

  if (!previousProperty) {
    start = standaloneProperty.getFullStart();
  }

  removals.push({ start, end });
}

function getPropertyName(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) {
    return name.text;
  }

  return null;
}

function getScriptKind(filePath: string): ts.ScriptKind {
  if (filePath.endsWith('.js') || filePath.endsWith('.mjs')) {
    return ts.ScriptKind.JS;
  }

  return ts.ScriptKind.TS;
}

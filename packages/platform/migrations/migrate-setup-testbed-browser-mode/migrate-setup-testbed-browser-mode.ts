import { Rule, SchematicContext, Tree } from '@angular-devkit/schematics';
import * as ts from 'typescript';

import {
  applyEdits,
  rewriteSourceFiles,
  type Edit,
} from '../utils/source-edits';

const SETUP_TESTBED_PKG = '@analogjs/vitest-angular/setup-testbed';
const MIGRATION_DOC_URL =
  'https://analogjs.org/docs/guides/migrating-v2-to-v3#the-setuptestbed-browsermode-option-was-removed';

function getPropertyName(
  property: ts.ObjectLiteralElementLike,
): string | undefined {
  return property.name && ts.isIdentifier(property.name)
    ? property.name.text
    : undefined;
}

function toTeardown(value: ts.Expression, sourceFile: ts.SourceFile): string {
  if (value.kind === ts.SyntaxKind.TrueKeyword) {
    return 'teardown: { destroyAfterEach: false }';
  }
  return `teardown: { destroyAfterEach: !(${value.getText(sourceFile)}) }`;
}

function removeProperty(
  object: ts.ObjectLiteralExpression,
  index: number,
  sourceFile: ts.SourceFile,
): Edit {
  const properties = object.properties;
  if (properties.length === 1) {
    return { start: object.getStart(sourceFile), end: object.end, text: '' };
  }
  if (index < properties.length - 1) {
    return {
      start: properties[index].getStart(sourceFile),
      end: properties[index + 1].getStart(sourceFile),
      text: '',
    };
  }
  return {
    start: properties[index - 1].end,
    end: properties[index].end,
    text: '',
  };
}

/**
 * Replaces `setupTestBed({ browserMode })` with the equivalent
 * `teardown.destroyAfterEach` option.
 */
export function migrateSetupTestBedSource(
  filePath: string,
  source: string,
): string | null {
  if (!source.includes('browserMode')) return null;

  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const edits: Edit[] = [];

  function visit(node: ts.Node): void {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'setupTestBed' &&
      node.arguments[0] &&
      ts.isObjectLiteralExpression(node.arguments[0])
    ) {
      const options = node.arguments[0];
      const index = options.properties.findIndex(
        (property) => getPropertyName(property) === 'browserMode',
      );
      const browserMode = options.properties[index];
      const hasTeardown = options.properties.some(
        (property) => getPropertyName(property) === 'teardown',
      );

      const value =
        browserMode && ts.isPropertyAssignment(browserMode)
          ? browserMode.initializer
          : browserMode && ts.isShorthandPropertyAssignment(browserMode)
            ? browserMode.name
            : undefined;
      if (browserMode && value) {
        if (hasTeardown || value.kind === ts.SyntaxKind.FalseKeyword) {
          edits.push(removeProperty(options, index, sourceFile));
        } else {
          edits.push({
            start: browserMode.getStart(sourceFile),
            end: browserMode.end,
            text: toTeardown(value, sourceFile),
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  return edits.length > 0 ? applyEdits(source, edits) : null;
}

export default function migrateSetupTestBedBrowserMode(): Rule {
  return (tree: Tree, context: SchematicContext) => {
    const rewritten = rewriteSourceFiles(
      tree,
      SETUP_TESTBED_PKG,
      migrateSetupTestBedSource,
    );
    if (rewritten.length > 0) {
      context.logger.info(
        `Replaced setupTestBed({ browserMode }) with teardown.destroyAfterEach in:\n${rewritten
          .map((file) => `  - ${file}`)
          .join('\n')}\nSee ${MIGRATION_DOC_URL}`,
      );
    }
    return tree;
  };
}

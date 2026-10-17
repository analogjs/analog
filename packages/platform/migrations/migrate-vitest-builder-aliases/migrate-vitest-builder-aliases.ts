import { Rule, SchematicContext, Tree } from '@angular-devkit/schematics';
// The explicit file path resolves when this runs as native ESM.
import { NodePackageInstallTask } from '@angular-devkit/schematics/tasks/index.js';

const VITEST_BUILDER = '@analogjs/vitest-angular:test';
const VITEST_ANGULAR_PKG = '@analogjs/vitest-angular';
const REMOVED_ALIASES = [
  '@analogjs/vite-plugin-angular:vitest',
  '@analogjs/platform:vitest',
  '@analogjs/storybook-angular:test-storybook',
];
const WORKSPACE_FILES = [
  'angular.json',
  'workspace.json',
  'project.json',
  'nx.json',
  'package.json',
];

function isWorkspaceFile(filePath: string): boolean {
  const file = filePath.slice(filePath.lastIndexOf('/') + 1);
  return WORKSPACE_FILES.includes(file);
}

function addVitestAngular(tree: Tree, context: SchematicContext): void {
  const raw = tree.read('/package.json')?.toString('utf-8');
  if (!raw) return;

  const pkg = JSON.parse(raw) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  if (
    pkg.dependencies?.[VITEST_ANGULAR_PKG] ||
    pkg.devDependencies?.[VITEST_ANGULAR_PKG]
  ) {
    return;
  }

  const version =
    pkg.devDependencies?.['@analogjs/platform'] ??
    pkg.dependencies?.['@analogjs/platform'] ??
    '*';
  pkg.devDependencies = {
    ...pkg.devDependencies,
    [VITEST_ANGULAR_PKG]: version,
  };
  const trailingNewline = raw.endsWith('\n') ? '\n' : '';
  tree.overwrite(
    '/package.json',
    JSON.stringify(pkg, null, 2) + trailingNewline,
  );
  context.addTask(new NodePackageInstallTask());
}

/**
 * Points targets that use the removed Vitest builder/executor aliases at
 * `@analogjs/vitest-angular:test`.
 */
export default function migrateVitestBuilderAliases(): Rule {
  return (tree: Tree, context: SchematicContext) => {
    const rewritten: string[] = [];
    tree.visit((filePath) => {
      if (filePath.includes('/node_modules/')) return;
      if (!isWorkspaceFile(filePath)) return;

      const source = tree.read(filePath)?.toString('utf-8');
      if (!source) return;

      const result = REMOVED_ALIASES.reduce(
        (content, alias) =>
          content.replaceAll(`"${alias}"`, `"${VITEST_BUILDER}"`),
        source,
      );
      if (result !== source) {
        tree.overwrite(filePath, result);
        rewritten.push(filePath);
      }
    });

    if (rewritten.length === 0) {
      return tree;
    }

    context.logger.info(
      `Replaced removed Vitest builder aliases with ${VITEST_BUILDER} in:\n${rewritten
        .map((file) => `  - ${file}`)
        .join('\n')}`,
    );
    addVitestAngular(tree, context);
    return tree;
  };
}

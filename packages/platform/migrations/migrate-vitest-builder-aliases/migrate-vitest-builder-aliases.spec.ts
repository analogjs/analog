import { describe, expect, it, vi } from 'vitest';
import { UnitTestTree } from '@angular-devkit/schematics/testing';
import { SchematicContext, Tree } from '@angular-devkit/schematics';

import migrateVitestBuilderAliases from './migrate-vitest-builder-aliases';

function createContext() {
  return {
    logger: { info: vi.fn() },
    addTask: vi.fn(),
  } as unknown as SchematicContext;
}

describe('migrate-vitest-builder-aliases', () => {
  it('rewrites removed aliases and adds @analogjs/vitest-angular', () => {
    const tree = new UnitTestTree(Tree.empty());
    tree.create(
      '/angular.json',
      JSON.stringify({
        projects: {
          app: {
            architect: {
              test: { builder: '@analogjs/vite-plugin-angular:vitest' },
              'test-storybook': {
                builder: '@analogjs/storybook-angular:test-storybook',
              },
            },
          },
        },
      }),
    );
    tree.create(
      '/apps/web/project.json',
      JSON.stringify({
        targets: { test: { executor: '@analogjs/platform:vitest' } },
      }),
    );
    tree.create(
      '/libs/lib/package.json',
      JSON.stringify({
        nx: { targets: { test: { executor: '@analogjs/platform:vitest' } } },
      }),
    );
    tree.create(
      '/package.json',
      JSON.stringify({ devDependencies: { '@analogjs/platform': '^3.0.0' } }),
    );

    const context = createContext();
    migrateVitestBuilderAliases()(tree, context);

    const angularJson = JSON.parse(tree.readContent('/angular.json'));
    expect(angularJson.projects.app.architect.test.builder).toBe(
      '@analogjs/vitest-angular:test',
    );
    expect(angularJson.projects.app.architect['test-storybook'].builder).toBe(
      '@analogjs/vitest-angular:test',
    );
    expect(
      JSON.parse(tree.readContent('/apps/web/project.json')).targets.test
        .executor,
    ).toBe('@analogjs/vitest-angular:test');
    expect(
      JSON.parse(tree.readContent('/libs/lib/package.json')).nx.targets.test
        .executor,
    ).toBe('@analogjs/vitest-angular:test');
    expect(
      JSON.parse(tree.readContent('/package.json')).devDependencies[
        '@analogjs/vitest-angular'
      ],
    ).toBe('^3.0.0');
    expect(context.addTask).toHaveBeenCalled();
  });

  it('is a no-op without removed aliases', () => {
    const tree = new UnitTestTree(Tree.empty());
    const angularJson = JSON.stringify({
      projects: {
        app: {
          architect: { test: { builder: '@analogjs/vitest-angular:test' } },
        },
      },
    });
    tree.create('/angular.json', angularJson);

    const context = createContext();
    migrateVitestBuilderAliases()(tree, context);

    expect(tree.readContent('/angular.json')).toBe(angularJson);
    expect(context.addTask).not.toHaveBeenCalled();
  });
});

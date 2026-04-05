import { describe, expect, it, vi, beforeEach } from 'vitest';
import { SchematicContext, Tree } from '@angular-devkit/schematics';
import { UnitTestTree } from '@angular-devkit/schematics/testing';

import removeStandaloneTrue, {
  removeStandaloneTrueFromSource,
} from './remove-standalone-true';

describe('remove-standalone-true migration', () => {
  let tree: UnitTestTree;
  let context: SchematicContext;

  beforeEach(() => {
    tree = new UnitTestTree(Tree.empty());
    context = {
      logger: { info: vi.fn() },
      addTask: vi.fn(),
    } as unknown as SchematicContext;
  });

  it('removes standalone true from Angular decorator metadata on Angular 19+', () => {
    tree.create(
      '/package.json',
      JSON.stringify({
        dependencies: {
          '@angular/core': '^20.0.0',
        },
      }),
    );
    tree.create(
      '/src/app/home.page.ts',
      `
        import { Component } from '@angular/core';

        @Component({
          standalone: true,
          imports: [],
          template: '<p>home</p>',
        })
        export default class HomePage {}
      `,
    );

    removeStandaloneTrue()(tree, context);

    expect(tree.readContent('/src/app/home.page.ts')).not.toContain(
      'standalone: true',
    );
    expect(tree.readContent('/src/app/home.page.ts')).toContain('imports: []');
  });

  it('skips updates for Angular 18 workspaces', () => {
    tree.create(
      '/package.json',
      JSON.stringify({
        dependencies: {
          '@angular/core': '^18.2.0',
        },
      }),
    );
    const source = `
      import { Component } from '@angular/core';

      @Component({
        standalone: true,
        template: '<p>home</p>',
      })
      export default class HomePage {}
    `;

    tree.create('/src/app/home.page.ts', source);

    removeStandaloneTrue()(tree, context);

    expect(tree.readContent('/src/app/home.page.ts')).toBe(source);
  });

  it('removes standalone true from inline metadata without touching other properties', () => {
    expect(
      removeStandaloneTrueFromSource(
        `
          import { Directive } from '@angular/core';

          @Directive({ standalone: true, selector: '[demo]' })
          export class DemoDirective {}
        `,
      ),
    ).toContain(`@Directive({ selector: '[demo]' })`);
  });
});

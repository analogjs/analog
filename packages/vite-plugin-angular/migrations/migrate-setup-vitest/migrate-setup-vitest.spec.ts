import { UnitTestTree } from '@angular-devkit/schematics/testing';
import { Tree, SchematicContext } from '@angular-devkit/schematics';

import migrateSetupVitest from './migrate-setup-vitest';

describe('migrate-setup-vitest', () => {
  let tree: UnitTestTree;
  let context: SchematicContext;

  beforeEach(() => {
    tree = new UnitTestTree(Tree.empty());
    context = {
      logger: { info: vi.fn() },
      addTask: vi.fn(),
    } as unknown as SchematicContext;
  });

  it('should replace old import with new import', () => {
    tree.create(
      '/src/test-setup.ts',
      `import '@analogjs/vite-plugin-angular/setup-vitest';`,
    );
    tree.create(
      '/package.json',
      JSON.stringify({
        devDependencies: {
          '@analogjs/vite-plugin-angular': '^3.0.0',
        },
      }),
    );

    const rule = migrateSetupVitest();
    rule(tree, context);

    expect(tree.readContent('/src/test-setup.ts')).toBe(
      `import '@analogjs/vitest-angular/setup-zone';`,
    );
  });

  it('should handle multiple occurrences in the same file', () => {
    tree.create(
      '/src/test-setup.ts',
      [
        `import '@analogjs/vite-plugin-angular/setup-vitest';`,
        `// was: @analogjs/vite-plugin-angular/setup-vitest`,
      ].join('\n'),
    );
    tree.create(
      '/package.json',
      JSON.stringify({
        devDependencies: {
          '@analogjs/vite-plugin-angular': '^3.0.0',
        },
      }),
    );

    const rule = migrateSetupVitest();
    rule(tree, context);

    const content = tree.readContent('/src/test-setup.ts');
    expect(content).not.toContain('@analogjs/vite-plugin-angular/setup-vitest');
    expect(content).toContain(`import '@analogjs/vitest-angular/setup-zone';`);
  });

  it('should add @analogjs/vitest-angular to devDependencies', () => {
    tree.create(
      '/src/test-setup.ts',
      `import '@analogjs/vite-plugin-angular/setup-vitest';`,
    );
    tree.create(
      '/package.json',
      JSON.stringify({
        devDependencies: {
          '@analogjs/vite-plugin-angular': '^3.0.0',
        },
      }),
    );

    const rule = migrateSetupVitest();
    rule(tree, context);

    const pkg = JSON.parse(tree.readContent('/package.json'));
    expect(pkg.devDependencies['@analogjs/vitest-angular']).toBe('^3.0.0');
  });

  it('should not add vitest-angular if already present', () => {
    tree.create(
      '/src/test-setup.ts',
      `import '@analogjs/vite-plugin-angular/setup-vitest';`,
    );
    tree.create(
      '/package.json',
      JSON.stringify({
        devDependencies: {
          '@analogjs/vite-plugin-angular': '^3.0.0',
          '@analogjs/vitest-angular': '^2.0.0',
        },
      }),
    );

    const rule = migrateSetupVitest();
    rule(tree, context);

    const pkg = JSON.parse(tree.readContent('/package.json'));
    expect(pkg.devDependencies['@analogjs/vitest-angular']).toBe('^2.0.0');
  });

  it('should not modify files without old import', () => {
    tree.create(
      '/src/test-setup.ts',
      `import '@analogjs/vitest-angular/setup-zone';`,
    );
    tree.create(
      '/package.json',
      JSON.stringify({
        devDependencies: {
          '@analogjs/vite-plugin-angular': '^3.0.0',
        },
      }),
    );

    const rule = migrateSetupVitest();
    rule(tree, context);

    expect(tree.readContent('/src/test-setup.ts')).toBe(
      `import '@analogjs/vitest-angular/setup-zone';`,
    );
  });

  it('should process .js files', () => {
    tree.create(
      '/src/test-setup.js',
      `import '@analogjs/vite-plugin-angular/setup-vitest';`,
    );
    tree.create(
      '/package.json',
      JSON.stringify({
        devDependencies: {
          '@analogjs/vite-plugin-angular': '^3.0.0',
        },
      }),
    );

    const rule = migrateSetupVitest();
    rule(tree, context);

    expect(tree.readContent('/src/test-setup.js')).toBe(
      `import '@analogjs/vitest-angular/setup-zone';`,
    );
  });

  it('should process .mjs files', () => {
    tree.create(
      '/src/test-setup.mjs',
      `import '@analogjs/vite-plugin-angular/setup-vitest';`,
    );
    tree.create(
      '/package.json',
      JSON.stringify({
        devDependencies: {
          '@analogjs/vite-plugin-angular': '^3.0.0',
        },
      }),
    );

    const rule = migrateSetupVitest();
    rule(tree, context);

    expect(tree.readContent('/src/test-setup.mjs')).toBe(
      `import '@analogjs/vitest-angular/setup-zone';`,
    );
  });

  it('should process .mts files', () => {
    tree.create(
      '/src/test-setup.mts',
      `import '@analogjs/vite-plugin-angular/setup-vitest';`,
    );
    tree.create(
      '/package.json',
      JSON.stringify({
        devDependencies: {
          '@analogjs/vite-plugin-angular': '^3.0.0',
        },
      }),
    );

    const rule = migrateSetupVitest();
    rule(tree, context);

    expect(tree.readContent('/src/test-setup.mts')).toBe(
      `import '@analogjs/vitest-angular/setup-zone';`,
    );
  });

  it('should skip unsupported file types', () => {
    const jsonContent = `{ "setup": "@analogjs/vite-plugin-angular/setup-vitest" }`;
    tree.create('/config.json', jsonContent);
    tree.create(
      '/package.json',
      JSON.stringify({
        devDependencies: {
          '@analogjs/vite-plugin-angular': '^3.0.0',
        },
      }),
    );

    const rule = migrateSetupVitest();
    rule(tree, context);

    expect(tree.readContent('/config.json')).toBe(jsonContent);
  });

  it('should not add dependency when no imports were found', () => {
    tree.create(
      '/src/test-setup.ts',
      `import '@analogjs/vitest-angular/setup-zone';`,
    );
    tree.create(
      '/package.json',
      JSON.stringify({
        devDependencies: {
          '@analogjs/vite-plugin-angular': '^3.0.0',
        },
      }),
    );

    const rule = migrateSetupVitest();
    rule(tree, context);

    const pkg = JSON.parse(tree.readContent('/package.json'));
    expect(pkg.devDependencies['@analogjs/vitest-angular']).toBeUndefined();
  });
});

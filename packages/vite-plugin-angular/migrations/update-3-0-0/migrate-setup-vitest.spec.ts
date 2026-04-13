import { readJson, Tree } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';

import migrateSetupVitest from './migrate-setup-vitest';

describe('migrate-setup-vitest nx migration', () => {
  let tree: Tree;

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
  });

  it('replaces the legacy import in source files', async () => {
    tree.write(
      'src/test-setup.ts',
      `import '@analogjs/vite-plugin-angular/setup-vitest';`,
    );
    tree.write(
      'package.json',
      JSON.stringify({
        devDependencies: {
          '@analogjs/vite-plugin-angular': '^3.0.0',
        },
      }),
    );

    await migrateSetupVitest(tree);

    expect(tree.read('src/test-setup.ts', 'utf-8')).toBe(
      `import '@analogjs/vitest-angular/setup-zone';`,
    );
  });

  it('adds vitest-angular using the current vite-plugin-angular version', async () => {
    tree.write(
      'src/test-setup.ts',
      `import '@analogjs/vite-plugin-angular/setup-vitest';`,
    );
    tree.write(
      'package.json',
      JSON.stringify({
        devDependencies: {
          '@analogjs/vite-plugin-angular': '~3.0.0-alpha.25',
        },
      }),
    );

    await migrateSetupVitest(tree);

    const packageJson = readJson<{
      devDependencies: Record<string, string>;
    }>(tree, 'package.json');

    expect(packageJson.devDependencies['@analogjs/vitest-angular']).toBe(
      '~3.0.0-alpha.25',
    );
  });

  it('does not change unsupported file types', async () => {
    tree.write(
      'config.json',
      `{ "setup": "@analogjs/vite-plugin-angular/setup-vitest" }`,
    );
    tree.write(
      'package.json',
      JSON.stringify({
        devDependencies: {
          '@analogjs/vite-plugin-angular': '^3.0.0',
        },
      }),
    );

    await migrateSetupVitest(tree);

    expect(tree.read('config.json', 'utf-8')).toBe(
      `{ "setup": "@analogjs/vite-plugin-angular/setup-vitest" }`,
    );
  });

  it('does not add vitest-angular when no legacy import is found', async () => {
    tree.write(
      'src/test-setup.ts',
      `import '@analogjs/vitest-angular/setup-zone';`,
    );
    tree.write(
      'package.json',
      JSON.stringify({
        devDependencies: {
          '@analogjs/vite-plugin-angular': '^3.0.0',
        },
      }),
    );

    await migrateSetupVitest(tree);

    const packageJson = readJson<{
      devDependencies: Record<string, string>;
    }>(tree, 'package.json');

    expect(
      packageJson.devDependencies['@analogjs/vitest-angular'],
    ).toBeUndefined();
  });
});

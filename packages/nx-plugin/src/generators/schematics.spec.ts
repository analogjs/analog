import {
  SchematicTestRunner,
  UnitTestTree,
} from '@angular-devkit/schematics/testing';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { Tree } from '@angular-devkit/schematics';
import * as path from 'path';

// Must use the built generators.json because the schematic runner resolves
// the compiled CommonJS output rather than the TypeScript sources.
const collectionPath = path.join(
  __dirname,
  '../../../platform/dist/src/lib/nx-plugin/generators.json',
);

describe('platform schematics', () => {
  let runner: SchematicTestRunner;
  let tree: UnitTestTree;

  beforeEach(() => {
    runner = new SchematicTestRunner('schematics', collectionPath);
    tree = new UnitTestTree(Tree.empty());
  });

  it('publishes compat-backed schematic entries for Angular CLI', async () => {
    const collection = JSON.parse(readFileSync(collectionPath, 'utf8')) as {
      generators: Record<string, unknown>;
      schematics: Record<string, { factory: string }>;
    };

    expect(Object.keys(collection.generators)).toEqual(
      expect.arrayContaining(['application', 'page', 'setup-vitest', 'init']),
    );
    expect(collection.schematics).toMatchObject({
      application: {
        factory: './src/generators/app/compat#applicationSchematic',
      },
      page: {
        factory: './src/generators/page/compat#pageSchematic',
      },
      'setup-vitest': {
        factory: './src/generators/setup-vitest/compat#setupVitestSchematic',
      },
      init: {
        factory: './src/generators/init/compat#initSchematic',
      },
    });
  });

  it('publishes named compat exports that Angular schematics can resolve', async () => {
    const appCompat = await import(
      pathToFileURL(
        path.join(
          __dirname,
          '../../../platform/dist/src/lib/nx-plugin/src/generators/app/compat.js',
        ),
      ).href
    );
    const pageCompat = await import(
      pathToFileURL(
        path.join(
          __dirname,
          '../../../platform/dist/src/lib/nx-plugin/src/generators/page/compat.js',
        ),
      ).href
    );
    const setupVitestCompat = await import(
      pathToFileURL(
        path.join(
          __dirname,
          '../../../platform/dist/src/lib/nx-plugin/src/generators/setup-vitest/compat.js',
        ),
      ).href
    );
    const initCompat = await import(
      pathToFileURL(
        path.join(
          __dirname,
          '../../../platform/dist/src/lib/nx-plugin/src/generators/init/compat.js',
        ),
      ).href
    );

    expect(appCompat.applicationSchematic).toBeTypeOf('function');
    expect(pageCompat.pageSchematic).toBeTypeOf('function');
    expect(setupVitestCompat.setupVitestSchematic).toBeTypeOf('function');
    expect(initCompat.initSchematic).toBeTypeOf('function');
  });

  describe('page', () => {
    beforeEach(() => {
      tree.create(
        '/workspace.json',
        JSON.stringify({
          version: 2,
          projects: {
            'test-app': {
              root: 'test-app',
              sourceRoot: 'test-app/src',
              projectType: 'application',
            },
          },
        }),
      );
    });

    it('should create a page file', async () => {
      const resultTree = await runner.runSchematic(
        'page',
        { pathname: 'home', project: 'test-app' },
        tree,
      );

      expect(
        resultTree.exists('/test-app/src/app/pages/home.page.ts'),
      ).toBeTruthy();
    });

    it('should create a page with subfolder', async () => {
      const resultTree = await runner.runSchematic(
        'page',
        { pathname: 'blog/post', project: 'test-app' },
        tree,
      );

      expect(
        resultTree.exists('/test-app/src/app/pages/blog/post.page.ts'),
      ).toBeTruthy();
    });
  });
});

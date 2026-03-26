import {
  SchematicTestRunner,
  UnitTestTree,
} from '@angular-devkit/schematics/testing';
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

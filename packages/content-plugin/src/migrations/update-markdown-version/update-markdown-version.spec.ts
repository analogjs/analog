import { Tree } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import update from './update-markdown-version';

describe('update-markdown-version migration', () => {
  let tree: Tree;

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
  });

  it('if angular.json does not exist, dependencies are not added', async () => {
    tree.write('package.json', JSON.stringify({ dependencies: {} }, null, 2));

    await update(tree);

    const pkg = JSON.parse(tree.read('package.json', 'utf-8')!);
    expect(pkg.dependencies).toEqual({});
  });

  it('if angular.json exists, dependencies are added', async () => {
    tree.write('angular.json', '{}');
    tree.write('package.json', JSON.stringify({ dependencies: {} }, null, 2));

    await update(tree);

    const pkg = JSON.parse(tree.read('package.json', 'utf-8'));
    expect(pkg.dependencies).toMatchObject({
      marked: '^15.0.7',
      'marked-mangle': '^1.1.10',
      'marked-highlight': '^2.2.1',
      'marked-gfm-heading-id': '^4.1.1',
    });
  });

  it('if marked is already in dependencies, it updates the version', async () => {
    tree.write('angular.json', '{}');
    tree.write(
      'package.json',
      JSON.stringify(
        {
          dependencies: {
            marked: '^5.0.2',
            'marked-mangle': '^1.1.7',
            'marked-highlight': '^2.0.1',
            'marked-gfm-heading-id': '^4.1.1',
          },
        },
        null,
        2,
      ),
    );

    await update(tree);

    const pkg = JSON.parse(tree.read('package.json', 'utf-8'));
    expect(pkg.dependencies).toMatchObject({
      marked: '^15.0.7',
      'marked-mangle': '^1.1.10',
      'marked-highlight': '^2.2.1',
      'marked-gfm-heading-id': '^4.1.1',
    });
  });
});

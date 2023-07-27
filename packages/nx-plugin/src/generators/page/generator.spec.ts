import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import {
  Tree,
  addProjectConfiguration,
  names,
  readProjectConfiguration,
} from '@nx/devkit';

import { analogPageGenerator } from './generator';
import { AnalogPageGeneratorSchema } from './schema';

describe('analog-page generator', () => {
  const setup = async (options: AnalogPageGeneratorSchema) => {
    const tree = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    addProjectConfiguration(tree, options.name, {
      projectType: 'application',
      sourceRoot: `apps/${names(options.project).fileName}/src`,
      root: `apps/${names(options.project).fileName}`,
    });
    const config = readProjectConfiguration(tree, options.name);
    return {
      tree,
      config,
    };
  };
  let tree: Tree;

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
  });

  it('should create analog page correctly', async () => {
    const options: AnalogPageGeneratorSchema = {
      name: 'home',
      project: 'test',
      redirectPage: false,
      metadata: false,
    };

    await setup(options);
    await analogPageGenerator(tree, options);
    expect(
      tree.read('apps/test/src/app/pages/home.page.ts', 'utf-8')
    ).toMatchSnapshot('page');
  });

  it('should generate an error if the page is a redirect and the path is not provided', async () => {
    const options: AnalogPageGeneratorSchema = {
      name: 'home',
      project: 'test',
      redirectPage: true,
      metadata: false,
    };

    await setup(options);
    await expect(analogPageGenerator(tree, options)).rejects.toThrow(
      'A redirectPath is required when redirectPage is true.'
    );
  });

  it('should create analog page with metadata correctly', async () => {
    const options: AnalogPageGeneratorSchema = {
      name: 'home',
      project: 'test',
      redirectPage: false,
      metadata: true,
      title: 'Home Page',
    };

    await setup(options);
    await analogPageGenerator(tree, options);
    expect(
      tree.read('apps/test/src/app/pages/home.page.ts', 'utf-8')
    ).toMatchSnapshot('page');
  });

  it('should create analog page with redirect correctly', async () => {
    const options: AnalogPageGeneratorSchema = {
      name: 'home',
      project: 'test',
      redirectPage: true,
      metadata: false,
      redirectPath: '/home',
      pathMatch: 'full',
    };

    await setup(options);
    await analogPageGenerator(tree, options);
    expect(
      tree.read('apps/test/src/app/pages/home.page.ts', 'utf-8')
    ).toMatchSnapshot('page');
  });

  it('should create analog page with subfolder correctly', async () => {
    const options: AnalogPageGeneratorSchema = {
      name: 'blog/post',
      project: 'test',
      redirectPage: false,
      metadata: false,
    };

    await setup(options);
    await analogPageGenerator(tree, options);
    expect(
      tree.read('apps/test/src/app/pages/blog/post.page.ts', 'utf-8')
    ).toMatchSnapshot('page');

    options.name = 'products/[products]';
    await analogPageGenerator(tree, options);
    expect(
      tree.read('apps/test/src/app/pages/products/[products].page.ts', 'utf-8')
    ).toMatchSnapshot('page');

    options.name = 'products/products.[productId]';
    await analogPageGenerator(tree, options);
    expect(
      tree.read(
        'apps/test/src/app/pages/products/products.[productId].page.ts',
        'utf-8'
      )
    ).toMatchSnapshot('page');

    options.name = '(blog)';
    await analogPageGenerator(tree, options);
    expect(
      tree.read('apps/test/src/app/pages/(blog).page.ts', 'utf-8')
    ).toMatchSnapshot('page');
  });
});

import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import {
  readProjectConfiguration,
  addDependenciesToPackageJson,
} from '@nx/devkit';

import generator from './generator';
import { AnalogNxApplicationGeneratorOptions } from '../app/schema';

describe('preset generator', () => {
  const setup = async (
    options: AnalogNxApplicationGeneratorOptions,
    nxVersion = '21.0.0',
  ) => {
    const tree = createTreeWithEmptyWorkspace();
    addDependenciesToPackageJson(tree, { nx: nxVersion }, {});
    await generator(tree, options);
    const config = readProjectConfiguration(tree, options.analogAppName);
    return {
      tree,
      config,
    };
  };

  it('should match project.json', async () => {
    const { tree } = await setup({
      analogAppName: 'my-app',
      tags: 'tag1,tag2, type:app',
    });

    expect(tree.read('/my-app/project.json').toString()).toMatchSnapshot();
  });

  it('should match vite.config.ts', async () => {
    const { tree } = await setup({ analogAppName: 'my-app' });

    expect(tree.read('/my-app/vite.config.ts').toString()).toMatchSnapshot();
  });

  it('should match index.html', async () => {
    const { tree } = await setup({ analogAppName: 'my-app' });

    expect(tree.read('/my-app/index.html').toString()).toMatchSnapshot();
  });

  it('should match src/test-setup.ts', async () => {
    const { tree } = await setup({ analogAppName: 'my-app' });

    expect(tree.read('/my-app/src/test-setup.ts').toString()).toMatchSnapshot();
  });
});

import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import {
  readProjectConfiguration,
  addDependenciesToPackageJson,
} from '@nx/devkit';

import generator from './generator';
import { AnalogNxApplicationGeneratorOptions } from '../app/schema';

describe('preset generator', () => {
  const setup = async (options: AnalogNxApplicationGeneratorOptions) => {
    const tree = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    addDependenciesToPackageJson(tree, { nx: '16.4.0' }, {});
    await generator(tree, options);
    const config = readProjectConfiguration(tree, options.analogAppName);
    return {
      tree,
      config,
    };
  };

  it('should run successfully', async () => {
    const { config } = await setup({ analogAppName: 'analog' });
    expect(config).toBeDefined();
  });
});

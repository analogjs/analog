import { createTreeWithEmptyWorkspace } from '@nrwl/devkit/testing';
import {
  Tree,
  readProjectConfiguration,
  addDependenciesToPackageJson,
} from '@nrwl/devkit';

import generator from './generator';
import { PresetGeneratorSchema } from './schema';
import { AnalogNxApplicationGeneratorOptions } from '../app/schema';

describe('preset generator', () => {
  const setup = async (options: AnalogNxApplicationGeneratorOptions) => {
    const tree = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    addDependenciesToPackageJson(tree, { nx: '16.0.0' }, {});
    await generator(tree, options);
    const config = readProjectConfiguration(tree, options.name);
    return {
      tree,
      config,
    };
  };

  it('should run successfully', async () => {
    const { config, tree } = await setup({ name: 'analog' });
    expect(config).toBeDefined();
  });
});

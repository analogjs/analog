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
    nxVersion = '17.0.0',
  ) => {
    const tree = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    addDependenciesToPackageJson(tree, { nx: nxVersion }, {});
    await generator(tree, options);
    const config = readProjectConfiguration(tree, options.analogAppName);
    return {
      tree,
      config,
    };
  };

  it('should run successfully with latest', async () => {
    const { config } = await setup({ analogAppName: 'analog' });
    expect(config).toBeDefined();
  });

  it('should run successfully with Nx 16.x', async () => {
    const { config } = await setup({ analogAppName: 'analog' }, '16.10.0');
    expect(config).toBeDefined();
  });
});

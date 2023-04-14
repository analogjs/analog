import { createTreeWithEmptyWorkspace } from '@nrwl/devkit/testing';
import { readJson, readProjectConfiguration } from '@nrwl/devkit';

import generator from './generator';
import { AnalogNxApplicationGeneratorOptions } from './schema';

describe('nx-plugin generator', () => {
  const setup = async (options: AnalogNxApplicationGeneratorOptions) => {
    const tree = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    await generator(tree, options);
    const config = readProjectConfiguration(tree, options.name);
    return {
      tree,
      config,
    };
  };

  it('should run successfully and create an analogjs app in the source directory', async () => {
    const { config, tree } = await setup({ name: 'analog' });

    const { dependencies, devDependencies } = readJson(tree, 'package.json');

    expect(dependencies['@analogjs/router']).toBe('^0.2.0-beta.1');
    expect(dependencies['@angular/platform-server']).toBe('^16.0.0-rc.0');

    expect(devDependencies['@analogjs/platform']).toBe('^0.2.0-beta.1');
    expect(devDependencies['vite-tsconfig-paths']).toBe('^4.0.2');

    expect(config.root).toBe('apps/analog');
    expect(config.projectType).toBe('application');
  });
});

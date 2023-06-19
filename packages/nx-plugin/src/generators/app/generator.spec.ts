import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import {
  ProjectConfiguration,
  readJson,
  readProjectConfiguration,
  Tree,
} from '@nx/devkit';

import generator from './generator';
import { AnalogNxApplicationGeneratorOptions } from './schema';
import { addDependenciesToPackageJson } from '@nx/devkit';

describe('nx-plugin generator', () => {
  const setup = async (options: AnalogNxApplicationGeneratorOptions) => {
    const tree = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    addDependenciesToPackageJson(tree, { nx: '16.0.0' }, {});
    await generator(tree, options);
    const config = readProjectConfiguration(tree, options.analogAppName);
    return {
      tree,
      config,
    };
  };

  const verifyCoreDependencies = (
    dependencies: Record<string, string>,
    devDependencies: Record<string, string>
  ) => {
    expect(dependencies['@analogjs/router']).toBe('^0.2.0-beta.16');
    expect(dependencies['@angular/platform-server']).toBe('^16.0.0');

    expect(devDependencies['@analogjs/platform']).toBe('^0.2.0-beta.16');
    expect(devDependencies['vite-tsconfig-paths']).toBe('^4.0.2');
  };

  const verifyConfig = (config: ProjectConfiguration, name: string) => {
    expect(config.projectType).toBe('application');
    expect(config.root).toBe('apps/' + name);
  };

  const verifyHomePageExists = (tree: Tree, appName: string) => {
    const hasHomePageFile = tree.exists(
      `apps/${appName}/src/app/pages/(home).page.ts`
    );
    const hasWelcomeComponentFile = tree.exists(
      `apps/${appName}/src/app/pages/analog-welcome.component.ts`
    );
    expect(hasHomePageFile).toBeTruthy();
    expect(hasWelcomeComponentFile).toBeTruthy();
  };

  it('creates a default analogjs app in the source directory', async () => {
    const analogAppName = 'analog';
    const { config, tree } = await setup({ analogAppName });
    const { dependencies, devDependencies } = readJson(tree, 'package.json');

    verifyCoreDependencies(dependencies, devDependencies);

    verifyConfig(config, analogAppName);

    verifyHomePageExists(tree, analogAppName);
  });

  it('creates an analogjs app in the source directory with tailwind set up', async () => {
    const analogAppName = 'tailwind-app';
    const { config, tree } = await setup({ analogAppName, addTailwind: true });
    const { dependencies, devDependencies } = readJson(tree, 'package.json');

    verifyCoreDependencies(dependencies, devDependencies);

    verifyConfig(config, analogAppName);

    verifyHomePageExists(tree, analogAppName);

    expect(devDependencies['tailwindcss']).toBeDefined();
    const hasTailwindConfigFile = tree.exists(
      'apps/tailwind-app/tailwind.config.js'
    );
    const hasPostCSSConfigFile = tree.exists(
      'apps/tailwind-app/postcss.config.js'
    );
    expect(hasTailwindConfigFile).toBeTruthy();
    expect(hasPostCSSConfigFile).toBeTruthy();
  });

  it('creates an analogjs app in the source directory with trpc set up', async () => {
    const analogAppName = 'trpc-app';
    const { config, tree } = await setup({ analogAppName, addTRPC: true });
    const { dependencies, devDependencies } = readJson(tree, 'package.json');

    verifyCoreDependencies(dependencies, devDependencies);

    verifyConfig(config, analogAppName);

    verifyHomePageExists(tree, analogAppName);

    expect(dependencies['@analogjs/trpc']).toBeDefined();
    const hasTrpcClientFile = tree.exists('apps/trpc-app/src/trpc-client.ts');
    const hasNoteFile = tree.exists('apps/trpc-app/src/note.ts');
    const hasTrpcServerRoute = tree.exists(
      'apps/trpc-app/src/server/routes/trpc/[trpc].ts'
    );
    expect(hasTrpcClientFile).toBeTruthy();
    expect(hasNoteFile).toBeTruthy();
    expect(hasTrpcServerRoute).toBeTruthy();

    const providesTrpcClient = tree
      .read('apps/trpc-app/src/app/app.config.ts')
      .includes('provideTrpcClient');
    const injectsTrpcClient = tree
      .read('apps/trpc-app/src/app/pages/analog-welcome.component.ts')
      .includes('injectTrpcClient');
    expect(providesTrpcClient).toBeTruthy();
    expect(injectsTrpcClient).toBeTruthy();
  });
});

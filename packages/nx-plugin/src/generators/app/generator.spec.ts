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
  const setup = async (
    options: AnalogNxApplicationGeneratorOptions,
    installedAngularVersion = 16
  ) => {
    const tree = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });

    addDependenciesToPackageJson(tree, { nx: '16.0.0' }, {});
    if (installedAngularVersion !== 16) {
      addDependenciesToPackageJson(
        tree,
        { '@angular/core': `${installedAngularVersion}.0.0` },
        {}
      );
    }
    await generator(tree, options);
    const config = readProjectConfiguration(tree, options.analogAppName);
    return {
      tree,
      config,
    };
  };

  const verifyCoreDependenciesV15 = (
    dependencies: Record<string, string>,
    devDependencies: Record<string, string>
  ) => {
    expect(dependencies['@analogjs/content']).toBe('^0.2.0-beta.16');
    expect(dependencies['@analogjs/router']).toBe('^0.2.0-beta.16');
    expect(dependencies['@angular/platform-server']).toBe(
      dependencies['@angular/core']
    );
    expect(dependencies['front-matter']).toBe('^4.0.2');
    expect(dependencies['marked']).toBe('^5.0.2');
    expect(dependencies['prismjs']).toBe('^1.29.0');

    expect(devDependencies['@analogjs/platform']).toBe('0.1.0-beta.23');
    expect(devDependencies['@nx/vite']).toBe('^15.7.0');
    expect(devDependencies['jsdom']).toBe('^20.0.0');
    expect(devDependencies['typescript']).toBe('~4.8.4');
    expect(devDependencies['vite']).toBe('^4.0.3');
    expect(devDependencies['vite-tsconfig-paths']).toBe('^4.0.2');
    expect(devDependencies['vitest']).toBe('^0.31.0');
  };

  const verifyCoreDependenciesV16 = (
    dependencies: Record<string, string>,
    devDependencies: Record<string, string>
  ) => {
    expect(dependencies['@analogjs/content']).toBe('^0.2.0-beta.16');
    expect(dependencies['@analogjs/router']).toBe('^0.2.0-beta.16');
    expect(dependencies['@angular/platform-server']).toBe(
      dependencies['@angular/core']
    );
    expect(dependencies['front-matter']).toBe('^4.0.2');
    expect(dependencies['marked']).toBe('^5.0.2');
    expect(dependencies['prismjs']).toBe('^1.29.0');

    expect(devDependencies['@analogjs/platform']).toBe('^0.2.0-beta.16');
    expect(devDependencies['@nx/vite']).toBe('^16.0.0');
    expect(devDependencies['jsdom']).toBe('^20.0.0');
    expect(devDependencies['typescript']).toBe('~5.0.2');
    expect(devDependencies['vite']).toBe('^4.0.3');
    expect(devDependencies['vite-tsconfig-paths']).toBe('^4.0.2');
    expect(devDependencies['vitest']).toBe('^0.31.0');
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

  it('creates a default analogjs app in the source directory for Nx and Angular v16', async () => {
    const analogAppName = 'analog';
    const { config, tree } = await setup({ analogAppName });
    const { dependencies, devDependencies } = readJson(tree, 'package.json');

    verifyCoreDependenciesV16(dependencies, devDependencies);

    verifyConfig(config, analogAppName);

    verifyHomePageExists(tree, analogAppName);
  });

  it('creates a default analogjs app in the source directory for Nx and Angular v15', async () => {
    const analogAppName = 'analog';
    const { config, tree } = await setup({ analogAppName }, 15);
    const { dependencies, devDependencies } = readJson(tree, 'package.json');

    verifyCoreDependenciesV15(dependencies, devDependencies);

    verifyConfig(config, analogAppName);

    verifyHomePageExists(tree, analogAppName);
  });

  it('creates an analogjs app in the source directory with tailwind set up', async () => {
    const analogAppName = 'tailwind-app';
    const { config, tree } = await setup({ analogAppName, addTailwind: true });
    const { dependencies, devDependencies } = readJson(tree, 'package.json');

    verifyCoreDependenciesV16(dependencies, devDependencies);

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

    verifyCoreDependenciesV16(dependencies, devDependencies);

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

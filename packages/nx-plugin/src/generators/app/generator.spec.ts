import {
  addDependenciesToPackageJson,
  ProjectConfiguration,
  readJson,
  readProjectConfiguration,
  Tree,
} from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { lt } from 'semver';

import generator from './generator';
import { AnalogNxApplicationGeneratorOptions } from './schema';
import { checkAndCleanWithSemver } from '@nx/devkit/src/utils/semver';

describe('nx-plugin generator', () => {
  const setup = async (
    options: AnalogNxApplicationGeneratorOptions,
    nxVersion = '21.0.0',
    standalone = false,
  ) => {
    const tree = createTreeWithEmptyWorkspace(
      standalone ? {} : { layout: 'apps-libs' },
    );

    addDependenciesToPackageJson(tree, {}, { nx: nxVersion });
    await generator(tree, options);
    const config = readProjectConfiguration(tree, options.analogAppName);
    return {
      tree,
      config,
    };
  };

  const verifyCoreDependenciesNx_Angular = (
    dependencies: Record<string, string>,
    devDependencies: Record<string, string>,
  ) => {
    expect(dependencies['@analogjs/content']).toBeDefined();
    expect(dependencies['@analogjs/router']).toBeDefined();
    expect(dependencies['@angular/platform-server']).toBeDefined();
    expect(dependencies['front-matter']).toBe('^4.0.2');
    expect(dependencies['marked']).toBe('^15.0.7');
    expect(dependencies['marked-gfm-heading-id']).toBe('^4.1.1');
    expect(dependencies['marked-highlight']).toBe('^2.2.1');
    expect(dependencies['marked-mangle']).toBe('^1.1.10');
    expect(dependencies['mermaid']).toBe('^10.2.4');
    expect(dependencies['prismjs']).toBe('^1.29.0');

    expect(dependencies['@nx/angular']).toBeDefined();
    // we just check for truthy because @nx/eslint generator
    // will install the correct version based on Nx version
    // expect(devDependencies['@nx/eslint']).toBeTruthy();
    expect(devDependencies['@analogjs/platform']).toBeDefined();
    expect(devDependencies['@analogjs/vite-plugin-angular']).toBeDefined();
    expect(devDependencies['@analogjs/vitest-angular']).toBeDefined();
    expect(devDependencies['@nx/vite']).toBeDefined();
    expect(devDependencies['jsdom']).toBeDefined();
    expect(devDependencies['vite']).toBeDefined();
    expect(devDependencies['vite-tsconfig-paths']).toBe('^4.2.0');
    expect(devDependencies['vitest']).toBeDefined();
  };

  const verifyConfig = (
    config: ProjectConfiguration,
    name: string,
    standalone = false,
  ) => {
    expect(config.projectType).toBe('application');
    expect(config.root).toBe(standalone ? name : 'apps/' + name);
    expect(config.targets.build.outputs).toBeDefined();
  };

  const verifyHomePageExists = (
    tree: Tree,
    appName: string,
    standalone = false,
  ) => {
    const hasHomePageFile = tree.exists(
      `${standalone ? '' : 'apps/'}${appName}/src/app/pages/(home).page.ts`,
    );
    const hasWelcomeComponentFile = tree.exists(
      `${
        standalone ? '' : 'apps/'
      }${appName}/src/app/pages/analog-welcome.component.ts`,
    );
    expect(hasHomePageFile).toBeTruthy();
    expect(hasWelcomeComponentFile).toBeTruthy();
  };

  const verifyEslint = (
    tree: Tree,
    config: ProjectConfiguration,
    devDependencies: Record<string, string>,
  ) => {
    expect(devDependencies['@nx/eslint']).toBeDefined();
  };

  const verifyTailwindIsSetUp = (
    tree: Tree,
    dependencies: Record<string, string>,
  ) => {
    expect(dependencies['tailwindcss']).toBeDefined();

    const version = checkAndCleanWithSemver(
      'tailwindcss',
      dependencies['tailwindcss'],
    );

    if (lt(version, '4.0.0')) {
      const hasTailwindConfigFile = tree.exists(
        'apps/tailwind-app/tailwind.config.ts',
      );
      const hasPostCSSConfigFile = tree.exists(
        'apps/tailwind-app/postcss.config.cjs',
      );
      expect(hasTailwindConfigFile).toBeTruthy();
      expect(hasPostCSSConfigFile).toBeTruthy();
    } else {
      expect(dependencies['@tailwindcss/vite']).toBeDefined();

      const hasCorrectCssImplementation = tree
        .read('apps/tailwind-app/src/styles.css')
        .includes(`@import 'tailwindcss';`);

      const regex = /plugins: \[.*\btailwindcss\(\)/s;

      const viteConfig = tree
        .read('apps/tailwind-app/vite.config.ts')
        .toString();

      expect(regex.test(viteConfig)).toBeTruthy();
      expect(hasCorrectCssImplementation).toBeTruthy();
    }
  };

  const verifyTrpcIsSetUp = (
    tree: Tree,
    dependencies: Record<string, string>,
  ) => {
    expect(dependencies['@analogjs/trpc']).toBeDefined();
    const hasTrpcClientFile = tree.exists('apps/trpc-app/src/trpc-client.ts');
    const hasNoteFile = tree.exists('apps/trpc-app/src/note.ts');
    const hasTrpcServerRoute = tree.exists(
      'apps/trpc-app/src/server/routes/api/trpc/[trpc].ts',
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
  };

  const verifyTagsArePopulated = (
    config: ProjectConfiguration,
    tags: string[],
  ) => {
    expect(config.tags).toBeDefined();
    expect(config.tags).toEqual(tags);
  };

  describe('Nx, Angular', () => {
    it('creates a default analogjs app in the source directory', async () => {
      const analogAppName = 'analog';
      const { config, tree } = await setup({ analogAppName });
      const { dependencies, devDependencies } = readJson(tree, 'package.json');

      verifyCoreDependenciesNx_Angular(dependencies, devDependencies);

      verifyConfig(config, analogAppName);

      verifyHomePageExists(tree, analogAppName);

      // verifyEslint(tree, config, devDependencies);
    });

    it('creates a default standalone analogjs app in the source directory', async () => {
      const analogAppName = 'analog';
      const { config, tree } = await setup({ analogAppName }, '18.0.0', true);
      const { dependencies, devDependencies } = readJson(tree, 'package.json');

      verifyCoreDependenciesNx_Angular(dependencies, devDependencies);

      verifyConfig(config, analogAppName, true);

      verifyHomePageExists(tree, analogAppName, true);

      // verifyEslint(tree, config, devDependencies);
    });

    it('creates an analogjs app in the source directory with tailwind set up', async () => {
      const analogAppName = 'tailwind-app';
      const { config, tree } = await setup({
        analogAppName,
        addTailwind: true,
      });
      const { dependencies, devDependencies } = readJson(tree, 'package.json');

      verifyCoreDependenciesNx_Angular(dependencies, devDependencies);

      verifyConfig(config, analogAppName);

      verifyHomePageExists(tree, analogAppName);

      verifyTailwindIsSetUp(tree, dependencies);
    });

    it('creates an analogjs app in the source directory with trpc set up', async () => {
      const analogAppName = 'trpc-app';
      const { config, tree } = await setup({ analogAppName, addTRPC: true });
      const { dependencies, devDependencies } = readJson(tree, 'package.json');

      verifyCoreDependenciesNx_Angular(dependencies, devDependencies);

      verifyConfig(config, analogAppName);

      verifyHomePageExists(tree, analogAppName);
      verifyTrpcIsSetUp(tree, dependencies);
    });

    it('creates an analogjs app in the source directory with tags populated', async () => {
      const analogAppName = 'tags-app';
      const { config, tree } = await setup({
        analogAppName,
        tags: 'tag1,tag2, type:app ',
      });
      const { dependencies, devDependencies } = readJson(tree, 'package.json');

      verifyCoreDependenciesNx_Angular(dependencies, devDependencies);

      verifyConfig(config, analogAppName);

      verifyHomePageExists(tree, analogAppName);
      verifyTagsArePopulated(config, ['tag1', 'tag2', 'type:app']);
    });
  });
});

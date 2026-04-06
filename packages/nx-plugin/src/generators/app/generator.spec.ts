import {
  addDependenciesToPackageJson,
  ProjectConfiguration,
  readJson,
  readProjectConfiguration,
  Tree,
} from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { describe, expect, it } from 'vitest';

import generator from './generator';
import { AnalogNxApplicationGeneratorOptions } from './schema';

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

    // we just check for truthy because @nx/eslint generator
    // will install the correct version based on Nx version
    // expect(devDependencies['@nx/eslint']).toBeTruthy();
    expect(devDependencies['@analogjs/platform']).toBeDefined();
    expect(devDependencies['@analogjs/vite-plugin-angular']).toBeDefined();
    expect(devDependencies['@analogjs/vitest-angular']).toBeDefined();
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
    expect(config.targets?.build?.outputs).toBeDefined();
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
    const postcssConfig = tree.read(
      'apps/tailwind-app/postcss.config.mjs',
      'utf-8',
    );

    expect(dependencies['postcss']).toBeDefined();
    expect(dependencies['tailwindcss']).toBeDefined();
    expect(dependencies['@tailwindcss/postcss']).toBeDefined();
    expect(dependencies['@tailwindcss/vite']).toBeDefined();
    const viteConfig = tree.read('apps/tailwind-app/vite.config.ts', 'utf-8');
    const styles = tree.read('apps/tailwind-app/src/styles.css', 'utf-8');

    expect(styles?.includes(`@import 'tailwindcss';`)).toBeTruthy();
    expect(postcssConfig).toContain(`'@tailwindcss/postcss': {}`);
    expect(viteConfig).toContain(
      `import tailwindcss from '@tailwindcss/vite';`,
    );
    expect(viteConfig).toMatch(
      /plugins:\s*\[[\s\S]*analog\(\),[\s\S]*tailwindcss\(\)/,
    );
  };

  const verifyTagsArePopulated = (
    config: ProjectConfiguration,
    tags: string[],
  ) => {
    expect(config.tags).toBeDefined();
    expect(config.tags).toEqual(tags);
  };

  describe('Nx, Angular', () => {
    // oxlint-disable-next-line vitest/expect-expect
    it('creates a default analogjs app in the source directory', async () => {
      const analogAppName = 'analog';
      const { config, tree } = await setup({ analogAppName });
      const { dependencies, devDependencies } = readJson(tree, 'package.json');

      verifyCoreDependenciesNx_Angular(dependencies, devDependencies);

      verifyConfig(config, analogAppName);

      verifyHomePageExists(tree, analogAppName);

      // verifyEslint(tree, config, devDependencies);
    }, 30_000);

    // oxlint-disable-next-line vitest/expect-expect
    it('creates a default standalone analogjs app in the source directory', async () => {
      const analogAppName = 'analog';
      const { config, tree } = await setup({ analogAppName }, '18.0.0', true);
      const { dependencies, devDependencies } = readJson(tree, 'package.json');

      verifyCoreDependenciesNx_Angular(dependencies, devDependencies);

      verifyConfig(config, analogAppName, true);

      verifyHomePageExists(tree, analogAppName, true);

      // verifyEslint(tree, config, devDependencies);
    });

    // oxlint-disable-next-line vitest/expect-expect
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

    // oxlint-disable-next-line vitest/expect-expect
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

import {
  addDependenciesToPackageJson,
  ProjectConfiguration,
  readJson,
  readProjectConfiguration,
  Tree,
} from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { lt } from 'semver';
import { vi } from 'vitest';

import generator from './generator';
import { AnalogNxApplicationGeneratorOptions } from './schema';
import { checkAndCleanWithSemver } from '@nx/devkit/internal';

// Record the options handed to the Angular application generator while keeping
// linting off, so the tests don't depend on a linter package being set up.
vi.mock('@nx/angular/generators', async (importOriginal) => {
  const mod =
    await importOriginal<typeof import('@nx/angular/dist/generators')>();
  return {
    ...mod,
    applicationGenerator: vi.fn((tree, options) =>
      mod.applicationGenerator(tree, { ...options, linter: 'none' }),
    ),
  };
});

describe('nx-plugin generator', () => {
  const setup = async (
    options: AnalogNxApplicationGeneratorOptions,
    nxVersion = '21.0.0',
    standalone = false,
  ) => {
    const tree = createTreeWithEmptyWorkspace({
      formatter: 'prettier',
      ...(standalone ? {} : { layout: 'apps-libs' }),
    });

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
      expect(dependencies['@tailwindcss/postcss']).toBeDefined();

      const hasPostCSSConfigFile = tree.exists(
        'apps/tailwind-app/.postcssrc.json',
      );
      const hasCorrectCssImplementation = tree
        .read('apps/tailwind-app/src/styles.css')
        .includes(`@import 'tailwindcss';`);

      expect(hasCorrectCssImplementation).toBeTruthy();
      expect(hasPostCSSConfigFile).toBeTruthy();
    }
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

    it('generates agent context in the app wired to @analogjs/platform', async () => {
      const analogAppName = 'agents-app';
      const { tree } = await setup({ analogAppName });

      expect(tree.read(`apps/${analogAppName}/AGENTS.md`).toString()).toContain(
        'node_modules/@analogjs/platform/AGENTS.md',
      );
      expect(tree.read(`apps/${analogAppName}/CLAUDE.md`).toString()).toContain(
        '@AGENTS.md',
      );
    });

    it('passes the linter option to the Angular application generator', async () => {
      const { applicationGenerator } = await import('@nx/angular/generators');

      await setup({ analogAppName: 'oxlint-app', linter: 'oxlint' }, '23.2.0');

      expect(applicationGenerator).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ name: 'oxlint-app', linter: 'oxlint' }),
      );
    });

    it('rejects the oxlint linter on Nx versions below 23.2', async () => {
      await expect(
        setup({ analogAppName: 'oxlint-app', linter: 'oxlint' }, '23.1.0'),
      ).rejects.toThrow(
        'Nx v23.2.0 or newer is required to use the oxlint linter',
      );
    });

    it('does not overwrite existing agent context in the app', async () => {
      const analogAppName = 'existing-agents-app';
      const tree = createTreeWithEmptyWorkspace({
        layout: 'apps-libs',
        formatter: 'prettier',
      });

      addDependenciesToPackageJson(tree, {}, { nx: '21.0.0' });
      tree.write(`apps/${analogAppName}/AGENTS.md`, '# Custom guidance');

      await generator(tree, { analogAppName });

      expect(tree.read(`apps/${analogAppName}/AGENTS.md`).toString()).toContain(
        '# Custom guidance',
      );
      expect(tree.exists(`apps/${analogAppName}/CLAUDE.md`)).toBe(true);
    });
  });
});

import { Tree, addProjectConfiguration, writeJson } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import setupVitestGenerator from './generator';
import {
  V19_X_ANALOG_JS_VITE_PLUGIN_ANGULAR,
  V19_X_ANALOG_JS_VITEST_ANGULAR,
  V19_X_JSDOM,
  V19_X_VITE_TSCONFIG_PATHS,
  V19_X_VITEST,
  V19_X_VITE,
  NX_X_LATEST_VITE,
  NX_X_LATEST_VITEST,
} from '../../utils/versions/ng_19_X/versions';

describe('setup-vitest generator', () => {
  let tree: Tree;

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();

    // Setup mock Angular project
    addProjectConfiguration(tree, 'test-app', {
      root: 'test-app',
      sourceRoot: 'test-app/src',
      projectType: 'application',
      targets: {},
    });

    // Add package.json with Angular dependencies
    writeJson(tree, 'package.json', {
      dependencies: {
        '@angular/core': '19.0.0',
        '@nx/angular': '20.0.0',
        nx: '20.0.0',
      },
      devDependencies: {},
    });

    // Add Angular project files
    writeJson(tree, 'test-app/tsconfig.json', {
      compilerOptions: {
        types: [],
      },
      include: [],
    });
  });

  it('should add the correct dev dependencies', async () => {
    await setupVitestGenerator(tree, {
      project: 'test-app',
    });

    const packageJson = JSON.parse(tree.read('package.json', 'utf-8'));
    expect(packageJson.devDependencies).toMatchObject({
      '@analogjs/vite-plugin-angular': V19_X_ANALOG_JS_VITE_PLUGIN_ANGULAR,
      '@analogjs/vitest-angular': V19_X_ANALOG_JS_VITEST_ANGULAR,
      vitest: V19_X_VITEST,
      jsdom: V19_X_JSDOM,
      vite: V19_X_VITE,
      'vite-tsconfig-paths': V19_X_VITE_TSCONFIG_PATHS,
    });
  });

  it('should modify project configuration', async () => {
    await setupVitestGenerator(tree, {
      project: 'test-app',
    });

    const projectConfig = JSON.parse(
      tree.read('test-app/project.json', 'utf-8'),
    );

    expect(projectConfig.targets.test).toBeDefined();
    expect(projectConfig.targets.test.executor).toBe(
      '@analogjs/vitest-angular:test',
    );
  });

  it('should create vite.config.mts with correct content', async () => {
    await setupVitestGenerator(tree, {
      project: 'test-app',
    });

    expect(tree.exists('test-app/vite.config.mts')).toBeTruthy();
    const vitestConfig = tree.read('test-app/vite.config.mts', 'utf-8');
    expect(vitestConfig).toEqual(
      [
        '/// <reference types="vitest" />',
        '',
        `import angular from '@analogjs/vite-plugin-angular';`,
        '',
        `import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';`,
        '',
        `import { defineConfig } from 'vite';`,
        '',
        '// https://vitejs.dev/config/',
        'export default defineConfig(({ mode }) => {',
        '  return {',
        '    plugins: [angular(), nxViteTsPaths()],',
        '    test: {',
        '      globals: true,',
        "      environment: 'jsdom',",
        "      setupFiles: ['src/test-setup.ts'],",
        "      include: ['**/*.spec.ts'],",
        "      reporters: ['default'],",
        '    },',
        '    define: {',
        "      'import.meta.vitest': mode !== 'production',",
        '    },',
        '  };',
        '});',
        '',
      ].join('\n'),
    );
  });

  it('should update tsconfig.spec.json', async () => {
    // Create initial tsconfig.spec.json without files property
    writeJson(tree, 'test-app/tsconfig.spec.json', {
      compilerOptions: {
        types: ['node'],
        module: 'commonjs',
      },
    });

    await setupVitestGenerator(tree, {
      project: 'test-app',
    });

    const tsconfig = JSON.parse(
      tree.read('test-app/tsconfig.spec.json', 'utf-8'),
    );

    // Check all modifications made by updateTsConfig
    expect(tsconfig.compilerOptions.module).toBeUndefined();
    expect(tsconfig.compilerOptions.target).toBe('es2016');
    expect(tsconfig.compilerOptions.types).toEqual(['node', 'vitest/globals']);
    expect(tsconfig.files).toEqual(['src/test-setup.ts']);
  });

  it('should add vite 6 when using nx 20.5', async () => {
    // Setup with Nx 20.5
    writeJson(tree, 'package.json', {
      dependencies: {
        '@angular/core': '19.0.0',
        '@nx/angular': '20.5.0',
        nx: '20.5.0',
      },
      devDependencies: {},
    });

    await setupVitestGenerator(tree, {
      project: 'test-app',
    });

    const packageJson = JSON.parse(tree.read('package.json', 'utf-8'));
    expect(packageJson.devDependencies.vite).toBe(NX_X_LATEST_VITE); // '^6.0.0'
    expect(packageJson.devDependencies.vitest).toBe(NX_X_LATEST_VITEST); // '^3.0.0'
  });

  it('should create test-setup.ts with correct content', async () => {
    await setupVitestGenerator(tree, {
      project: 'test-app',
    });

    expect(tree.exists('test-app/src/test-setup.ts')).toBeTruthy();

    const setupContent = tree.read('test-app/src/test-setup.ts', 'utf-8');
    expect(setupContent).toEqual(
      [
        `import '@analogjs/vitest-angular/setup-zone';`,
        '',
        'import {',
        '  BrowserDynamicTestingModule,',
        '  platformBrowserDynamicTesting,',
        `} from '@angular/platform-browser-dynamic/testing';`,
        `import { getTestBed } from '@angular/core/testing';`,
        '',
        'getTestBed().initTestEnvironment(',
        '  BrowserDynamicTestingModule,',
        '  platformBrowserDynamicTesting(),',
        ');',
        '',
      ].join('\n'),
    );
  });
});

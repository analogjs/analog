import {
  SchematicTestRunner,
  UnitTestTree,
} from '@angular-devkit/schematics/testing';
import { Tree } from '@angular-devkit/schematics';
import * as path from 'path';

// Must use the built collection.json because the schematic runner resolves
// the compiled CommonJS output rather than the TypeScript sources.
const collectionPath = path.join(
  __dirname,
  '../../../../vitest-angular/dist/src/lib/tools/collection.json',
);

describe('setup schematic', () => {
  let runner: SchematicTestRunner;
  let tree: UnitTestTree;

  beforeEach(() => {
    runner = new SchematicTestRunner('schematics', collectionPath);
    tree = new UnitTestTree(Tree.empty());

    // Create angular.json with a test project
    tree.create(
      '/angular.json',
      JSON.stringify({
        version: 1,
        projects: {
          'test-app': {
            root: '',
            sourceRoot: 'src',
            architect: {},
          },
        },
      }),
    );

    // Create package.json with Angular 20
    tree.create(
      '/package.json',
      JSON.stringify({
        dependencies: {
          '@angular/core': '^20.0.0',
        },
        devDependencies: {},
      }),
    );

    // Create tsconfig.spec.json
    tree.create(
      '/tsconfig.spec.json',
      JSON.stringify({
        compilerOptions: {
          types: ['node', 'jest'],
          module: 'commonjs',
        },
      }),
    );
  });

  it('should add the correct dev dependencies for Angular 20', async () => {
    const resultTree = await runner.runSchematic(
      'setup',
      { project: 'test-app' },
      tree,
    );

    const packageJson = JSON.parse(resultTree.readContent('/package.json'));
    expect(packageJson.devDependencies).toMatchObject({
      '@analogjs/vite-plugin-angular': expect.anything(),
      jsdom: '^22.0.0',
      vite: '^7.0.0',
      vitest: '^4.0.0',
      'vite-tsconfig-paths': '^4.2.0',
    });
  });

  it('should add vitest v4 for Angular 21+', async () => {
    // Update to Angular 21
    tree.overwrite(
      '/package.json',
      JSON.stringify({
        dependencies: {
          '@angular/core': '^21.0.0',
        },
        devDependencies: {},
      }),
    );

    const resultTree = await runner.runSchematic(
      'setup',
      { project: 'test-app' },
      tree,
    );

    const packageJson = JSON.parse(resultTree.readContent('/package.json'));
    expect(packageJson.devDependencies.vitest).toBe('^4.0.0');
  });

  it('should update angular.json test target', async () => {
    const resultTree = await runner.runSchematic(
      'setup',
      { project: 'test-app' },
      tree,
    );

    const angularJson = JSON.parse(resultTree.readContent('/angular.json'));
    expect(angularJson.projects['test-app'].architect.test).toEqual({
      builder: '@analogjs/vitest-angular:test',
    });
  });

  it('should create vite.config.mts with vite-tsconfig-paths for non-Nx', async () => {
    const resultTree = await runner.runSchematic(
      'setup',
      { project: 'test-app' },
      tree,
    );

    expect(resultTree.exists('/vite.config.mts')).toBeTruthy();
    const viteConfig = resultTree.readContent('/vite.config.mts');
    expect(viteConfig).toContain(
      "import angular from '@analogjs/vite-plugin-angular'",
    );
    expect(viteConfig).toContain(
      "import viteTsConfigPaths from 'vite-tsconfig-paths'",
    );
    expect(viteConfig).toContain('plugins: [angular(), viteTsConfigPaths()]');
    expect(viteConfig).not.toContain('nxViteTsPaths');
    expect(viteConfig).not.toContain(
      '@nx/vite/plugins/nx-tsconfig-paths.plugin',
    );
  });

  it('should create vite.config.mts without path plugins for Nx workspace', async () => {
    // Create nx.json to simulate Nx workspace
    tree.create('/nx.json', JSON.stringify({ version: 2 }));

    const resultTree = await runner.runSchematic(
      'setup',
      { project: 'test-app' },
      tree,
    );

    expect(resultTree.exists('/vite.config.mts')).toBeTruthy();
    const viteConfig = resultTree.readContent('/vite.config.mts');
    expect(viteConfig).toContain(
      "import angular from '@analogjs/vite-plugin-angular'",
    );
    expect(viteConfig).toContain('plugins: [angular()]');
    expect(viteConfig).not.toContain('nxViteTsPaths');
    expect(viteConfig).not.toContain('viteTsConfigPaths');
    expect(viteConfig).not.toContain(
      '@nx/vite/plugins/nx-tsconfig-paths.plugin',
    );
  });

  it('should create test-setup.ts with BrowserTestingModule for Angular 20', async () => {
    const resultTree = await runner.runSchematic(
      'setup',
      { project: 'test-app' },
      tree,
    );

    expect(resultTree.exists('/src/test-setup.ts')).toBeTruthy();
    const setupContent = resultTree.readContent('/src/test-setup.ts');
    expect(setupContent).toContain("import '@angular/compiler'");
    expect(setupContent).toContain(
      "import '@analogjs/vitest-angular/setup-zone'",
    );
    expect(setupContent).toContain('BrowserTestingModule');
    expect(setupContent).toContain('platformBrowserTesting');
  });

  it('should create test-setup.ts with setupTestBed for Angular 21+', async () => {
    // Update to Angular 21
    tree.overwrite(
      '/package.json',
      JSON.stringify({
        dependencies: {
          '@angular/core': '^21.0.0',
        },
        devDependencies: {},
      }),
    );

    const resultTree = await runner.runSchematic(
      'setup',
      { project: 'test-app' },
      tree,
    );

    expect(resultTree.exists('/src/test-setup.ts')).toBeTruthy();
    const setupContent = resultTree.readContent('/src/test-setup.ts');
    expect(setupContent).toContain("import '@angular/compiler'");
    expect(setupContent).toContain(
      "import '@analogjs/vitest-angular/setup-snapshots'",
    );
    expect(setupContent).toContain(
      "import '@analogjs/vitest-angular/setup-serializers'",
    );
    expect(setupContent).toContain(
      "import { setupTestBed } from '@analogjs/vitest-angular/setup-testbed'",
    );
    expect(setupContent).toContain('setupTestBed()');
  });

  it('should update tsconfig.spec.json', async () => {
    const resultTree = await runner.runSchematic(
      'setup',
      { project: 'test-app' },
      tree,
    );

    const tsconfig = JSON.parse(resultTree.readContent('/tsconfig.spec.json'));
    expect(tsconfig.compilerOptions.module).toBeUndefined();
    expect(tsconfig.compilerOptions.target).toBe('es2022');
    expect(tsconfig.compilerOptions.types).toContain('vitest/globals');
    expect(tsconfig.compilerOptions.types).not.toContain('jest');
    expect(tsconfig.files).toEqual(['src/test-setup.ts']);
  });

  it('should handle tsconfig.spec.json with comments', async () => {
    // Create tsconfig.spec.json with comments (JSONC format)
    tree.overwrite(
      '/tsconfig.spec.json',
      `{
  // This is a comment
  "compilerOptions": {
    "types": ["node", "jest"], // inline comment
    "module": "commonjs"
  }
  /* block comment */
}`,
    );

    const resultTree = await runner.runSchematic(
      'setup',
      { project: 'test-app' },
      tree,
    );

    const tsconfig = JSON.parse(resultTree.readContent('/tsconfig.spec.json'));
    expect(tsconfig.compilerOptions.target).toBe('es2022');
    expect(tsconfig.compilerOptions.types).toContain('vitest/globals');
    expect(tsconfig.compilerOptions.types).not.toContain('jest');
  });

  it('should skip tsconfig.spec.json if not present', async () => {
    tree.delete('/tsconfig.spec.json');

    const resultTree = await runner.runSchematic(
      'setup',
      { project: 'test-app' },
      tree,
    );

    expect(resultTree.exists('/tsconfig.spec.json')).toBeFalsy();
    // Should still complete successfully
    expect(resultTree.exists('/vite.config.mts')).toBeTruthy();
  });

  it('should work with project in subdirectory', async () => {
    tree.overwrite(
      '/angular.json',
      JSON.stringify({
        version: 1,
        projects: {
          'my-app': {
            root: 'projects/my-app',
            sourceRoot: 'projects/my-app/src',
            architect: {},
          },
        },
      }),
    );

    tree.create(
      '/projects/my-app/tsconfig.spec.json',
      JSON.stringify({
        compilerOptions: {
          types: ['node'],
        },
      }),
    );

    const resultTree = await runner.runSchematic(
      'setup',
      { project: 'my-app' },
      tree,
    );

    expect(resultTree.exists('/projects/my-app/vite.config.mts')).toBeTruthy();
    expect(
      resultTree.exists('/projects/my-app/src/test-setup.ts'),
    ).toBeTruthy();
  });

  describe('browser mode', () => {
    it('should add playwright dependencies when browserMode is true', async () => {
      const resultTree = await runner.runSchematic(
        'setup',
        { project: 'test-app', browserMode: true },
        tree,
      );

      const packageJson = JSON.parse(resultTree.readContent('/package.json'));
      expect(packageJson.devDependencies).toMatchObject({
        '@vitest/browser-playwright': '^4.0.0',
        playwright: '^1.54.0',
      });
      expect(packageJson.devDependencies.jsdom).toBeUndefined();
    });

    it('should create vite.config.mts with browser config when browserMode is true', async () => {
      const resultTree = await runner.runSchematic(
        'setup',
        { project: 'test-app', browserMode: true },
        tree,
      );

      const viteConfig = resultTree.readContent('/vite.config.mts');
      expect(viteConfig).toContain(
        "import { playwright } from '@vitest/browser-playwright'",
      );
      expect(viteConfig).toContain('browser: {');
      expect(viteConfig).toContain('enabled: true');
      expect(viteConfig).toContain('provider: playwright()');
      expect(viteConfig).toContain("instances: [{ browser: 'chromium' }]");
      expect(viteConfig).not.toContain("environment: 'jsdom'");
    });

    it('should create vite.config.mts with jsdom when browserMode is false', async () => {
      const resultTree = await runner.runSchematic(
        'setup',
        { project: 'test-app', browserMode: false },
        tree,
      );

      const viteConfig = resultTree.readContent('/vite.config.mts');
      expect(viteConfig).toContain("environment: 'jsdom'");
      expect(viteConfig).not.toContain('@vitest/browser-playwright');
      expect(viteConfig).not.toContain('browser: {');
    });

    it('should create test-setup.ts with browserMode option for Angular 21+', async () => {
      // Update to Angular 21
      tree.overwrite(
        '/package.json',
        JSON.stringify({
          dependencies: {
            '@angular/core': '^21.0.0',
          },
          devDependencies: {},
        }),
      );

      const resultTree = await runner.runSchematic(
        'setup',
        { project: 'test-app', browserMode: true },
        tree,
      );

      const setupContent = resultTree.readContent('/src/test-setup.ts');
      expect(setupContent).toContain('setupTestBed({ browserMode: true })');
    });

    it('should create test-setup.ts without browserMode option when false', async () => {
      // Update to Angular 21
      tree.overwrite(
        '/package.json',
        JSON.stringify({
          dependencies: {
            '@angular/core': '^21.0.0',
          },
          devDependencies: {},
        }),
      );

      const resultTree = await runner.runSchematic(
        'setup',
        { project: 'test-app', browserMode: false },
        tree,
      );

      const setupContent = resultTree.readContent('/src/test-setup.ts');
      expect(setupContent).toContain('setupTestBed()');
      expect(setupContent).not.toContain('browserMode');
    });
  });
});

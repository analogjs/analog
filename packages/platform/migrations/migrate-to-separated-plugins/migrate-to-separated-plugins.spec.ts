import { describe, expect, it, beforeEach, vi } from 'vitest';
import { UnitTestTree } from '@angular-devkit/schematics/testing';
import { Tree, SchematicContext } from '@angular-devkit/schematics';

import migrateToSeparatedPlugins from './migrate-to-separated-plugins';

const LEGACY_CONFIG = `
import analog from '@analogjs/platform';
import { defineConfig } from 'vite';

export default defineConfig(() => ({
  plugins: [
    analog({ apiPrefix: 'api' }),
  ],
}));
`;

const SEPARATED_CONFIG = `
import analog from '@analogjs/platform';
import angular from '@analogjs/vite-plugin-angular';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';

export default defineConfig(() => ({
  plugins: [analog(), angular(), nitro()],
}));
`;

function createContext() {
  const infoLogs: string[] = [];
  return {
    infoLogs,
    context: {
      logger: {
        info: (msg: string) => infoLogs.push(msg),
      },
      addTask: vi.fn(),
    } as unknown as SchematicContext,
  };
}

describe('migrate-to-separated-plugins', () => {
  let tree: UnitTestTree;

  beforeEach(() => {
    tree = new UnitTestTree(Tree.empty());
  });

  it('logs the migration notice and adds deps when a legacy vite.config.ts is detected', () => {
    tree.create('/vite.config.ts', LEGACY_CONFIG);
    tree.create(
      '/package.json',
      JSON.stringify({
        devDependencies: {
          '@analogjs/platform': '^3.0.0-alpha.55',
        },
      }),
    );

    const { context, infoLogs } = createContext();
    migrateToSeparatedPlugins()(tree, context);

    const pkg = JSON.parse(tree.readContent('/package.json'));
    expect(pkg.devDependencies['@analogjs/vite-plugin-angular']).toBe(
      '^3.0.0-alpha.55',
    );
    expect(pkg.devDependencies['nitro']).toBe('3.0.260415-beta');
    expect(infoLogs.join('\n')).toContain('/vite.config.ts');
    expect(infoLogs.join('\n')).toContain('migrating-v2-to-v3');
  });

  it('is a no-op when the vite.config is already on the separated shape', () => {
    tree.create('/vite.config.ts', SEPARATED_CONFIG);
    tree.create(
      '/package.json',
      JSON.stringify({
        devDependencies: {
          '@analogjs/platform': '^3.0.0-alpha.55',
        },
      }),
    );

    const { context, infoLogs } = createContext();
    migrateToSeparatedPlugins()(tree, context);

    const pkg = JSON.parse(tree.readContent('/package.json'));
    expect(
      pkg.devDependencies['@analogjs/vite-plugin-angular'],
    ).toBeUndefined();
    expect(pkg.devDependencies['nitro']).toBeUndefined();
    expect(infoLogs).toEqual([]);
  });

  it('does not duplicate deps that are already declared', () => {
    tree.create('/vite.config.ts', LEGACY_CONFIG);
    tree.create(
      '/package.json',
      JSON.stringify({
        devDependencies: {
          '@analogjs/platform': '^3.0.0-alpha.55',
          '@analogjs/vite-plugin-angular': '^2.5.0',
          nitro: '3.0.250101-beta',
        },
      }),
    );

    const { context } = createContext();
    migrateToSeparatedPlugins()(tree, context);

    const pkg = JSON.parse(tree.readContent('/package.json'));
    expect(pkg.devDependencies['@analogjs/vite-plugin-angular']).toBe('^2.5.0');
    expect(pkg.devDependencies['nitro']).toBe('3.0.250101-beta');
  });

  it('reads version from `dependencies` if `devDependencies` is missing platform', () => {
    tree.create('/vite.config.ts', LEGACY_CONFIG);
    tree.create(
      '/package.json',
      JSON.stringify({
        dependencies: {
          '@analogjs/platform': '~3.0.0-alpha.55',
        },
      }),
    );

    const { context } = createContext();
    migrateToSeparatedPlugins()(tree, context);

    const pkg = JSON.parse(tree.readContent('/package.json'));
    expect(pkg.devDependencies['@analogjs/vite-plugin-angular']).toBe(
      '~3.0.0-alpha.55',
    );
  });

  it('skips files inside node_modules', () => {
    tree.create('/node_modules/some-pkg/vite.config.ts', LEGACY_CONFIG);
    tree.create(
      '/package.json',
      JSON.stringify({
        devDependencies: { '@analogjs/platform': '^3.0.0-alpha.55' },
      }),
    );

    const { context } = createContext();
    migrateToSeparatedPlugins()(tree, context);

    const pkg = JSON.parse(tree.readContent('/package.json'));
    expect(pkg.devDependencies['nitro']).toBeUndefined();
  });

  it('only matches vite.config files (vite.config.ts, .mts, .js, .mjs)', () => {
    // Looks like a legacy analog() call but isn't a vite config.
    tree.create('/src/example.ts', LEGACY_CONFIG);
    tree.create(
      '/package.json',
      JSON.stringify({
        devDependencies: { '@analogjs/platform': '^3.0.0-alpha.55' },
      }),
    );

    const { context } = createContext();
    migrateToSeparatedPlugins()(tree, context);

    const pkg = JSON.parse(tree.readContent('/package.json'));
    expect(pkg.devDependencies['nitro']).toBeUndefined();
  });

  it('detects a vite.config.mts file', () => {
    tree.create('/apps/example/vite.config.mts', LEGACY_CONFIG);
    tree.create(
      '/package.json',
      JSON.stringify({
        devDependencies: { '@analogjs/platform': '^3.0.0-alpha.55' },
      }),
    );

    const { context } = createContext();
    migrateToSeparatedPlugins()(tree, context);

    const pkg = JSON.parse(tree.readContent('/package.json'));
    expect(pkg.devDependencies['nitro']).toBe('3.0.260415-beta');
  });

  it('does not treat a config that already imports the new plugins as legacy', () => {
    // analog() still appears but both new imports are present — already migrated.
    tree.create('/vite.config.ts', SEPARATED_CONFIG);
    tree.create(
      '/package.json',
      JSON.stringify({
        devDependencies: {
          '@analogjs/platform': '^3.0.0-alpha.55',
          '@analogjs/vite-plugin-angular': '^3.0.0-alpha.55',
          nitro: '3.0.260415-beta',
        },
      }),
    );

    const { context, infoLogs } = createContext();
    migrateToSeparatedPlugins()(tree, context);

    expect(infoLogs).toEqual([]);
  });

  describe('option transform', () => {
    const PKG = JSON.stringify({
      devDependencies: { '@analogjs/platform': '^3.0.0-alpha.55' },
    });

    it('lifts `vite: {...}` into a companion angular() call', () => {
      tree.create(
        '/vite.config.ts',
        [
          `import analog from '@analogjs/platform';`,
          `import { defineConfig } from 'vite';`,
          ``,
          `export default defineConfig(() => ({`,
          `  plugins: [`,
          `    analog({`,
          `      apiPrefix: 'api',`,
          `      vite: { fastCompile: true },`,
          `    }),`,
          `  ],`,
          `}));`,
        ].join('\n'),
      );
      tree.create('/package.json', PKG);

      const { context } = createContext();
      migrateToSeparatedPlugins()(tree, context);

      const result = tree.readContent('/vite.config.ts');
      expect(result).toContain(
        `import angular from '@analogjs/vite-plugin-angular';`,
      );
      expect(result).toContain(`import { nitro } from 'nitro/vite';`);
      expect(result).toContain(`angular({ fastCompile: true })`);
      expect(result).toContain(`nitro()`);
      expect(result).not.toContain(`vite: { fastCompile: true }`);
      expect(result).toContain(`apiPrefix: 'api'`);
    });

    it('lifts `nitro: {...}` into a companion nitro() call', () => {
      tree.create(
        '/vite.config.ts',
        [
          `import analog from '@analogjs/platform';`,
          ``,
          `export default {`,
          `  plugins: [`,
          `    analog({`,
          `      apiPrefix: 'api',`,
          `      nitro: { preset: 'node-server' },`,
          `    }),`,
          `  ],`,
          `};`,
        ].join('\n'),
      );
      tree.create('/package.json', PKG);

      const { context } = createContext();
      migrateToSeparatedPlugins()(tree, context);

      const result = tree.readContent('/vite.config.ts');
      expect(result).toContain(`nitro({ preset: 'node-server' })`);
      expect(result).toContain(`angular()`);
      expect(result).not.toContain(`nitro: { preset: 'node-server' }`);
      expect(result).toContain(`apiPrefix: 'api'`);
    });

    it('lifts both `vite` and `nitro` and keeps the remaining analog options', () => {
      tree.create(
        '/vite.config.ts',
        [
          `import analog from '@analogjs/platform';`,
          ``,
          `export default {`,
          `  plugins: [`,
          `    analog({`,
          `      apiPrefix: 'api',`,
          `      ssr: true,`,
          `      vite: { fastCompile: true, liveReload: true },`,
          `      nitro: { routeRules: { '/admin/**': { ssr: false } } },`,
          `      prerender: { routes: ['/'] },`,
          `    }),`,
          `  ],`,
          `};`,
        ].join('\n'),
      );
      tree.create('/package.json', PKG);

      const { context } = createContext();
      migrateToSeparatedPlugins()(tree, context);

      const result = tree.readContent('/vite.config.ts');
      expect(result).toContain(
        `angular({ fastCompile: true, liveReload: true })`,
      );
      expect(result).toContain(
        `nitro({ routeRules: { '/admin/**': { ssr: false } } })`,
      );
      // Remaining analog options stay on analog().
      expect(result).toMatch(/analog\(\{[\s\S]*apiPrefix: 'api'/);
      expect(result).toMatch(/analog\(\{[\s\S]*ssr: true/);
      expect(result).toMatch(
        /analog\(\{[\s\S]*prerender: \{ routes: \['\/'\] \}/,
      );
      // The `vite` and `nitro` keys are gone from the analog literal.
      expect(result).not.toMatch(/vite:\s*\{/);
      // The `nitro: {` form is gone; only `nitro({` remains.
      expect(result).not.toMatch(/nitro:\s*\{/);
    });

    it('falls back to logging instructions when analog() has no argument', () => {
      tree.create(
        '/vite.config.ts',
        [
          `import analog from '@analogjs/platform';`,
          ``,
          `export default {`,
          `  plugins: [analog()],`,
          `};`,
        ].join('\n'),
      );
      tree.create('/package.json', PKG);

      const { context, infoLogs } = createContext();
      migrateToSeparatedPlugins()(tree, context);

      const result = tree.readContent('/vite.config.ts');
      // Source untouched.
      expect(result).toContain(`plugins: [analog()]`);
      // But user gets pointed at the doc.
      expect(infoLogs.join('\n')).toContain(MIGRATION_DOC_PHRASE);
    });

    it('does not rewrite when the analog() call argument is not an object literal', () => {
      tree.create(
        '/vite.config.ts',
        [
          `import analog from '@analogjs/platform';`,
          ``,
          `const opts = { apiPrefix: 'api' };`,
          `export default { plugins: [analog(opts)] };`,
        ].join('\n'),
      );
      tree.create('/package.json', PKG);

      const { context, infoLogs } = createContext();
      migrateToSeparatedPlugins()(tree, context);

      const result = tree.readContent('/vite.config.ts');
      // Source untouched because we can't safely split a variable reference.
      expect(result).toContain(`plugins: [analog(opts)]`);
      // Doc link is logged.
      expect(infoLogs.join('\n')).toContain(MIGRATION_DOC_PHRASE);
    });

    it('does not duplicate the angular/nitro imports when they are already present', () => {
      tree.create(
        '/vite.config.ts',
        [
          `import analog from '@analogjs/platform';`,
          `import angular from '@analogjs/vite-plugin-angular';`,
          ``,
          `export default {`,
          `  plugins: [`,
          `    analog({ apiPrefix: 'api', vite: { fastCompile: true } }),`,
          `    angular({ liveReload: true }),`,
          `  ],`,
          `};`,
        ].join('\n'),
      );
      tree.create('/package.json', PKG);

      const { context } = createContext();
      migrateToSeparatedPlugins()(tree, context);

      const result = tree.readContent('/vite.config.ts');
      const angularImports = result.match(
        /import angular from '@analogjs\/vite-plugin-angular';/g,
      );
      expect(angularImports?.length).toBe(1);
      // The nitro import is still added since it wasn't there.
      expect(result).toContain(`import { nitro } from 'nitro/vite';`);
    });
  });
});

const MIGRATION_DOC_PHRASE = 'migrating-v2-to-v3';

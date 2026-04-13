import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const angularPluginMock = vi.fn(() => ({ name: 'angular-mock' }));
const debugStylesMock = vi.fn();

/**
 * The preset module uses top-level imports that are hard to mock in isolation.
 * Instead, we test `resolveExperimentalZoneless` indirectly through `viteFinal`
 * by providing mock options objects that exercise each resolution tier.
 */

// Stub out heavy dependencies so the module can be imported
vi.mock('@storybook/angular/preset', () => ({
  core: async () => ({
    options: {},
    channelOptions: { wsToken: 'mock-token' },
  }),
  addons: [],
}));

vi.mock('storybook/internal/types', () => ({}));

vi.mock('@storybook/angular', () => ({}));

vi.mock('@storybook/builder-vite', () => ({}));

vi.mock('vite', () => ({
  mergeConfig: (_base: unknown, override: unknown) => override,
  normalizePath: (p: string) => p,
  rolldownVersion: undefined,
}));

vi.mock('@analogjs/vite-plugin-angular', () => ({
  default: angularPluginMock,
}));

vi.mock('./debug', () => ({
  debugStyles: debugStylesMock,
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let viteFinal: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let core: any;
const tempDirs: string[] = [];

beforeEach(async () => {
  vi.resetModules();
  angularPluginMock.mockClear();
  debugStylesMock.mockClear();
  const mod = await import('./preset');
  viteFinal = mod.viteFinal;
  core = mod.core;
});

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

/**
 * Re-registers all dependency mocks via `vi.doMock` after a `vi.resetModules()`
 * call. Required when a test needs a fresh module graph (e.g. to change the
 * `@angular/core` VERSION mock).
 */
const registerDependencyMocks = (
  viteOverrides: Record<string, unknown> = {},
) => {
  vi.doMock('@storybook/angular/preset', () => ({
    core: async () => ({
      options: {},
      channelOptions: { wsToken: 'mock-token' },
    }),
    addons: [],
  }));
  vi.doMock('storybook/internal/types', () => ({}));
  vi.doMock('@storybook/angular', () => ({}));
  vi.doMock('@storybook/builder-vite', () => ({}));
  vi.doMock('vite', () => ({
    mergeConfig: (_base: unknown, override: unknown) => override,
    normalizePath: (p: string) => p,
    rolldownVersion: undefined,
    ...viteOverrides,
  }));
  vi.doMock('@analogjs/vite-plugin-angular', () => ({
    default: angularPluginMock,
  }));
};

/**
 * Imports a fresh preset module with a specific `@angular/core` VERSION mock.
 * Returns the `viteFinal` function from the fresh module.
 */
const importWithAngularVersion = async (major: string) => {
  vi.resetModules();
  vi.doMock('@angular/core', () => ({
    VERSION: { major },
  }));
  registerDependencyMocks();
  const mod = await import('./preset');
  return mod.viteFinal;
};

describe('core', () => {
  it('should await PresetCore and include channelOptions from resolved config', async () => {
    const result = await core({}, {});

    expect(result.channelOptions?.wsToken).toBe('mock-token');
  });

  it('should override builder with @storybook/builder-vite', async () => {
    const result = await core({}, {});

    expect(result.builder).toBeDefined();
    expect(result.builder.name).toBeDefined();
  });
});

describe('viteFinal', () => {
  const createMockOptions = (overrides = {}) => ({
    configDir: '.storybook',
    presets: {
      apply: vi.fn().mockResolvedValue({ options: {} }),
    },
    angularBuilderOptions: {},
    ...overrides,
  });

  const makeOptions = (
    frameworkOptions?: Record<string, unknown>,
    angularBuilderOptions?: Record<string, unknown>,
  ) => ({
    presets: {
      apply: vi.fn().mockResolvedValue({
        options: frameworkOptions,
      }),
    },
    ...(angularBuilderOptions !== undefined && { angularBuilderOptions }),
    configDir: '/mock/.storybook',
  });

  const baseConfig = {
    plugins: [],
  };

  describe('Angular plugin options', () => {
    it('prefers hmr over liveReload and keeps liveReload as compatibility input', async () => {
      const options = makeOptions({ hmr: true, liveReload: false });

      await viteFinal(baseConfig, options);

      expect(angularPluginMock).toHaveBeenCalledWith(
        expect.objectContaining({
          hmr: true,
          liveReload: false,
        }),
      );
    });

    it('falls back to liveReload when hmr is omitted', async () => {
      const options = makeOptions({ liveReload: true });

      await viteFinal(baseConfig, options);

      expect(angularPluginMock).toHaveBeenCalledWith(
        expect.objectContaining({
          hmr: true,
          liveReload: true,
        }),
      );
    });
  });

  describe('experimentalZoneless resolution', () => {
    describe('tier 1: framework options', () => {
      it('should skip zone.js when experimentalZoneless is true', async () => {
        const options = makeOptions({ experimentalZoneless: true });
        const result = await viteFinal(baseConfig, options);

        expect(result.optimizeDeps.include).not.toContain('zone.js');
      });

      it('should include zone.js when experimentalZoneless is false', async () => {
        const options = makeOptions({ experimentalZoneless: false });
        const result = await viteFinal(baseConfig, options);

        expect(result.optimizeDeps.include).toContain('zone.js');
      });

      it('should take priority over angularBuilderOptions (framework true, builder false)', async () => {
        const options = makeOptions(
          { experimentalZoneless: true },
          { experimentalZoneless: false },
        );
        const result = await viteFinal(baseConfig, options);

        expect(result.optimizeDeps.include).not.toContain('zone.js');
      });

      it('should take priority over angularBuilderOptions (framework false, builder true)', async () => {
        const options = makeOptions(
          { experimentalZoneless: false },
          { experimentalZoneless: true },
        );
        const result = await viteFinal(baseConfig, options);

        expect(result.optimizeDeps.include).toContain('zone.js');
      });
    });

    describe('tier 2: angularBuilderOptions', () => {
      it('should skip zone.js when experimentalZoneless is true', async () => {
        const options = makeOptions({}, { experimentalZoneless: true });
        const result = await viteFinal(baseConfig, options);

        expect(result.optimizeDeps.include).not.toContain('zone.js');
      });

      it('should include zone.js when experimentalZoneless is false', async () => {
        const options = makeOptions({}, { experimentalZoneless: false });
        const result = await viteFinal(baseConfig, options);

        expect(result.optimizeDeps.include).toContain('zone.js');
      });
    });

    describe('tier 3: auto-detect Angular version', () => {
      it('should include zone.js when Angular < 21', async () => {
        const freshViteFinal = await importWithAngularVersion('19');
        const options = makeOptions({}, {});
        const result = await freshViteFinal(baseConfig, options);

        expect(result.optimizeDeps.include).toContain('zone.js');
      });

      it('should skip zone.js when Angular >= 21', async () => {
        const freshViteFinal = await importWithAngularVersion('21');
        const options = makeOptions({}, {});
        const result = await freshViteFinal(baseConfig, options);

        expect(result.optimizeDeps.include).not.toContain('zone.js');
      });

      it('should include zone.js when @angular/core import fails', async () => {
        vi.resetModules();
        vi.doMock('@angular/core', () => {
          throw new Error('Module not found');
        });
        registerDependencyMocks();
        const mod = await import('./preset');

        const options = makeOptions({}, {});
        const result = await mod.viteFinal(baseConfig, options);

        expect(result.optimizeDeps.include).toContain('zone.js');
      });
    });

    describe('STORYBOOK_ANGULAR_OPTIONS define', () => {
      it('should set experimentalZoneless to true when zoneless', async () => {
        const options = makeOptions({ experimentalZoneless: true });
        const result = await viteFinal(baseConfig, options);
        const parsed = JSON.parse(result.define.STORYBOOK_ANGULAR_OPTIONS);

        expect(parsed.experimentalZoneless).toBe(true);
      });

      it('should set experimentalZoneless to false when not zoneless', async () => {
        const options = makeOptions({ experimentalZoneless: false });
        const result = await viteFinal(baseConfig, options);
        const parsed = JSON.parse(result.define.STORYBOOK_ANGULAR_OPTIONS);

        expect(parsed.experimentalZoneless).toBe(false);
      });
    });

    describe('edge cases', () => {
      it('should not throw when framework.options is undefined', async () => {
        const options = makeOptions(undefined);
        const result = await viteFinal(baseConfig, options);

        expect(result.optimizeDeps.include).toContain('zone.js');
      });

      it('should not throw when angularBuilderOptions is absent', async () => {
        const options = makeOptions({});
        const result = await viteFinal(baseConfig, options);

        expect(result.optimizeDeps.include).toContain('zone.js');
      });

      it('should ignore non-boolean truthy values and fall through to auto-detect', async () => {
        const freshViteFinal = await importWithAngularVersion('19');
        // @ts-expect-error testing non-boolean values
        const options = makeOptions({ experimentalZoneless: 1 });
        const result = await freshViteFinal(baseConfig, options);

        // Non-boolean skips tiers 1 & 2, auto-detect Angular 19 → zone.js included
        expect(result.optimizeDeps.include).toContain('zone.js');
      });
    });
  });

  describe('when angularBuilderContext is undefined', () => {
    it('should not crash during plugin initialization', async () => {
      const config = { plugins: [] };
      const options = createMockOptions({
        // angularBuilderContext is intentionally undefined
      });

      await expect(viteFinal(config, options)).resolves.not.toThrow();
    });

    it('should return a valid vite config', async () => {
      const config = { plugins: [] };
      const options = createMockOptions();

      const result = await viteFinal(config, options);

      expect(result).toBeDefined();
      expect(result.plugins).toBeDefined();
      expect(Array.isArray(result.plugins)).toBe(true);
    });

    it('should include the angular options plugin', async () => {
      const config = { plugins: [] };
      const options = createMockOptions();

      const result = await viteFinal(config, options);

      const angularOptionsPlugin = result.plugins
        .flat()
        .find((p) => p?.name === 'analogjs-storybook-options-plugin');
      expect(angularOptionsPlugin).toBeDefined();
    });

    it('should handle stylePreprocessorOptions.loadPaths without angularBuilderContext', async () => {
      const config = { plugins: [] };
      const options = createMockOptions({
        angularBuilderOptions: {
          stylePreprocessorOptions: {
            loadPaths: ['src/styles'],
          },
        },
        // angularBuilderContext is intentionally undefined
      });

      // Should not crash when processing loadPaths
      await expect(viteFinal(config, options)).resolves.not.toThrow();
    });
  });

  describe('when angularBuilderContext is available', () => {
    it('should use angularBuilderContext.workspaceRoot for loadPaths', async () => {
      const config = { plugins: [] };
      const options = createMockOptions({
        angularBuilderOptions: {
          stylePreprocessorOptions: {
            loadPaths: ['src/styles'],
          },
        },
        angularBuilderContext: {
          workspaceRoot: '/workspace/root',
        },
      });

      const result = await viteFinal(config, options);

      const angularOptionsPlugin = result.plugins
        .flat()
        .find((p) => p?.name === 'analogjs-storybook-options-plugin');

      // Call the config hook to get the scss config
      const pluginConfig = angularOptionsPlugin?.config?.({
        root: '/vite/root',
      });

      expect(
        pluginConfig?.css?.preprocessorOptions?.scss?.loadPaths?.[0],
      ).toContain('/workspace/root');
      expect(debugStylesMock).toHaveBeenCalledWith(
        'resolved SCSS load paths',
        expect.objectContaining({
          workspaceRoot: '/workspace/root',
          loadPaths: ['src/styles'],
          resolvedLoadPaths: [expect.stringContaining('/workspace/root')],
        }),
      );
    });

    it('imports workspace-relative global styles from the workspace root', async () => {
      const workspaceRoot = mkdtempSync(join(tmpdir(), 'analog-storybook-'));
      tempDirs.push(workspaceRoot);

      mkdirSync(join(workspaceRoot, 'libs/shared/ui/styles'), {
        recursive: true,
      });
      mkdirSync(join(workspaceRoot, 'libs/shared/ui/.storybook'), {
        recursive: true,
      });
      writeFileSync(
        join(workspaceRoot, 'libs/shared/ui/styles/shared-ui.scss'),
        '$color: red;',
      );
      writeFileSync(
        join(workspaceRoot, 'libs/shared/ui/.storybook/storybook.scss'),
        '@use "shared-ui";',
      );

      const config = { plugins: [] };
      const options = createMockOptions({
        configDir: join(workspaceRoot, 'libs/shared/ui/.storybook'),
        angularBuilderOptions: {
          styles: [
            'libs/shared/ui/styles/shared-ui.scss',
            'libs/shared/ui/.storybook/storybook.scss',
          ],
        },
        angularBuilderContext: {
          workspaceRoot,
        },
      });

      const result = await viteFinal(config, options);
      const angularOptionsPlugin = result.plugins
        .flat()
        .find((p) => p?.name === 'analogjs-storybook-options-plugin');

      angularOptionsPlugin?.config?.({
        root: join(workspaceRoot, 'libs/shared/ui'),
      });

      const transformed = await angularOptionsPlugin?.transform?.(
        'export default {};',
        `${options.configDir}/preview.ts`,
      );

      expect(transformed?.code).toContain(
        `import '${join(workspaceRoot, 'libs/shared/ui/styles/shared-ui.scss')}';`,
      );
      expect(transformed?.code).toContain(
        `import '${join(workspaceRoot, 'libs/shared/ui/.storybook/storybook.scss')}';`,
      );
      expect(debugStylesMock).toHaveBeenCalledWith(
        'injecting Storybook global styles',
        expect.objectContaining({
          styles: [
            'libs/shared/ui/styles/shared-ui.scss',
            'libs/shared/ui/.storybook/storybook.scss',
          ],
        }),
      );
      expect(debugStylesMock).toHaveBeenCalledWith(
        'resolved Storybook style import',
        expect.objectContaining({
          input: 'libs/shared/ui/styles/shared-ui.scss',
          source: 'workspace',
          specifier: join(
            workspaceRoot,
            'libs/shared/ui/styles/shared-ui.scss',
          ),
        }),
      );
    });

    it('keeps bare package CSS imports as bare imports', async () => {
      const workspaceRoot = mkdtempSync(join(tmpdir(), 'analog-storybook-'));
      tempDirs.push(workspaceRoot);

      const config = { plugins: [] };
      const options = createMockOptions({
        configDir: join(workspaceRoot, '.storybook'),
        angularBuilderOptions: {
          styles: [
            '@angular/material/prebuilt-themes/deeppurple-amber.css',
            'katex/dist/katex.css',
            'flag-icons/css/flag-icons.min.css',
          ],
        },
        angularBuilderContext: {
          workspaceRoot,
        },
      });

      const result = await viteFinal(config, options);
      const angularOptionsPlugin = result.plugins
        .flat()
        .find((p) => p?.name === 'analogjs-storybook-options-plugin');

      angularOptionsPlugin?.config?.({
        root: join(workspaceRoot, 'libs/shared/ui'),
      });

      const transformed = await angularOptionsPlugin?.transform?.(
        'export default {};',
        `${options.configDir}/preview.ts`,
      );

      expect(transformed?.code).toContain(
        "import '@angular/material/prebuilt-themes/deeppurple-amber.css';",
      );
      expect(transformed?.code).toContain("import 'katex/dist/katex.css';");
      expect(transformed?.code).toContain(
        "import 'flag-icons/css/flag-icons.min.css';",
      );
      expect(debugStylesMock).toHaveBeenCalledWith(
        'resolved Storybook style import',
        expect.objectContaining({
          input: '@angular/material/prebuilt-themes/deeppurple-amber.css',
          source: 'bare',
          specifier: '@angular/material/prebuilt-themes/deeppurple-amber.css',
        }),
      );
    });
  });

  describe('storybookTransformConfigPlugin', () => {
    it('should include the transform config plugin', async () => {
      const options = createMockOptions();
      const result = await viteFinal(baseConfig, options);

      const transformPlugin = result.plugins
        .flat()
        .find((p) => p?.name === 'analogjs-storybook-transform-config');
      expect(transformPlugin).toBeDefined();
    });

    it('should use esbuild config key with keepNames on Vite 6-7', async () => {
      const options = createMockOptions();
      const result = await viteFinal(baseConfig, options);

      const transformPlugin = result.plugins
        .flat()
        .find((p) => p?.name === 'analogjs-storybook-transform-config');
      const pluginConfig = transformPlugin.config();

      expect(pluginConfig).toHaveProperty('esbuild');
      expect(pluginConfig).not.toHaveProperty('oxc');
      expect(pluginConfig.esbuild.keepNames).toBe(true);
    });

    it('should use oxc config key with keepNames on Vite 8+ (Rolldown)', async () => {
      vi.resetModules();
      registerDependencyMocks({ rolldownVersion: '1.0.0' });
      const mod = await import('./preset');
      const freshViteFinal = mod.viteFinal;

      const options = createMockOptions();
      const result = await freshViteFinal(baseConfig, options);

      const transformPlugin = result.plugins
        .flat()
        .find((p) => p?.name === 'analogjs-storybook-transform-config');
      const pluginConfig = transformPlugin.config();

      expect(pluginConfig).toHaveProperty('oxc');
      expect(pluginConfig).not.toHaveProperty('esbuild');
      expect(pluginConfig.oxc.keepNames).toBe(true);
    });

    it('should only apply during build', async () => {
      const options = createMockOptions();
      const result = await viteFinal(baseConfig, options);

      const transformPlugin = result.plugins
        .flat()
        .find((p) => p?.name === 'analogjs-storybook-transform-config');

      expect(transformPlugin.apply).toBe('build');
    });
  });
});

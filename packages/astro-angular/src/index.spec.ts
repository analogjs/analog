import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { Plugin } from 'vite';

import astroPlugin from './index';

vi.mock('@analogjs/vite-plugin-angular', () => ({
  default: () => ({ name: 'angular-mock' }),
}));

vi.mock('@angular/core', () => ({
  enableProdMode: vi.fn(),
}));

vi.mock('vite', () => ({
  rolldownVersion: undefined,
}));

function registerMocks(rolldownVersion?: string) {
  vi.doMock('@analogjs/vite-plugin-angular', () => ({
    default: () => ({ name: 'angular-mock' }),
  }));
  vi.doMock('@angular/core', () => ({
    enableProdMode: vi.fn(),
  }));
  vi.doMock('vite', () => ({
    rolldownVersion,
  }));
}

function getVitePlugins(): Plugin[] {
  const integration = astroPlugin();
  let plugins: Plugin[] = [];

  const setup = integration.hooks['astro:config:setup'] as (args: {
    addRenderer: () => void;
    addMiddleware: () => void;
    updateConfig: (cfg: { vite: { plugins?: Plugin[] } }) => void;
  }) => void;

  setup({
    addRenderer: () => undefined,
    addMiddleware: () => undefined,
    updateConfig: (cfg) => {
      plugins = cfg.vite.plugins ?? [];
    },
  });

  return plugins;
}

describe('astro-angular plugin', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('should return astro configurations', async () => {
    registerMocks();
    const mod = await import('./index');

    expect(mod.default().name).toEqual('@analogjs/astro-angular');
    expect(mod.default().hooks).toStrictEqual({
      'astro:config:setup': expect.anything(),
      'astro:config:done': expect.anything(),
    });
  });

  describe('vite configuration', () => {
    it('should use esbuild config key when rolldownVersion is not available', async () => {
      registerMocks();
      const mod = await import('./index');
      const plugin = mod.default();

      let viteConfig: any;
      const mockSetup = {
        addRenderer: vi.fn(),
        addMiddleware: vi.fn(),
        updateConfig: vi.fn(function (config: any) {
          viteConfig = config.vite;
        }),
      };

      plugin.hooks['astro:config:setup'](mockSetup);

      expect(viteConfig).toHaveProperty('esbuild');
      expect(viteConfig).not.toHaveProperty('oxc');
      expect(viteConfig.esbuild.jsxDev).toBe(true);
    });

    it('should use oxc config key when rolldownVersion is available', async () => {
      registerMocks('1.0.0');
      const mod = await import('./index');
      const plugin = mod.default();

      let viteConfig: any;
      const mockSetup = {
        addRenderer: vi.fn(),
        addMiddleware: vi.fn(),
        updateConfig: vi.fn(function (config: any) {
          viteConfig = config.vite;
        }),
      };

      plugin.hooks['astro:config:setup'](mockSetup);

      expect(viteConfig).toHaveProperty('oxc');
      expect(viteConfig).not.toHaveProperty('esbuild');
      expect(viteConfig.oxc.jsx).toEqual({ development: true });
    });
  });

  describe('hydration and style placement defaults', () => {
    function setup(options?: Parameters<typeof astroPlugin>[0]) {
      const addRenderer = vi.fn();
      const addMiddleware = vi.fn();
      let include: string[] = [];
      astroPlugin(options).hooks['astro:config:setup']!({
        addRenderer,
        addMiddleware,
        updateConfig: (cfg: any) => {
          include = cfg.vite.optimizeDeps.include;
        },
      } as any);
      return { renderer: addRenderer.mock.calls[0][0], addMiddleware, include };
    }

    it('uses Angular hydration and strict style placement by default', () => {
      const { renderer, addMiddleware, include } = setup();

      expect(renderer.clientEntrypoint).toBe(
        '@analogjs/astro-angular/client-ngh.js',
      );
      expect(renderer.serverEntrypoint).toBe(
        '@analogjs/astro-angular/server-ngh.js',
      );
      expect(include).toContain('@analogjs/astro-angular/client-ngh.js');
      expect(addMiddleware).toHaveBeenCalledWith({
        order: 'pre',
        entrypoint: '@analogjs/astro-angular/middleware',
      });
    });

    it('opts out when both options are false', () => {
      const { renderer, addMiddleware, include } = setup({
        useAngularHydration: false,
        strictStylePlacement: false,
      });

      expect(renderer.clientEntrypoint).toBe(
        '@analogjs/astro-angular/client.js',
      );
      expect(renderer.serverEntrypoint).toBe(
        '@analogjs/astro-angular/server.js',
      );
      expect(include).toContain('@analogjs/astro-angular/client.js');
      expect(addMiddleware).not.toHaveBeenCalled();
    });
  });

  describe('transformFilter option', () => {
    function getPlugins(options?: Parameters<typeof astroPlugin>[0]) {
      let plugins: any[] = [];
      astroPlugin(options).hooks['astro:config:setup']!({
        addRenderer: vi.fn(),
        addMiddleware: vi.fn(),
        updateConfig: (cfg: any) => {
          plugins = cfg.vite.plugins;
        },
      } as any);
      return plugins;
    }

    it('registers the filter with Angular through analog.setup', () => {
      const transformFilter = vi.fn(() => true);
      const plugin = getPlugins({ transformFilter }).find(
        (p) => p.name === '@analogjs/astro-angular-transform-filter',
      );
      const registerTransformFilter = vi.fn();

      plugin.analog.setup({ registerTransformFilter });

      expect(registerTransformFilter).toHaveBeenCalledWith(transformFilter);
    });

    it('adds no plugin when the option is omitted', () => {
      expect(
        getPlugins().some(
          (p) => p.name === '@analogjs/astro-angular-transform-filter',
        ),
      ).toBe(false);
    });
  });

  describe('analogjs-astro-server-optimize-deps plugin', () => {
    function getPlugin() {
      return getVitePlugins().find(
        (p) => (p as Plugin).name === 'analogjs-astro-server-optimize-deps',
      ) as Plugin & {
        configEnvironment: (
          name: string,
        ) => { optimizeDeps: { exclude: string[] } } | undefined;
      };
    }

    // Regression for analogjs/analog#2438: top-level `optimizeDeps` only seeds
    // the client environment, so adapters that run SSR in their own
    // environment (`@astrojs/cloudflare` on `workerd`) pre-bundled Angular's
    // server entrypoints and the renderer failed.
    it('should exclude the server entrypoints for server environments', () => {
      const exclude =
        getPlugin().configEnvironment('ssr')?.optimizeDeps.exclude;

      expect(exclude).toEqual([
        '@angular/platform-server',
        '@analogjs/astro-angular/server.js',
        '@analogjs/astro-angular/server-ngh.js',
        '@angular/core',
      ]);
    });

    // Pre-bundling `@angular/core` on the server yields a second Angular
    // runtime, so components render against a different runtime than the one
    // they registered in — empty SSR output plus NG0912 ID collisions.
    it('should exclude @angular/core on the server but keep it optimized on the client', () => {
      expect(
        getPlugin().configEnvironment('ssr')?.optimizeDeps.exclude,
      ).toContain('@angular/core');
      expect(getPlugin().configEnvironment('client')).toBeUndefined();
    });
  });
});

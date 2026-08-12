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
    updateConfig: (cfg: { vite: { plugins?: Plugin[] } }) => void;
  }) => void;

  setup({
    addRenderer: () => undefined,
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

import type { Plugin } from 'vite';
import astroPlugin from './index';

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

describe('angularVitePlugin', () => {
  it('should return astro configurations', () => {
    expect(astroPlugin().name).toEqual('@analogjs/astro-angular');
    expect(astroPlugin().hooks).toStrictEqual({
      'astro:config:setup': expect.anything(),
      'astro:config:done': expect.anything(),
    });
  });

  describe('analogjs-astro-client-ngservermode plugin', () => {
    it('should set ngServerMode to false for the client environment', () => {
      const plugins = getVitePlugins();
      const plugin = plugins.find(
        (p) => (p as Plugin).name === 'analogjs-astro-client-ngservermode',
      ) as Plugin & {
        configEnvironment: (
          name: string,
        ) => Record<string, unknown> | undefined;
      };

      expect(plugin).toBeDefined();

      const result = plugin.configEnvironment('client');

      expect(result).toEqual({
        define: { ngServerMode: 'false' },
      });
    });

    it('should return undefined for non-client environments', () => {
      const plugins = getVitePlugins();
      const plugin = plugins.find(
        (p) => (p as Plugin).name === 'analogjs-astro-client-ngservermode',
      ) as Plugin & {
        configEnvironment: (
          name: string,
        ) => Record<string, unknown> | undefined;
      };

      expect(plugin.configEnvironment('server')).toBeUndefined();
      expect(plugin.configEnvironment('ssr')).toBeUndefined();
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

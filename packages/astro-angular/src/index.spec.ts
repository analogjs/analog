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
    addRenderer: () => {},
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
      ) as Plugin & { configEnvironment: Function };

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
      ) as Plugin & { configEnvironment: Function };

      expect(plugin.configEnvironment('server')).toBeUndefined();
      expect(plugin.configEnvironment('ssr')).toBeUndefined();
    });
  });
});

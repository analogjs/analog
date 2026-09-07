import { describe, expect, it, vi } from 'vitest';
import type { Plugin } from 'vite';
import { hook, required } from '../testing/required.test-support.js';
import { restartablePlugins } from './restartable-plugins.js';

describe('overlapping Vite server lifetimes', () => {
  it('keeps old close hooks separate from the replacement configuration', async () => {
    const generations: Plugin[] = [];
    const plugins = restartablePlugins(() => {
      const plugin: Plugin = {
        name: 'compiler',
        configResolved: vi.fn(() => undefined),
        configureServer: vi.fn(() => undefined),
        closeBundle: vi.fn(() => undefined),
      };
      generations.push(plugin);
      return [plugin];
    });
    const configure = async () => {
      for (const plugin of plugins)
        if (plugin.config)
          await Reflect.apply(hook(plugin.config), {}, [
            {},
            { command: 'serve' },
          ]);
      const proxy = required(plugins[1]);
      await Reflect.apply(hook(proxy.configResolved), {}, [{}]);
      await Reflect.apply(hook(proxy.configureServer), {}, [{}]);
      return Reflect.apply(hook(proxy.applyToEnvironment), proxy, [
        { name: 'client' },
      ]);
    };
    const old = await configure();
    const replacement = await configure();
    await Reflect.apply(hook(old.closeBundle), {}, []);
    expect(old).toBe(generations[0]);
    expect(replacement).toBe(generations[1]);
    expect(old.closeBundle).toHaveBeenCalledOnce();
    expect(replacement.closeBundle).not.toHaveBeenCalled();
    expect(replacement.configureServer).toHaveBeenCalledOnce();
  });
});

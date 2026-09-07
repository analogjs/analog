import { describe, expect, it, vi } from 'vitest';
import type { Plugin } from 'vite';
import { isolateCompilerEnvironments } from './compiler-environments.js';
import { hook } from '../testing/required.test-support.js';

describe('compiler environment selection', () => {
  it('keeps the dependency scanner away from the live client compiler', async () => {
    const create = vi.fn();
    const plugin = isolateCompilerEnvironments({ name: 'compiler' }, create);
    await expect(
      Reflect.apply(hook(plugin.applyToEnvironment), plugin, [
        { name: 'client', mode: 'scan' },
      ]),
    ).resolves.toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it('shares in-flight child initialization only for the exact environment', async () => {
    const initialized = Promise.withResolvers<void>();
    const create = vi.fn(
      (): Plugin => ({
        name: 'compiler',
        configResolved: () => initialized.promise,
      }),
    );
    const plugin = isolateCompilerEnvironments({ name: 'compiler' }, create);
    Reflect.apply(hook(plugin.config), {}, [
      {},
      { command: 'build', mode: 'production' },
    ]);
    await Reflect.apply(hook(plugin.configResolved), {}, [
      { build: { ssr: false } },
    ]);
    const environment = { name: 'ssr', config: { build: { ssr: true } } };
    const select = () =>
      Reflect.apply(hook(plugin.applyToEnvironment), plugin, [environment]);
    const first = select();
    const second = select();
    initialized.resolve();
    expect(await first).toBe(await second);
    expect(create).toHaveBeenCalledTimes(1);
  });
});

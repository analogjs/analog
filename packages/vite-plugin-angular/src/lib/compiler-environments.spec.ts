import { describe, expect, it, vi } from 'vitest';
import type { Plugin } from 'vite';
import { isolateCompilerEnvironments } from './compiler-environments.js';
import { hook } from '../testing/required.test-support.js';

describe('compiler environment selection', () => {
  it('binds new child compilers to the restarted server rather than its closed predecessor', async () => {
    const configureServer = vi.fn();
    const create = (): Plugin => ({ name: 'compiler', configureServer });
    const plugin = isolateCompilerEnvironments<Plugin>(
      { name: 'compiler' },
      create,
    );
    const configure = async () => {
      Reflect.apply(hook(plugin.config), {}, [
        {},
        { command: 'serve', mode: 'development' },
      ]);
      await Reflect.apply(hook(plugin.configResolved), {}, [
        { build: { ssr: false } },
      ]);
    };
    await configure();
    await Reflect.apply(hook(plugin.configureServer), {}, [
      { name: 'old-server' },
    ]);
    await configure();
    await Reflect.apply(hook(plugin.applyToEnvironment), plugin, [
      { name: 'ssr', config: { build: {} } },
    ]);
    expect(configureServer).not.toHaveBeenCalled();
    const next = { name: 'new-server' };
    await Reflect.apply(hook(plugin.configureServer), {}, [next]);
    expect(configureServer).toHaveBeenCalledExactlyOnceWith(next);
  });

  it('invalidates cached SSR modules before waiting for resource compilation', async () => {
    const release = Promise.withResolvers<void>();
    const invalidate = vi.fn(() => release.promise);
    const plugin = isolateCompilerEnvironments(
      { name: 'compiler' },
      () => ({ name: 'compiler' }),
      invalidate,
    );
    Reflect.apply(hook(plugin.config), {}, [
      {},
      { command: 'serve', mode: 'development' },
    ]);
    await Reflect.apply(hook(plugin.configResolved), {}, [
      { build: { ssr: false } },
    ]);
    const selected = await Reflect.apply(
      hook(plugin.applyToEnvironment),
      plugin,
      [{ name: 'ssr', config: { build: { ssr: false } } }],
    );
    const invalidateAll = vi.fn();
    const updating = Reflect.apply(
      hook(selected.hotUpdate),
      { environment: { moduleGraph: { invalidateAll } } },
      [{ file: '/src/view.html' }],
    );
    expect(invalidate).toHaveBeenCalled();
    expect(invalidateAll).toHaveBeenCalledTimes(1);
    release.resolve();
    await updating;
  });

  it('invalidates known resource owners without clearing unrelated server modules', async () => {
    const defer = vi.fn();
    const plugin = isolateCompilerEnvironments(
      { name: 'compiler' },
      () => ({ name: 'compiler' }),
      defer,
      () => ['/src/a.ts', '/src/b.ts'],
    );
    Reflect.apply(hook(plugin.config), {}, [
      {},
      { command: 'serve', mode: 'development' },
    ]);
    await Reflect.apply(hook(plugin.configResolved), {}, [
      { build: { ssr: false } },
    ]);
    const selected = await Reflect.apply(
      hook(plugin.applyToEnvironment),
      plugin,
      [{ name: 'ssr', config: { build: {} } }],
    );
    const modules = new Map([
      ['/src/a.ts', { id: '/src/a.ts' }],
      ['/src/b.ts', { id: '/src/b.ts' }],
    ]);
    const graph = {
      getModuleById: (id: string) => modules.get(id),
      invalidateModule: vi.fn(),
      invalidateAll: vi.fn(),
    };
    await Reflect.apply(
      hook(selected.hotUpdate),
      { environment: { moduleGraph: graph } },
      [{ file: '/src/shared.html', timestamp: 42 }],
    );
    expect(defer).toHaveBeenCalledExactlyOnceWith(expect.anything(), [
      '/src/shared.html',
    ]);
    expect(graph.invalidateAll).not.toHaveBeenCalled();
    expect(graph.invalidateModule).toHaveBeenCalledTimes(2);
    expect(graph.invalidateModule).toHaveBeenCalledWith(
      modules.get('/src/a.ts'),
      expect.any(Set),
      42,
      true,
    );
  });

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

  it('publishes source/resource dirtiness before Vite reaches the server hot-update hook', async () => {
    const defer = vi.fn();
    let change: ((file: string) => void) | undefined;
    const plugin = isolateCompilerEnvironments(
      { name: 'compiler' },
      () => ({ name: 'compiler' }),
      defer,
      () => ['/src/app.ts'],
      (_child, _server, listener) => {
        change = listener;
      },
    );
    Reflect.apply(hook(plugin.config), {}, [
      {},
      { command: 'serve', mode: 'development' },
    ]);
    await Reflect.apply(hook(plugin.configResolved), {}, [{ build: {} }]);
    const module = { id: '/src/app.ts' };
    const graph = {
      onFileChange: vi.fn(),
      getModuleById: () => module,
      invalidateModule: vi.fn(),
      invalidateAll: vi.fn(),
    };
    const environment = {
      name: 'ssr',
      config: { build: {} },
      moduleGraph: graph,
    };
    const child = await Reflect.apply(hook(plugin.applyToEnvironment), plugin, [
      environment,
    ]);
    await Reflect.apply(hook(plugin.configureServer), {}, [
      { environments: { ssr: environment } },
    ]);
    change!('/src/view.css');
    expect(defer).toHaveBeenCalledTimes(1);
    expect(graph.invalidateModule).toHaveBeenCalledTimes(1);
    await Reflect.apply(hook(child.hotUpdate), { environment }, [
      { file: '/src/view.css' },
    ]);
    expect(defer).toHaveBeenCalledTimes(1);
    expect(graph.invalidateAll).not.toHaveBeenCalled();
    change!('/src/app.ts');
    expect(graph.onFileChange).toHaveBeenCalledExactlyOnceWith('/src/app.ts');
    expect(defer).toHaveBeenLastCalledWith(expect.anything(), ['/src/app.ts']);
    await Reflect.apply(hook(child.hotUpdate), { environment }, [
      { file: '/src/app.ts' },
    ]);
    expect(defer).toHaveBeenCalledTimes(2);
    change!('/src/cache.tsbuildinfo');
    expect(defer).toHaveBeenCalledTimes(2);
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

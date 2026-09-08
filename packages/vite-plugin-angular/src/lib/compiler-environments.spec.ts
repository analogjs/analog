import { describe, expect, it, vi } from 'vitest';
import { createServer, type Plugin } from 'vite';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
      getModulesByFile: (id: string) => {
        const module = modules.get(id);
        return module ? new Set([module]) : undefined;
      },
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
    );
  });

  it.each([
    { loaded: ['/src/a.ts'], owners: ['/src/a.ts', '/src/lazy.ts'] },
    { loaded: [], owners: ['/src/lazy.ts'] },
    { loaded: ['/src/a.ts?one', '/src/a.ts?two'], owners: ['/src/a.ts'] },
    { loaded: ['/src/a.ts', '/src/a.ts?one'], owners: ['/src/a.ts'] },
  ])(
    'invalidates all loaded variants without penalizing lazy owners: $loaded',
    async ({ loaded, owners }) => {
      const invalidate = vi.fn();
      const plugin = isolateCompilerEnvironments(
        { name: 'compiler' },
        () => ({ name: 'compiler' }),
        invalidate,
        () => owners,
      );
      Reflect.apply(hook(plugin.config), {}, [
        {},
        { command: 'serve', mode: 'development' },
      ]);
      await Reflect.apply(hook(plugin.configResolved), {}, [{ build: {} }]);
      const selected = await Reflect.apply(
        hook(plugin.applyToEnvironment),
        plugin,
        [{ name: 'ssr', config: { build: {} } }],
      );
      const modules = loaded.map((id) => ({ id }));
      const graph = {
        getModuleById: (id: string) =>
          modules.find((module) => module.id === id),
        getModulesByFile: (file: string) =>
          new Set(modules.filter((module) => module.id.split('?')[0] === file)),
        invalidateModule: vi.fn(),
        invalidateAll: vi.fn(),
      };
      await Reflect.apply(
        hook(selected.hotUpdate),
        { environment: { moduleGraph: graph } },
        [{ file: '/src/shared.html', timestamp: 42 }],
      );
      expect(invalidate).toHaveBeenCalledExactlyOnceWith(expect.anything(), [
        '/src/shared.html',
      ]);
      expect(graph.invalidateAll).not.toHaveBeenCalled();
      expect(
        graph.invalidateModule.mock.calls.map(([module]) => module),
      ).toEqual(modules);
    },
  );

  it('does not reuse an in-flight Vite transform after an admitted resource invalidation', async () => {
    const started = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    let revision = 1;
    let hold = true;
    const server = await createServer({
      configFile: false,
      logLevel: 'silent',
      server: { middlewareMode: true, watch: null },
      optimizeDeps: { noDiscovery: true },
      plugins: [
        {
          name: 'controlled-source',
          resolveId(id) {
            if (id === '/owner.ts') return id;
            return null;
          },
          load(id) {
            if (id === '/owner.ts')
              return `export const revision = ${revision};`;
            return null;
          },
          async transform(_code, id) {
            if (id === '/owner.ts' && hold) {
              hold = false;
              started.resolve();
              await release.promise;
            }
          },
        },
      ],
    });
    try {
      const plugin = isolateCompilerEnvironments(
        { name: 'compiler' },
        () => ({ name: 'compiler' }),
        () => {
          revision++;
        },
        () => ['/owner.ts'],
      );
      Reflect.apply(hook(plugin.config), {}, [
        {},
        { command: 'serve', mode: 'development' },
      ]);
      await Reflect.apply(hook(plugin.configResolved), {}, [{ build: {} }]);
      const selected = await Reflect.apply(
        hook(plugin.applyToEnvironment),
        plugin,
        [{ name: 'ssr', config: { build: {} } }],
      );
      const environment = server.environments['ssr']!;
      const old = environment.transformRequest('/owner.ts');
      await started.promise;
      await Reflect.apply(hook(selected.hotUpdate), { environment }, [
        { file: '/view.html', timestamp: Date.now() },
      ]);
      const fresh = environment.transformRequest('/owner.ts');
      expect((await fresh)?.code).toContain('revision = 2');
      release.resolve();
      await old;
      expect((await environment.transformRequest('/owner.ts'))?.code).toContain(
        'revision = 2',
      );
    } finally {
      release.resolve();
      await server.close();
    }
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
      getModulesByFile: () => new Set([module]),
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
    expect(defer).toHaveBeenLastCalledWith(
      expect.anything(),
      ['/src/view.css'],
      expect.any(Function),
    );
    expect(graph.invalidateModule).toHaveBeenCalledTimes(1);
    await Reflect.apply(hook(child.hotUpdate), { environment }, [
      { file: '/src/view.css' },
    ]);
    expect(defer).toHaveBeenCalledTimes(1);
    expect(graph.invalidateAll).not.toHaveBeenCalled();
    change!('/src/app.ts');
    expect(graph.onFileChange).toHaveBeenCalledExactlyOnceWith('/src/app.ts');
    expect(defer).toHaveBeenLastCalledWith(
      expect.anything(),
      ['/src/app.ts'],
      expect.any(Function),
    );
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

  it.each(['view.css', 'view.ts'])(
    'settles a truncated %s write and bounds genuinely empty content',
    async (name) => {
      const directory = await mkdtemp(join(tmpdir(), 'analog-resource-'));
      const file = join(directory, name);
      let change: ((file: string) => void) | undefined;
      let beforeCompile: ((signal: AbortSignal) => Promise<void>) | undefined;
      const plugin = isolateCompilerEnvironments(
        { name: 'compiler' },
        () => ({ name: 'compiler' }),
        (_child, _files, barrier) => {
          beforeCompile = barrier;
        },
        () => [],
        (_child, _server, listener) => {
          change = listener;
        },
      );
      const graph = {
        getModulesByFile: () => undefined,
        invalidateAll: vi.fn(),
        onFileChange: vi.fn(),
      };
      const environment = {
        name: 'ssr',
        config: { build: {} },
        moduleGraph: graph,
      };
      try {
        await writeFile(file, '');
        Reflect.apply(hook(plugin.config), {}, [
          {},
          { command: 'serve', mode: 'development' },
        ]);
        await Reflect.apply(hook(plugin.configResolved), {}, [{ build: {} }]);
        await Reflect.apply(hook(plugin.applyToEnvironment), plugin, [
          environment,
        ]);
        await Reflect.apply(hook(plugin.configureServer), {}, [
          { environments: { ssr: environment } },
        ]);
        change!(file);
        expect(beforeCompile).toEqual(expect.any(Function));
        const controller = new AbortController();
        const delayed = beforeCompile!(controller.signal);
        await new Promise((resolve) => setTimeout(resolve, 30));
        await writeFile(file, 'body { color: red; }');
        await delayed;

        await writeFile(file, '');
        change!(file);
        const emptyStarted = Date.now();
        await beforeCompile!(controller.signal);
        expect(Date.now() - emptyStarted).toBeGreaterThanOrEqual(90);

        await writeFile(file, 'body { color: blue; }');
        change!(file);
        const populatedStarted = Date.now();
        await beforeCompile!(controller.signal);
        expect(Date.now() - populatedStarted).toBeLessThan(50);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
});

describe('SSR warmup eligibility', () => {
  it.each([
    { command: 'serve', hmr: true, warming: true, expected: true },
    { command: 'serve', hmr: false, warming: true, expected: false },
    { command: 'build', hmr: true, warming: true, expected: false },
    { command: 'serve', hmr: true, warming: false, expected: false },
  ])(
    'uses host settings and waits for a real SSR transform: $command/$hmr/$warming',
    async ({ command, hmr, warming, expected }) => {
      const schedule = vi.fn();
      const released = Promise.withResolvers<void>();
      const settled = vi.fn(() => released.promise);
      const primary: Plugin = { name: 'primary', handleHotUpdate: () => [] };
      const plugin = isolateCompilerEnvironments<Plugin>(
        primary,
        () => ({ name: 'server', transform: (code) => code }),
        undefined,
        undefined,
        undefined,
        warming ? { schedule, settled } : undefined,
      );
      Reflect.apply(hook(plugin.config), {}, [
        {},
        { command, mode: 'development' },
      ]);
      await Reflect.apply(hook(plugin.configResolved), {}, [
        { build: {}, server: { hmr } },
      ]);
      const select = (name: string, mode?: string) =>
        Reflect.apply(hook(plugin.applyToEnvironment), plugin, [
          {
            name,
            ...(mode ? { mode } : {}),
            config: {
              consumer: name === 'client' ? 'client' : 'server',
              build: {},
            },
          },
        ]);
      expect(await select('ssr', 'scan')).toBe(false);
      const client = await select('client');
      const server = await select('ssr');
      await Reflect.apply(hook(client.handleHotUpdate), {}, [{}]);
      expect(schedule).not.toHaveBeenCalled();
      await Reflect.apply(hook(server.transform), {}, [
        'export {};',
        '/src/view.ts',
      ]);
      const updating = Reflect.apply(hook(client.handleHotUpdate), {}, [{}]);
      expect(schedule).not.toHaveBeenCalled();
      released.resolve();
      await updating;
      expect(schedule).toHaveBeenCalledTimes(expected ? 1 : 0);
    },
  );
});

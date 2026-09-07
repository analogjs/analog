import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { nitro } from './vite-plugin-nitro';
import { buildServer } from './build-server';

vi.mock('./build-server');
vi.mock('node:os', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:os')>()),
  platform: () => 'win32',
}));

async function configure(ssr = false) {
  const userHook = vi.fn();
  const external = vi.fn(() => false);
  const plugin = nitro(
    {
      ssr: false,
    },
    { hooks: { 'rollup:before': userHook }, rollupConfig: { external } },
  )[1] as any;
  const config = await plugin.config(
    { root: process.cwd(), build: { ssr } },
    { command: 'build' },
  );
  await config.builder.buildApp({
    build: vi.fn(),
    environments: { client: {} },
  });
  return {
    config: vi.mocked(buildServer).mock.calls.at(-1)![1],
    userHook,
    external,
  };
}

describe('TypeScript server externalization', () => {
  it('traces the application compiler only when imported, without replacing user hooks or external rules', async () => {
    const { config, userHook, external } = await configure();
    expect(config.externals?.traceInclude).toEqual([]);
    expect(config.hooks?.['rollup:before']).toBe(userHook);
    expect(config.rollupConfig?.external).toBe(external);
    const hook = vi.fn();
    const instance = {
      options: { node: true, externals: config.externals },
      hooks: { hook },
    };
    await (config.modules![0] as Function)(instance);
    const existing = { name: 'consumer-plugin' };
    const rollup = { plugins: [existing] };
    await hook.mock.calls[0][1](instance, rollup);
    const resolver = (rollup.plugins[0] as any).resolveId;
    expect(resolver('rxjs')).toBeNull();
    expect(config.externals?.traceInclude).toEqual([]);
    expect(resolver('typescript')).toEqual({
      id: 'typescript',
      external: true,
    });
    resolver('typescript');
    expect(config.externals?.traceInclude).toEqual([
      createRequire(resolve('package.json')).resolve('typescript'),
    ]);
    expect(rollup.plugins[1]).toEqual([existing]);
  });

  it('preserves tracing initialization for Windows SSR builds', async () => {
    const { config } = await configure(true);
    expect(config.externals?.inline).toContain('std-env');
    expect(config.externals?.traceInclude).toEqual([]);
  });

  it.each([{ node: false }, { node: true, noExternals: true }])(
    'retains bundling for %j',
    async (options) => {
      const { config } = await configure();
      const hook = vi.fn();
      const instance = {
        options: { ...options, externals: config.externals },
        hooks: { hook },
      };
      await (config.modules![0] as Function)(instance);
      const rollup = { plugins: [] };
      await hook.mock.calls[0][1](instance, rollup);
      expect(rollup.plugins).toEqual([]);
      expect(config.externals?.traceInclude).toEqual([]);
    },
  );
});

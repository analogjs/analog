import { describe, expect, it, vi } from 'vitest';
import { nitro as nitroVitePlugin } from 'nitro/vite';

import { createAnalogNitroPlugins } from './analog-vite-plugin';
import {
  analogNitroModule,
  createAnalogBuildState,
} from './analog-nitro-module';
import { buildNitroConfig } from './nitro-config-factory';

vi.mock('nitro/vite', () => ({
  nitro: vi.fn(() => [
    { name: 'nitro:init' },
    { name: 'nitro:env' },
    { name: 'nitro:main' },
  ]),
}));

describe('createAnalogNitroPlugins', () => {
  it('should return an array of plugins', () => {
    const plugins = createAnalogNitroPlugins();
    expect(Array.isArray(plugins)).toBe(true);
    expect(plugins.length).toBeGreaterThan(0);
  });

  it('should include the analog nitro plugin with NitroModule', () => {
    const plugins = createAnalogNitroPlugins();
    const modulePlugin = plugins.find(
      (p) => p.name === '@analogjs/vite-plugin-nitro',
    );
    expect(modulePlugin).toBeDefined();
    expect((modulePlugin as any).nitro).toBeDefined();
    expect((modulePlugin as any).nitro.name).toBe('analog');
  });

  it('should point the SSR renderer at the source server entry during serve', () => {
    const originalNodeEnv = process.env['NODE_ENV'];
    const originalVitest = process.env['VITEST'];
    delete process.env['NODE_ENV'];
    delete process.env['VITEST'];

    createAnalogNitroPlugins({ ssr: true, workspaceRoot: '/app' as any });
    const calls = vi.mocked(nitroVitePlugin).mock.calls;
    const nitroConfig = calls[calls.length - 1]?.[0] as any;

    expect(nitroConfig.virtual['#ANALOG_SSR_RENDERER']).toContain(
      'import renderer from "/app/src/main.server.ts";',
    );

    process.env['NODE_ENV'] = originalNodeEnv;
    process.env['VITEST'] = originalVitest;
  });

  it('should include the API prefix plugin', () => {
    const plugins = createAnalogNitroPlugins();
    const prefixPlugin = plugins.find(
      (p) => p.name === '@analogjs/vite-plugin-nitro-api-prefix',
    );
    expect(prefixPlugin).toBeDefined();
  });

  it('should include nitro/vite plugins when not in test mode', () => {
    const originalEnv = process.env['NODE_ENV'];
    delete process.env['NODE_ENV'];
    delete process.env['VITEST'];

    const plugins = createAnalogNitroPlugins();
    const nitroPlugins = plugins.filter((p) => p.name?.startsWith('nitro:'));
    expect(nitroPlugins.length).toBeGreaterThan(0);

    process.env['NODE_ENV'] = originalEnv;
  });
});

describe('analogNitroModule', () => {
  it('should create a NitroModule with name "analog"', () => {
    const state = createAnalogBuildState();
    const module = analogNitroModule(undefined, state);
    expect(module.name).toBe('analog');
    expect(typeof module.setup).toBe('function');
  });

  it('should register SSR renderer when ssr is true', async () => {
    const state = createAnalogBuildState();
    const module = analogNitroModule({ ssr: true }, state);
    const nitro = createMockNitro();

    await module.setup(nitro);

    expect(nitro.options.virtual['#ANALOG_SSR_RENDERER']).toBeDefined();
    expect(nitro.options.virtual['#ANALOG_CLIENT_RENDERER']).toBeDefined();
  });

  it('should register renderer handler as catch-all', async () => {
    const state = createAnalogBuildState();
    const module = analogNitroModule({ ssr: true }, state);
    const nitro = createMockNitro();

    await module.setup(nitro);

    const catchAll = nitro.options.handlers.find(
      (h: any) => h.route === '/**' && !h.middleware,
    );
    expect(catchAll).toBeDefined();
    expect(catchAll.handler).toBe('#ANALOG_SSR_RENDERER');
  });

  it('should use client renderer when ssr is false', async () => {
    const state = createAnalogBuildState();
    const module = analogNitroModule({ ssr: false }, state);
    const nitro = createMockNitro();

    await module.setup(nitro);

    const catchAll = nitro.options.handlers.find(
      (h: any) => h.route === '/**' && !h.middleware,
    );
    expect(catchAll.handler).toBe('#ANALOG_CLIENT_RENDERER');
  });

  it('should set module side effects for zone.js when ssr is true', async () => {
    const state = createAnalogBuildState();
    const module = analogNitroModule({ ssr: true }, state);
    const nitro = createMockNitro();

    await module.setup(nitro);

    expect(nitro.options.moduleSideEffects).toContain('zone.js/node');
  });

  it('should register rollup:before hook for externals', async () => {
    const state = createAnalogBuildState();
    const module = analogNitroModule({ ssr: true }, state);
    const nitro = createMockNitro();

    await module.setup(nitro);

    expect(nitro.hooks.hook).toHaveBeenCalledWith(
      'rollup:before',
      expect.any(Function),
    );
  });
});

describe('buildNitroConfig', () => {
  it('should build a NitroConfig with defaults', () => {
    const config = buildNitroConfig(undefined, undefined, {
      workspaceRoot: '/app',
      rootDir: '.',
      sourceRoot: 'src',
      apiPrefix: '/api',
      prefix: '',
      hasAPIDir: false,
      useAPIMiddleware: true,
    });

    expect(config.rootDir).toBe('.');
    expect(config.renderer).toEqual({});
    expect(config.imports?.autoImport).toBe(false);
    expect(config.typescript?.generateTsConfig).toBe(false);
    expect(config.virtual?.['#ANALOG_SSR_RENDERER']).toBeDefined();
  });

  it('should alias #analog/ssr to the source server entry in SSR mode', () => {
    const config = buildNitroConfig({ ssr: true }, undefined, {
      workspaceRoot: '/app',
      rootDir: 'apps/demo',
      sourceRoot: 'src',
      apiPrefix: '/api',
      prefix: '',
      hasAPIDir: false,
      useAPIMiddleware: true,
    });

    expect(config.alias?.['#analog/ssr']).toBe(
      '/app/apps/demo/src/main.server.ts',
    );
  });

  it('should apply Vercel preset output paths', () => {
    vi.stubEnv('BUILD_PRESET', 'vercel');

    const config = buildNitroConfig(undefined, undefined, {
      workspaceRoot: '/app',
      rootDir: '.',
      sourceRoot: 'src',
      apiPrefix: '/api',
      prefix: '',
      hasAPIDir: false,
      useAPIMiddleware: true,
    });

    expect(config.output?.dir).toContain('.vercel/output');

    vi.unstubAllEnvs();
  });
});

function createMockNitro() {
  return {
    options: {
      rootDir: '.',
      virtual: {} as Record<string, string>,
      handlers: [] as any[],
      scanDirs: [] as string[],
      rollupConfig: { plugins: [] as any[] } as any,
      renderer: undefined as any,
      routeRules: {} as any,
      prerender: {} as any,
      output: { publicDir: '/tmp/test/public', dir: '/tmp/test' } as any,
      moduleSideEffects: undefined as any,
      noExternals: undefined as any,
      alias: {} as any,
      preset: undefined as any,
      vercel: undefined as any,
    },
    hooks: {
      hook: vi.fn(),
    },
  };
}

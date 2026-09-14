import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  analogNitroPlugin,
  injectAnalogRouteRuleHeaders,
} from './analog-nitro-plugin';

function callConfig(plugin: any, root: string, command = 'build') {
  const hook = plugin.config;
  const env = {
    command,
    mode: command === 'build' ? 'production' : 'development',
  };
  return typeof hook === 'function'
    ? hook({ root }, env)
    : hook?.handler({ root }, env);
}

function callWriteBundle(plugin: any, envName: string, bundle: any) {
  const hook = plugin.writeBundle;
  const ctx = { environment: { name: envName } };
  return typeof hook === 'function'
    ? hook.call(ctx, {} as any, bundle)
    : hook?.handler.call(ctx, {} as any, bundle);
}

function callResolveId(plugin: any, id: string) {
  const hook = plugin.resolveId;
  if (typeof hook === 'function') {
    return hook.call({} as any, id, undefined, {} as any);
  }
  return hook?.handler.call({} as any, id, undefined, {} as any);
}

function callLoad(plugin: any, id: string) {
  const hook = plugin.load;
  if (typeof hook === 'function') {
    return hook.call({} as any, id);
  }
  return hook?.handler.call({} as any, id);
}

describe('analogNitroPlugin', () => {
  let workspaceRoot: string;
  let projectRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'analog-nitro-plugin-'));
    projectRoot = workspaceRoot;
    mkdirSync(join(workspaceRoot, 'src'), { recursive: true });
    writeFileSync(
      join(workspaceRoot, 'src/main.server.ts'),
      'export default () => "<!doctype html><html></html>";',
    );
    writeFileSync(
      join(workspaceRoot, 'index.html'),
      '<!doctype html><html><body><div id="app"></div></body></html>',
    );
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('exposes the expected plugin shape', () => {
    const plugin = analogNitroPlugin({ workspaceRoot });
    expect(plugin.name).toBe('@analogjs/nitro');
    expect(plugin.enforce).toBe('pre');
    expect(typeof plugin.config).toBe('function');
    expect(typeof plugin.resolveId).toBe('function');
    expect(typeof plugin.load).toBe('function');
    expect(typeof (plugin as any).nitro.setup).toBe('function');
  });

  it('registers the SSR service entry and linker optimizeDeps when ssr=true', () => {
    const plugin = analogNitroPlugin({ workspaceRoot, ssr: true });
    const overrides: any = callConfig(plugin, projectRoot);

    expect(overrides.environments.ssr.build.rollupOptions.input).toEqual({
      index: join(projectRoot, '.analog/__ssr-entry.mjs'),
    });
    expect(overrides.experimental).toBeUndefined();
    expect(overrides.environments.ssr.optimizeDeps.include).toContain(
      '@angular/core',
    );
    expect(overrides.environments.ssr.optimizeDeps.include).toContain(
      '@angular/platform-server',
    );
    expect(
      overrides.environments.ssr.optimizeDeps.rolldownOptions.plugins,
    ).toHaveLength(1);
  });

  it('does not configure SSR overrides when ssr=false', () => {
    const plugin = analogNitroPlugin({ workspaceRoot, ssr: false });
    const overrides: any = callConfig(plugin, projectRoot);

    expect(overrides.experimental).toBeUndefined();
    expect(overrides.environments.ssr).toBeUndefined();
  });

  it('gives the client environment an input, ahead of ssr', () => {
    const plugin = analogNitroPlugin({ workspaceRoot, ssr: true });
    const overrides: any = callConfig(plugin, projectRoot);

    expect(overrides.environments.client.build.rollupOptions.input).toBe(
      join(workspaceRoot, 'index.html'),
    );
    // The SSR bundle inlines the document it renders around, so the client
    // environment has to build first.
    expect(Object.keys(overrides.environments)).toEqual(['client', 'ssr']);
  });

  it('resolves the SSR entry marker path to the virtual id', () => {
    const plugin = analogNitroPlugin({ workspaceRoot });
    callConfig(plugin, projectRoot);

    const markerPath = join(workspaceRoot, '.analog/__ssr-entry.mjs');
    expect(callResolveId(plugin, markerPath)).toBe(
      '\0virtual:@analogjs/nitro/ssr-entry',
    );
    expect(callResolveId(plugin, '/some/other/path.ts')).toBeNull();
  });

  it('emits a wrapper that imports the user main.server.ts and inlines the built template', () => {
    const plugin = analogNitroPlugin({ workspaceRoot });
    callConfig(plugin, projectRoot);
    callWriteBundle(plugin, 'client', {
      'index.html': {
        type: 'asset',
        source:
          '<!doctype html><html><body><script src="/assets/main-abc.js"></script></body></html>',
      },
    });

    const code = callLoad(plugin, '\0virtual:@analogjs/nitro/ssr-entry');
    expect(typeof code).toBe('string');
    expect(code).toContain('main.server.ts');
    expect(code.indexOf('virtual:@analogjs/platform/server-mode')).toBeLessThan(
      code.indexOf('main.server.ts'),
    );
    expect(code).toContain('export default {');
    expect(code).toContain('fetch(req)');
    // The built document, not the source: rendering around the source would
    // ship markup pointing at an entry that a build does not emit.
    expect(code).toContain('/assets/main-abc.js');
    expect(code).not.toContain('id=\\"app\\"');
    expect(code).toContain("'x-analog-no-ssr'");
  });

  it('fails loudly when a build produced no client document', () => {
    const plugin = analogNitroPlugin({ workspaceRoot });
    callConfig(plugin, projectRoot);

    expect(() =>
      callLoad(plugin, '\0virtual:@analogjs/nitro/ssr-entry'),
    ).toThrow(/client build produced no index\.html/);
  });

  it('renders around the source document in dev', () => {
    const plugin = analogNitroPlugin({ workspaceRoot });
    callConfig(plugin, projectRoot, 'serve');

    const code = callLoad(plugin, '\0virtual:@analogjs/nitro/ssr-entry');
    expect(code).toContain('id=\\"app\\"');
  });

  it.each([
    { error: { statusCode: 422 }, status: 422 },
    { error: { status: 503 }, status: 503 },
    { error: { statusCode: 200 }, status: 500 },
    { error: { statusCode: '422' }, status: 500 },
    { error: { statusCode: 600 }, status: 500 },
  ])(
    'returns a safe error document with HTTP status $status',
    async ({ error, status }) => {
      const plugin = analogNitroPlugin({ workspaceRoot });
      callConfig(plugin, projectRoot, 'serve');
      const code = callLoad(plugin, '\0virtual:@analogjs/nitro/ssr-entry')
        .split('\n')
        .filter((line: string) => !line.startsWith('import '))
        .join('\n')
        .replace('export default', 'return');
      const previousFetch = globalThis.$fetch;
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const renderer = vi.fn(async () => {
          throw { ...error, message: 'private-error-marker' };
        });
        const service = new Function(
          'renderer',
          'createFetch',
          'nitroServerFetch',
          code,
        )(renderer, () => vi.fn(), vi.fn());
        const response = await service.fetch(
          new Request('http://localhost/failed'),
        );
        expect(response.status).toBe(status);
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(response.headers.get('x-robots-tag')).toBe('noindex');
        const html = await response.text();
        expect(html).toContain('<h1>Unable to load this page</h1>');
        expect(html).not.toContain('private-error-marker');
        expect(html).not.toContain('<script');
      } finally {
        globalThis.$fetch = previousFetch;
        log.mockRestore();
      }
    },
  );

  it('registers page handlers and the page-endpoints rollup plugin in nitro setup', async () => {
    mkdirSync(join(workspaceRoot, 'src/app/pages'), { recursive: true });
    writeFileSync(
      join(workspaceRoot, 'src/app/pages/index.server.ts'),
      'export const load = () => ({});',
    );

    const plugin = analogNitroPlugin({ workspaceRoot });
    callConfig(plugin, projectRoot);

    const hookFn = vi.fn();
    const nitroMock: any = {
      options: {
        rootDir: projectRoot,
        buildDir: join(projectRoot, '.nitro'),
        handlers: [],
        scanDirs: [],
        virtual: {},
        renderer: {},
        dev: true,
      },
      hooks: { hook: hookFn },
    };

    await (plugin as any).nitro.setup(nitroMock);

    expect(nitroMock.options.handlers).toHaveLength(1);
    expect(nitroMock.options.handlers[0].route).toContain('/_analog/pages');
    expect(hookFn).toHaveBeenCalledWith('rollup:before', expect.any(Function));
  });

  it.each([
    { node: false, noExternals: undefined, externalize: false },
    { node: true, noExternals: true, externalize: false },
    { node: true, noExternals: false, externalize: true },
  ])(
    'respects the resolved Nitro dependency policy %j',
    async ({ node, noExternals, externalize }) => {
      const plugin = analogNitroPlugin({ workspaceRoot, ssr: false });
      callConfig(plugin, projectRoot);
      const hook = vi.fn();
      const nitroMock = {
        options: {
          rootDir: projectRoot,
          buildDir: join(projectRoot, '.nitro'),
          handlers: [],
          scanDirs: [],
          virtual: {},
          dev: false,
          node,
          noExternals,
        },
        hooks: { hook },
      };
      await (plugin as any).nitro.setup(nitroMock);
      const before = hook.mock.calls.find(
        ([name]) => name === 'rollup:before',
      )?.[1];
      const config = { plugins: [], external: ['user-external'] };
      before(nitroMock, config);
      const matches = (id: string) =>
        config.external.some((entry: string | RegExp) =>
          typeof entry === 'string' ? entry === id : entry.test(id),
        );
      expect(matches('rxjs')).toBe(externalize);
      expect(matches('rxjs/operators')).toBe(externalize);
      expect(matches('sharp')).toBe(externalize);
      expect(matches('user-external')).toBe(true);
    },
  );

  it('hides the virtual renderer from prerender path resolution and restores it', async () => {
    const plugin = analogNitroPlugin({ workspaceRoot });
    callConfig(plugin, projectRoot);

    const hookFn = vi.fn();
    const nitroMock: any = {
      options: {
        rootDir: projectRoot,
        buildDir: join(projectRoot, '.nitro'),
        handlers: [],
        scanDirs: [],
        virtual: {},
        renderer: {},
        output: { publicDir: join(projectRoot, 'dist/public') },
        dev: true,
      },
      hooks: { hook: hookFn },
    };

    await (plugin as any).nitro.setup(nitroMock);

    expect(nitroMock.options.renderer.handler).toBe('#analog/ssr-renderer');

    const hooksFor = (name: string) =>
      hookFn.mock.calls
        .filter((call) => call[0] === name)
        .map((call) => call[1]);
    const prerendererConfig: any = { renderer: nitroMock.options.renderer };
    for (const hook of hooksFor('prerender:config')) hook(prerendererConfig);
    expect(prerendererConfig.renderer).toBe(false);

    const prerenderer: any = { options: { renderer: undefined } };
    for (const hook of hooksFor('prerender:init')) hook(prerenderer);
    expect(prerenderer.options.renderer).toEqual({
      handler: '#analog/ssr-renderer',
    });
  });

  it('stamps route rule headers for ssr and streaming opt-outs', () => {
    const nitroMock: any = {
      options: {
        routeRules: {
          '/buffered': { streaming: false },
          '/no-ssr': { ssr: false },
          '/no-ssr/help': {
            ssr: true,
            headers: { 'x-analog-no-ssr': 'true', 'x-example': 'retained' },
          },
          '/default': {},
        },
      },
    };

    injectAnalogRouteRuleHeaders(nitroMock);

    expect(nitroMock.options.routeRules['/buffered'].headers).toEqual({
      'x-analog-no-streaming': 'true',
    });
    expect(nitroMock.options.routeRules['/no-ssr'].headers).toEqual({
      'x-analog-no-ssr': 'true',
    });
    expect(nitroMock.options.routeRules['/no-ssr/help'].headers).toEqual({
      'x-analog-no-ssr': 'false',
      'x-example': 'retained',
    });
    expect(nitroMock.options.routeRules['/default'].headers).toBeUndefined();
  });
});

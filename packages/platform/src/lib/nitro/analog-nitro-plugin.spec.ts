import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
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

function callWriteBundle(
  plugin: any,
  envName: string,
  bundle: any,
  dir?: string,
) {
  const hook = plugin.writeBundle;
  const ctx = { environment: { name: envName } };
  return typeof hook === 'function'
    ? hook.call(ctx, { dir }, bundle)
    : hook?.handler.call(ctx, { dir }, bundle);
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

  it.each([true, false])(
    'keeps the public client shell only when SSR is disabled (ssr=%s)',
    (ssr) => {
      const output = join(workspaceRoot, 'client-output');
      mkdirSync(output, { recursive: true });
      for (const suffix of ['', '.br', '.gz'])
        writeFileSync(join(output, `index.html${suffix}`), 'client shell');
      const plugin = analogNitroPlugin({ workspaceRoot, ssr });
      callConfig(plugin, projectRoot);
      callWriteBundle(
        plugin,
        'client',
        { 'index.html': { type: 'asset', source: 'client shell' } },
        output,
      );
      for (const suffix of ['', '.br', '.gz'])
        expect(existsSync(join(output, `index.html${suffix}`))).toBe(!ssr);
      expect(existsSync(join(workspaceRoot, 'index.html'))).toBe(true);
      expect(callLoad(plugin, '\0virtual:@analogjs/nitro/ssr-entry')).toContain(
        'client shell',
      );
    },
  );

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

  it('passes trusted streaming policy and the request signal through the built wrapper', async () => {
    const plugin = analogNitroPlugin({ workspaceRoot });
    callConfig(plugin, projectRoot, 'serve');
    const code = callLoad(plugin, '\0virtual:@analogjs/nitro/ssr-entry')
      .split('\n')
      .filter((line: string) => !line.startsWith('import '))
      .join('\n')
      .replace('export default', 'return');
    const renderer = vi.fn(async () => 'rendered');
    const previousFetch = globalThis.$fetch;
    try {
      const service = new Function(
        'renderer',
        'createFetch',
        'nitroServerFetch',
        code,
      )(renderer, () => vi.fn(), vi.fn());
      const abort = new AbortController();
      const request = new Request('http://localhost/stream?test=1', {
        headers: { 'x-analog-no-streaming': 'true' },
        signal: abort.signal,
      });
      const node = { req: { headers: {}, originalUrl: '' }, res: {} };
      const tasks: Promise<void>[] = [];
      const edge = {
        tasks,
        waitUntil(task: Promise<void>) {
          this.tasks.push(task);
        },
      };
      Object.defineProperty(request, 'runtime', {
        value: { node, cloudflare: { context: edge } },
      });
      expect(await (await service.fetch(request)).text()).toBe('rendered');
      const context = renderer.mock.calls[0][2];
      expect(context.streaming).toBe(false);
      expect(context.signal).toBe(request.signal);
      expect(context.req).toBe(node.req);
      expect(context.res).toBe(node.res);
      expect(context.req.originalUrl).toBe('/stream?test=1');
      const task = Promise.resolve();
      context.waitUntil(task);
      expect(tasks).toEqual([task]);
      abort.abort();
      expect(context.signal.aborted).toBe(true);
    } finally {
      globalThis.$fetch = previousFetch;
    }
  });

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

  it('registers HTTP server functions when HTML SSR is disabled', async () => {
    mkdirSync(join(workspaceRoot, 'src/app/server-fns'), { recursive: true });
    writeFileSync(
      join(workspaceRoot, 'src/app/server-fns/read.server.ts'),
      `import { serverFn } from '@analogjs/router/server'; export const read = serverFn(async () => 'value');`,
    );
    const plugin = analogNitroPlugin({ workspaceRoot, ssr: false });
    callConfig(plugin, projectRoot);
    const hook = vi.fn();
    const nitroMock: any = {
      options: {
        rootDir: projectRoot,
        buildDir: join(projectRoot, '.nitro'),
        handlers: [],
        scanDirs: [],
        virtual: {},
        dev: true,
      },
      hooks: { hook },
    };
    await (plugin as any).nitro.setup(nitroMock);
    expect(nitroMock.options.handlers).toContainEqual({
      route: '/_analog/fn/:id',
      handler: '#analog/server-functions',
      lazy: true,
    });
    expect(nitroMock.options.virtual['#analog/server-functions']()).toContain(
      'read.server.ts',
    );
    const before = hook.mock.calls.find(
      ([name]) => name === 'rollup:before',
    )?.[1];
    const config = { plugins: [] };
    before(nitroMock, config);
    expect(config.plugins).toContainEqual(
      expect.objectContaining({
        name: 'analogjs-platform-server-function-ids',
      }),
    );
  });

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

  it('stamps route rule headers for explicit SSR and streaming policies', () => {
    const nitroMock: any = {
      options: {
        routeRules: {
          '/buffered': { streaming: false },
          '/streamed': { streaming: true },
          '/no-ssr': { ssr: false },
          '/ssr': { ssr: true, headers: { 'x-existing': 'preserved' } },
          '/default': {},
        },
      },
    };

    injectAnalogRouteRuleHeaders(nitroMock);

    expect(nitroMock.options.routeRules['/buffered'].headers).toEqual({
      'x-analog-no-streaming': 'true',
    });
    expect(nitroMock.options.routeRules['/streamed'].headers).toEqual({
      'x-analog-no-streaming': 'false',
    });
    expect(nitroMock.options.routeRules['/no-ssr'].headers).toEqual({
      'x-analog-no-ssr': 'true',
    });
    expect(nitroMock.options.routeRules['/ssr'].headers).toEqual({
      'x-existing': 'preserved',
      'x-analog-no-ssr': 'false',
    });
    expect(nitroMock.options.routeRules['/default'].headers).toBeUndefined();
  });
});

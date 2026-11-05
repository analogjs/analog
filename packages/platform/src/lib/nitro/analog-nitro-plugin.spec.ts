import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRouteRulesMatcher } from 'h3/rules';
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
  const config = { root, plugins: [[{ name: 'nitro:main' }]] };
  return typeof hook === 'function'
    ? hook(config, env)
    : hook?.handler(config, env);
}

function callWriteBundle(plugin: any, envName: string, bundle: any) {
  const hook = plugin.writeBundle;
  const ctx = { environment: { name: envName } };
  return typeof hook === 'function'
    ? hook.call(ctx, {} as any, bundle)
    : hook?.handler.call(ctx, {} as any, bundle);
}

function callResolveId(plugin: any, id: string, environment = { name: 'ssr' }) {
  const hook = plugin.resolveId;
  if (typeof hook === 'function') {
    return hook.call({ environment } as any, id, undefined, {} as any);
  }
  return hook?.handler.call({ environment } as any, id, undefined, {} as any);
}

function callLoad(plugin: any, id: string) {
  const hook = plugin.load;
  if (typeof hook === 'function') {
    return hook.call({} as any, id);
  }
  return hook?.handler.call({} as any, id);
}

function runModule(code: string, imports: Record<string, unknown>) {
  return new Function(
    ...Object.keys(imports),
    code.replace(/^import .+;$/gm, '').replace('export default', 'return'),
  )(...Object.values(imports));
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

  it('stays inactive without nitro() from nitro/vite', () => {
    const plugin = analogNitroPlugin({ workspaceRoot, ssr: true });
    const hook = plugin.config as (...args: unknown[]) => unknown;

    expect(
      hook({ root: projectRoot, plugins: [] }, { command: 'build' }),
    ).toBeUndefined();
  });

  it('registers the SSR service entry when ssr=true', () => {
    const plugin = analogNitroPlugin({ workspaceRoot, ssr: true });
    const overrides: any = callConfig(plugin, projectRoot);

    expect(overrides.environments.ssr.build.rollupOptions.input.index).toMatch(
      /\.analog\/__ssr-entry\.mjs$/,
    );
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

  it.each(['entry', 'configureServer'])(
    'waits for the first optimizer run when %s starts it',
    async (firstCaller) => {
      const plugin = analogNitroPlugin({ workspaceRoot });
      callConfig(plugin, projectRoot, 'serve');
      let finish!: () => void;
      const pending = new Promise<void>((resolve) => (finish = resolve));
      const init = vi
        .fn()
        .mockReturnValueOnce(pending)
        .mockResolvedValue(undefined);
      const environment = { name: 'ssr', depsOptimizer: { init } };
      const markerPath = join(workspaceRoot, '.analog/__ssr-entry.mjs');
      const configureServer = () =>
        (plugin.configureServer as any)({ environments: { ssr: environment } });

      if (firstCaller === 'configureServer') configureServer();
      const entry = callResolveId(plugin, markerPath, environment);
      if (firstCaller === 'entry') configureServer();
      const virtualEntry = callResolveId(
        plugin,
        '\0virtual:@analogjs/nitro/ssr-entry',
        environment,
      );
      const resolved = vi.fn();
      entry.then(resolved);
      virtualEntry.then(resolved);
      expect(init).toHaveBeenCalledTimes(1);

      // Vite's listen() calls init() again without awaiting the first run.
      await init();
      expect(resolved).not.toHaveBeenCalled();
      expect(callResolveId(plugin, '@angular/core', environment)).toBeNull();

      finish();
      await expect(entry).resolves.toBe('\0virtual:@analogjs/nitro/ssr-entry');
      await expect(virtualEntry).resolves.toBe(
        '\0virtual:@analogjs/nitro/ssr-entry',
      );
      expect(resolved).toHaveBeenCalledTimes(2);
    },
  );

  it('propagates a failed optimizer run to every SSR entry request', async () => {
    const plugin = analogNitroPlugin({ workspaceRoot });
    callConfig(plugin, projectRoot, 'serve');
    const error = new Error('optimization failed');
    const init = vi
      .fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValue(undefined);
    const environment = { name: 'ssr', depsOptimizer: { init } };
    (plugin.configureServer as any)({ environments: { ssr: environment } });

    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(
        callResolveId(
          plugin,
          join(workspaceRoot, '.analog/__ssr-entry.mjs'),
          environment,
        ),
      ).rejects.toBe(error);
    }
    expect(init).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['build', true, 'ssr'],
    ['serve', false, 'ssr'],
    ['serve', true, 'client'],
    ['serve', true, 'nitro'],
  ] as const)(
    'does not gate %s entry resolution with ssr=%s in %s',
    (command, ssr, name) => {
      const plugin = analogNitroPlugin({ workspaceRoot, ssr });
      callConfig(plugin, projectRoot, command);
      const init = vi.fn();
      const environment = { name, depsOptimizer: { init } };
      expect(
        callResolveId(
          plugin,
          join(workspaceRoot, '.analog/__ssr-entry.mjs'),
          environment,
        ),
      ).toBe('\0virtual:@analogjs/nitro/ssr-entry');
      expect(init).not.toHaveBeenCalled();
    },
  );

  it('allows dev SSR without a dependency optimizer', async () => {
    const plugin = analogNitroPlugin({ workspaceRoot });
    callConfig(plugin, projectRoot, 'serve');
    await expect(
      callResolveId(plugin, join(workspaceRoot, '.analog/__ssr-entry.mjs')),
    ).resolves.toBe('\0virtual:@analogjs/nitro/ssr-entry');
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
    expect(hookFn).toHaveBeenCalledWith('build:config', expect.any(Function));
  });

  it('resolves a built SSR entry emitted with a .js extension', async () => {
    const buildDir = join(projectRoot, '.nitro');
    const ssrDir = join(buildDir, 'vite/services/ssr');
    mkdirSync(ssrDir, { recursive: true });
    writeFileSync(join(ssrDir, 'index.js'), 'export default {};');

    const plugin = analogNitroPlugin({ workspaceRoot });
    callConfig(plugin, projectRoot);

    const nitroMock: any = {
      options: {
        rootDir: projectRoot,
        buildDir,
        handlers: [],
        scanDirs: [],
        virtual: {},
        renderer: {},
        dev: false,
      },
      hooks: { hook: vi.fn() },
    };

    await (plugin as any).nitro.setup(nitroMock);

    expect(nitroMock.options.virtual['#analog/ssr']()).toBe(
      `export { default } from ${JSON.stringify(join(ssrDir, 'index.js'))};`,
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

  describe('SSR renderer route rules', () => {
    async function createRenderer(routeRules: Record<string, object>) {
      const plugin = analogNitroPlugin({ workspaceRoot });
      callConfig(plugin, projectRoot, 'serve');
      const nitroMock: any = {
        options: {
          rootDir: projectRoot,
          buildDir: join(projectRoot, '.nitro'),
          handlers: [],
          scanDirs: [],
          virtual: {},
          renderer: {},
          routeRules,
          dev: true,
        },
        hooks: { hook: vi.fn() },
      };
      await (plugin as any).nitro.setup(nitroMock);

      const matchRouteRules = createRouteRulesMatcher(
        nitroMock.options.routeRules,
      );
      const fetch = vi.fn(async (_req: Request) => new Response('rendered'));
      const handler = runModule(
        nitroMock.options.virtual['#analog/ssr-renderer'](),
        {
          defineHandler: (fn: unknown) => fn,
          getRouteRules: matchRouteRules,
          ssr: { fetch },
        },
      );
      const render = async (path: string, headers?: Record<string, string>) => {
        const req = new Request(`http://localhost${path}`, { headers });
        const waitUntil = vi.fn();
        const result = await handler({
          req,
          url: new URL(req.url),
          res: { headers: new Headers() },
          waitUntil,
        });
        return { result, forwarded: fetch.mock.calls.at(-1)?.[0], waitUntil };
      };
      return { render, fetch };
    }

    it('lets a narrower ssr: true rule override a broader ssr: false', async () => {
      const { render, fetch } = await createRenderer({
        '/**': { ssr: false },
        '/live/**': { ssr: true },
      });

      expect(typeof (await render('/other')).result).toBe('string');
      expect(fetch).not.toHaveBeenCalled();
      expect((await render('/live/page')).result).toBeInstanceOf(Response);
    });

    it('lets a narrower streaming: true rule override a broader streaming: false', async () => {
      const { render } = await createRenderer({
        '/**': { streaming: false },
        '/live/**': { streaming: true },
      });

      const buffered = (await render('/other')).forwarded;
      expect(buffered?.headers.get('x-analog-no-streaming')).toBe('true');
      const streamed = (await render('/live/page')).forwarded;
      expect(streamed?.headers.has('x-analog-no-streaming')).toBe(false);
    });

    it('ignores client-sent ssr and streaming opt-out headers', async () => {
      const { render } = await createRenderer({});

      const { result, forwarded } = await render('/page', {
        'x-analog-no-ssr': 'true',
        'x-analog-no-streaming': 'true',
        accept: 'text/html',
      });

      expect(result).toBeInstanceOf(Response);
      expect(forwarded?.headers.has('x-analog-no-ssr')).toBe(false);
      expect(forwarded?.headers.has('x-analog-no-streaming')).toBe(false);
      expect(forwarded?.headers.get('accept')).toBe('text/html');
    });

    it('forwards waitUntil to the SSR service', async () => {
      const { render } = await createRenderer({});

      const { forwarded, waitUntil } = await render('/page');
      const task = Promise.resolve();
      (
        forwarded as Request & { waitUntil(task: Promise<void>): void }
      ).waitUntil(task);

      expect(waitUntil).toHaveBeenCalledWith(task);
    });
  });

  describe('SSR entry', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    function createEntry(renderer: (...args: any[]) => unknown) {
      vi.stubGlobal('$fetch', vi.fn());
      const plugin = analogNitroPlugin({ workspaceRoot });
      callConfig(plugin, projectRoot, 'serve');
      return runModule(
        callLoad(plugin, '\0virtual:@analogjs/nitro/ssr-entry'),
        {
          nitroServerFetch: vi.fn(),
          createFetch: () => vi.fn(),
          renderer,
        },
      );
    }

    it('responds with the status of a failed render', async () => {
      const entry = createEntry(() => {
        throw Object.assign(new Error('Not found'), { statusCode: 404 });
      });
      vi.spyOn(console, 'error').mockImplementation(() => undefined);

      const response = await entry.fetch(new Request('http://localhost/x'));

      expect(response.status).toBe(404);
      expect(response.headers.get('cache-control')).toBe('no-store');
    });

    it('responds with the status the app set on the response', async () => {
      const entry = createEntry((_url, _template, { res }) => {
        res.statusCode = 404;
        return '<html></html>';
      });

      const response = await entry.fetch(new Request('http://localhost/x'));

      expect(response.status).toBe(404);
    });

    it('passes the request signal and waitUntil to the renderer', async () => {
      let context: any;
      const entry = createEntry((_url, _template, ctx) => {
        context = ctx;
        return '<html></html>';
      });
      const abort = new AbortController();
      const waitUntil = vi.fn();
      const request = Object.assign(
        new Request('http://localhost/x', { signal: abort.signal }),
        { waitUntil },
      );

      await entry.fetch(request);
      abort.abort();
      const task = Promise.resolve();
      context.waitUntil(task);

      expect(context.signal.aborted).toBe(true);
      expect(waitUntil).toHaveBeenCalledWith(task);
      expect(context.renderErrorsAsHtml).toBe(true);
    });

    it('responds with the headers the app set on the response', async () => {
      const entry = createEntry((_url, _template, { res }) => {
        res.setHeader('cache-control', 'max-age=60');
        res.setHeader('set-cookie', ['a=1', 'b=2']);
        res.setHeader('x-removed', 'yes');
        res.removeHeader('x-removed');
        return '<html></html>';
      });

      const response = await entry.fetch(new Request('http://localhost/x'));

      expect(response.headers.get('cache-control')).toBe('max-age=60');
      expect(response.headers.getSetCookie()).toEqual(['a=1', 'b=2']);
      expect(response.headers.has('x-removed')).toBe(false);
      expect(response.headers.get('content-type')).toBe(
        'text/html; charset=utf-8',
      );
    });

    it('reads set-cookie back as a list like Node does', async () => {
      let cookies: unknown;
      const entry = createEntry((_url, _template, { res }) => {
        res.setHeader('Set-Cookie', ['a=1; Path=/', 'b=2']);
        cookies = res.getHeader('set-cookie');
        return '<html></html>';
      });

      await entry.fetch(new Request('http://localhost/x'));

      expect(cookies).toEqual(['a=1; Path=/', 'b=2']);
    });

    it('responds without a body for null-body statuses', async () => {
      const entry = createEntry((_url, _template, { res }) => {
        res.statusCode = 304;
        return '<html></html>';
      });

      const response = await entry.fetch(new Request('http://localhost/x'));

      expect(response.status).toBe(304);
      expect(response.body).toBeNull();
    });

    it('leaves buffered renders cacheable', async () => {
      const entry = createEntry(() =>
        Object.assign(new ReadableStream(), {
          [Symbol.for('analog.bufferedStream')]: true,
        }),
      );

      const response = await entry.fetch(new Request('http://localhost/x'));

      expect(response.headers.has('cache-control')).toBe(false);
      expect(response.headers.has('content-encoding')).toBe(false);
    });

    it('keeps streamed responses from being buffered or cached', async () => {
      const entry = createEntry(() => new ReadableStream());

      const response = await entry.fetch(new Request('http://localhost/x'));

      expect(response.headers.get('content-encoding')).toBe('identity');
      expect(response.headers.get('cache-control')).toBe(
        'no-store, no-transform',
      );
    });
  });

  it('stamps route rule headers for ssr and streaming opt-outs', () => {
    const nitroMock: any = {
      options: {
        routeRules: {
          '/buffered': { streaming: false },
          '/no-ssr': { ssr: false },
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
    expect(nitroMock.options.routeRules['/default'].headers).toBeUndefined();
  });
});

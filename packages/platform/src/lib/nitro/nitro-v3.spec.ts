import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { H3Event, getProxyRequestHeaders } from 'nitro/h3';
import { createFetch } from 'ofetch';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  analogNitroPlugin,
  injectAnalogRouteRuleHeaders,
} from './analog-nitro-plugin';

describe('Nitro v3 integration', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'analog-nitro-v3-'));
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'index.html'), '<html>client shell</html>');
    vi.stubGlobal('$fetch', undefined);
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    vi.unstubAllGlobals();
  });

  async function setup(options = {}, overrides = {}) {
    const plugin = analogNitroPlugin({
      workspaceRoot: root,
      ...options,
    }) as any;
    plugin.config({ root }, { command: 'serve' });
    const nitro: any = {
      options: {
        rootDir: root,
        buildDir: join(root, '.nitro'),
        dev: true,
        handlers: [],
        scanDirs: [],
        virtual: {},
        renderer: {},
        publicAssets: [],
        output: {
          dir: join(root, '.output'),
          publicDir: join(root, '.output/public'),
          serverDir: join(root, '.output/server'),
        },
        routeRules: {},
        ...overrides,
      },
      hooks: { hook: vi.fn() },
    };
    await plugin.nitro.setup(nitro);
    return { plugin, nitro };
  }

  it('leaves runner selection and native chunking with Nitro', async () => {
    const { nitro } = await setup();
    expect(nitro.options.devServer).toBeUndefined();
    const external = vi.fn(() => false);
    const output = {
      codeSplitting: { groups: [] },
      manualChunks: vi.fn(),
      chunkFileNames: vi.fn(),
    };
    const config = { plugins: [], external, output };
    const hook = nitro.hooks.hook.mock.calls.find(
      ([name]: [string]) => name === 'rollup:before',
    )[1];
    hook(nitro, config);
    expect(config.external).toBe(external);
    expect(config.output).toBe(output);
    expect(config.output.codeSplitting).toEqual({ groups: [] });
    expect(nitro.options.virtual['#analog/ssr']()).toContain(
      "fetchViteEnv('ssr', req)",
    );
  });

  it('preserves explicit output and runner settings and enables static output', async () => {
    const publicDir = join(root, 'custom-public');
    const { nitro } = await setup(
      { static: true },
      {
        dev: false,
        devServer: { runner: 'self' },
        output: {
          dir: join(root, '.output'),
          publicDir,
          serverDir: join(root, '.output/server'),
        },
        _config: { output: { publicDir } },
      },
    );
    expect(nitro.options.static).toBe(true);
    expect(nitro.options.output.publicDir).toBe(publicDir);
    expect(nitro.options.devServer.runner).toBe('self');
    expect(
      nitro.hooks.hook.mock.calls.some(
        ([name]: [string]) => name === 'prerender:route',
      ),
    ).toBe(false);
  });

  it('keeps the isolated prerenderer dynamic and its server in the build directory', async () => {
    const { nitro } = await setup(
      { static: true },
      {
        dev: false,
        preset: 'nitro-prerender',
        static: false,
      },
    );
    expect(nitro.options.static).toBe(false);
    expect(nitro.options.output.serverDir).toBe(join(root, '.output/server'));
    const config = { output: {} };
    for (const [name, hook] of nitro.hooks.hook.mock.calls) {
      if (name === 'prerender:config') hook(config);
    }
    expect(config.output).toMatchObject({
      serverDir: join(root, '.nitro/prerender'),
    });
  });

  it('leaves the Workers preset layout intact', async () => {
    const { nitro } = await setup(
      {},
      { dev: false, preset: 'cloudflare_module' },
    );
    expect(nitro.options.output.serverDir).toBe(join(root, '.output/server'));
  });

  it('uses resolved rules and removes client-supplied render policy', async () => {
    const { nitro } = await setup();
    const fetch = vi.fn(async () => new Response('rendered', { status: 201 }));
    const code = nitro.options.virtual['#analog/ssr-renderer']();
    const handler = new Function(
      'defineHandler',
      'ssr',
      code
        .replace("import { defineHandler } from 'nitro/h3';", '')
        .replace("import ssr from '#analog/ssr';", '')
        .replace('export default ', 'return '),
    )((fn: unknown) => fn, { fetch });
    const event = new H3Event(
      new Request('http://localhost/page', {
        headers: { 'x-analog-no-ssr': 'true', 'x-analog-no-streaming': 'true' },
      }),
    );
    const response = await handler(event);
    expect(response.status).toBe(201);
    expect(fetch.mock.calls[0][0].headers.has('x-analog-no-ssr')).toBe(false);
    expect(fetch.mock.calls[0][0].headers.has('x-analog-no-streaming')).toBe(
      false,
    );
    event.context.routeRules = { headers: { 'x-analog-no-ssr': 'true' } };
    expect(await handler(event)).toBe('<html>client shell</html>');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('allows specific routes to re-enable SSR and streaming', () => {
    const nitro: any = {
      options: {
        routeRules: {
          '/**': { ssr: false, streaming: false },
          '/live': { ssr: true, streaming: true },
        },
      },
    };
    injectAnalogRouteRuleHeaders(nitro);
    expect(nitro.options.routeRules['/live'].headers).toEqual({
      'x-analog-no-ssr': 'false',
      'x-analog-no-streaming': 'false',
    });
  });

  it('preserves renderer Responses and isolates concurrent internal fetches', async () => {
    const { plugin } = await setup();
    const code = plugin.load('\0virtual:@analogjs/nitro/ssr-entry');
    const internal = vi.fn(
      async (req: Request) =>
        new Response(JSON.stringify({ cookie: req.headers.get('cookie') }), {
          headers: { 'content-type': 'application/json' },
        }),
    );
    const renderer = async (_url: string, _template: string, context: any) => {
      await Promise.resolve();
      const data = await context.fetch('/api/session');
      return new Response(data.cookie, {
        status: 202,
        headers: { 'set-cookie': 'updated=1', location: '/done' },
      });
    };
    const service = new Function(
      'renderer',
      'nitroServerFetch',
      'createFetch',
      'H3Event',
      'getProxyRequestHeaders',
      code.replace(/^import .*;$/gm, '').replace('export default ', 'return '),
    )(renderer, internal, createFetch, H3Event, getProxyRequestHeaders);
    const results = await Promise.all(
      ['a=1', 'b=2'].map((cookie) =>
        service.fetch(
          new Request('http://localhost/page', { headers: { cookie } }),
        ),
      ),
    );
    expect(await Promise.all(results.map((r) => r.text()))).toEqual([
      'a=1',
      'b=2',
    ]);
    expect(results[0].status).toBe(202);
    expect(results[0].headers.get('set-cookie')).toBe('updated=1');
    expect(results[0].headers.get('location')).toBe('/done');
  });
});

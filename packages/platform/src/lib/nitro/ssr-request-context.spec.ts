import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFetch } from 'ofetch';
import { H3Event, getProxyRequestHeaders } from 'nitro/h3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { analogNitroPlugin } from './analog-nitro-plugin';

let root: string;
const previousFetch = globalThis.$fetch;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'analog-request-context-'));
  writeFileSync(join(root, 'index.html'), '<html><body></body></html>');
});
afterEach(() => {
  globalThis.$fetch = previousFetch;
  vi.unstubAllGlobals();
  rmSync(root, { recursive: true, force: true });
});

function service(
  renderer: (...args: any[]) => Promise<string>,
  internal: typeof fetch,
) {
  const plugin: any = analogNitroPlugin({ workspaceRoot: root });
  const config = plugin.config;
  (typeof config === 'function' ? config : config.handler)(
    { root },
    { command: 'serve', mode: 'development' },
  );
  const load =
    typeof plugin.load === 'function' ? plugin.load : plugin.load.handler;
  const code = load
    .call({}, '\0virtual:@analogjs/nitro/ssr-entry')
    .split('\n')
    .filter((line: string) => !line.startsWith('import '))
    .join('\n')
    .replace('export default', 'return');
  return new Function(
    'renderer',
    'createFetch',
    'nitroServerFetch',
    'H3Event',
    'getProxyRequestHeaders',
    code,
  )(renderer, createFetch, internal, H3Event, getProxyRequestHeaders);
}

describe('SSR request-scoped fetch', () => {
  it('forwards local request headers while removing inherited hop and body framing headers', async () => {
    const internal = vi.fn(
      async (resource: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(resource, init);
        return Response.json(Object.fromEntries(request.headers));
      },
    );
    const host = service(
      async (_url, _template, context) =>
        JSON.stringify(
          await context.fetch('/api/context', {
            headers: { 'x-explicit': 'child' },
          }),
        ),
      internal,
    );
    const response = await host.fetch(
      new Request('https://site.test/page', {
        headers: {
          cookie: 'session=first',
          authorization: 'Bearer first',
          'x-request-id': 'first',
          connection: 'x-hop',
          'x-hop': 'remove',
          'content-type': 'application/json',
          'content-length': '0',
        },
      }),
    );
    expect(JSON.parse(await response.text())).toEqual({
      cookie: 'session=first',
      authorization: 'Bearer first',
      'x-request-id': 'first',
      'x-explicit': 'child',
    });
  });

  it('keeps captured headers isolated across concurrent renders', async () => {
    const gate = Promise.withResolvers<void>();
    let entered = 0;
    const ready = Promise.withResolvers<void>();
    const host = service(
      async (_url, _template, context) => {
        if (++entered === 2) ready.resolve();
        await gate.promise;
        return await context.fetch('/api/context');
      },
      async (resource, init) =>
        new Response(new Request(resource, init).headers.get('cookie')),
    );
    const first = host.fetch(
      new Request('https://site.test/page', { headers: { cookie: 'first' } }),
    );
    const second = host.fetch(
      new Request('https://site.test/page', { headers: { cookie: 'second' } }),
    );
    await ready.promise;
    gate.resolve();
    expect(await (await first).text()).toBe('first');
    expect(await (await second).text()).toBe('second');
  });

  it('preserves Request bodies and explicit header overrides', async () => {
    const host = service(
      async (_url, _template, context) =>
        JSON.stringify(
          await context.fetch(
            new Request('https://site.test/api/context', {
              method: 'POST',
              body: 'payload',
              headers: { 'x-resource': 'kept', cookie: 'resource' },
            }),
            { headers: { cookie: 'explicit', 'x-option': 'kept' } },
          ),
        ),
      async (resource, init) => {
        const request = new Request(resource, init);
        return Response.json({
          method: request.method,
          body: await request.text(),
          cookie: request.headers.get('cookie'),
          option: request.headers.get('x-option'),
        });
      },
    );
    const response = await host.fetch(
      new Request('https://site.test/page', { headers: { cookie: 'parent' } }),
    );
    expect(JSON.parse(await response.text())).toEqual({
      method: 'POST',
      body: 'payload',
      cookie: 'explicit',
      option: 'kept',
    });
  });

  it.each(['https://other.test/api/context', '//other.test/api/context'])(
    'does not send incoming credentials to %s',
    async (url) => {
      const external = vi.fn(
        async (resource: RequestInfo | URL, init?: RequestInit) =>
          Response.json(
            Object.fromEntries(new Request(resource, init).headers),
          ),
      );
      vi.stubGlobal('fetch', external);
      const internal = vi.fn(async () => Response.json({ wrong: true }));
      const host = service(
        async (_url, _template, context) =>
          JSON.stringify(
            await context.fetch(url, { headers: { 'x-explicit': 'external' } }),
          ),
        internal,
      );
      const response = await host.fetch(
        new Request('https://site.test/page', {
          headers: { cookie: 'private', authorization: 'Bearer private' },
        }),
      );
      expect(JSON.parse(await response.text())).toEqual({
        'x-explicit': 'external',
      });
      expect(external).toHaveBeenCalledOnce();
      expect(internal).not.toHaveBeenCalled();
    },
  );

  it('retains request runtime metadata and parent cancellation for local calls', async () => {
    const abort = new AbortController();
    const parent = new Request('https://site.test/page', {
      signal: abort.signal,
    });
    const runtime = { binding: 'test-runtime' };
    Object.defineProperty(parent, 'runtime', { value: runtime });
    let child: Request | undefined;
    const host = service(
      async (_url, _template, context) => context.fetch('/api/context'),
      async (resource, init) => {
        child =
          resource instanceof Request ? resource : new Request(resource, init);
        expect(Reflect.get(child, 'runtime')).toBe(runtime);
        return new Response('done');
      },
    );
    await host.fetch(parent);
    abort.abort();
    expect(child?.signal.aborted).toBe(true);
  });

  it.each(['/api/context', 'https://other.test/api/context'])(
    'does not dispatch %s after the parent has already been aborted',
    async (url) => {
      const abort = new AbortController();
      abort.abort();
      const internal = vi.fn(async () => new Response('unexpected'));
      const external = vi.fn(async () => new Response('unexpected'));
      vi.stubGlobal('fetch', external);
      const host = service(
        async (_url, _template, context) =>
          context.fetch(url, { retry: false }),
        internal,
      );
      await host.fetch(
        new Request('https://site.test/page', { signal: abort.signal }),
      );
      expect(internal).not.toHaveBeenCalled();
      expect(external).not.toHaveBeenCalled();
    },
  );
});

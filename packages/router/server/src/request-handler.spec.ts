import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAnalogRequestHandler } from './request-handler';
import { serverFnRegistry } from './server-fn/registry';
import { serverFn } from './server-fn/server-fn';
import {
  ANALOG_SERVER_MANIFEST,
  type AnalogServerManifest,
} from './server-manifest';

const origin = 'http://localhost:3000';

const manifest: AnalogServerManifest = {
  apiPrefix: 'api',
  template: async () => '<html><body><app-root></app-root></body></html>',
  render:
    async () =>
    async (url, document, { res }) => {
      res.statusCode = url === '/missing' ? 404 : 200;
      res.setHeader('x-rendered', url);
      return document.replace('<app-root></app-root>', `<p>${url}</p>`);
    },
  config: async () => ({ providers: [] }),
  serverFnModules: [
    async () =>
      serverFn({ id: 'shout', method: 'POST' }, async (input: unknown) => ({
        text: (input as { text: string }).text.toUpperCase(),
      })),
    async () =>
      serverFn(
        { id: 'noContent', method: 'POST' },
        async () =>
          new Response(null, { status: 204, headers: { 'x-done': '1' } }),
      ),
  ],
  pageEndpoints: {
    '/api/_analog/pages/users/:id': async () => ({
      load: ({
        params,
        res,
      }: {
        params: { id: string };
        res: ServerResponse;
      }) => {
        res.setHeader('x-load', params.id);
        return { id: params.id };
      },
    }),
  },
};

function nodeContext() {
  const req = new IncomingMessage(new Socket());
  req.headers = { host: 'localhost:3000' };
  return { req, res: new ServerResponse(req) };
}

describe('createAnalogRequestHandler', () => {
  beforeEach(() => {
    serverFnRegistry.clear();
    Object.assign(ANALOG_SERVER_MANIFEST, manifest);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const key of Object.keys(ANALOG_SERVER_MANIFEST)) {
      delete ANALOG_SERVER_MANIFEST[key as keyof AnalogServerManifest];
    }
  });

  it('returns null for requests Analog does not own', async () => {
    const handle = createAnalogRequestHandler();

    expect(await handle(new Request(`${origin}/api/health`))).toBeNull();
    expect(
      await handle(new Request(`${origin}/about`, { method: 'POST' })),
    ).toBeNull();
    expect(
      await handle(new Request(`${origin}/api/_analog/pages/unknown`)),
    ).toBeNull();
  });

  it('renders pages with the status and headers the app set', async () => {
    const response = await createAnalogRequestHandler()(
      new Request(`${origin}/missing`),
    );

    expect(response?.status).toBe(404);
    expect(response?.headers.get('x-rendered')).toBe('/missing');
    expect(await response?.text()).toContain('<p>/missing</p>');
  });

  it('streams pages uncached and unbuffered until the request aborts', async () => {
    let signal: AbortSignal | undefined;
    ANALOG_SERVER_MANIFEST.render =
      async () => async (_url, _document, context) => {
        signal = context.signal;
        return new ReadableStream({
          start: (controller) =>
            controller.enqueue(new TextEncoder().encode('<html>shell')),
        });
      };
    const client = new AbortController();

    const response = await createAnalogRequestHandler()(
      new Request(`${origin}/streamed`, { signal: client.signal }),
    );
    const { value } = await response!.body!.getReader().read();

    expect(new TextDecoder().decode(value)).toBe('<html>shell');
    expect(response?.headers.get('cache-control')).toBe(
      'no-store, no-transform',
    );
    expect(response?.headers.get('content-encoding')).toBe('identity');
    expect(signal?.aborted).toBe(false);
    client.abort();
    expect(signal?.aborted).toBe(true);
  });

  it('serves page endpoints with route params', async () => {
    const response = await createAnalogRequestHandler()(
      new Request(`${origin}/api/_analog/pages/users/42`),
    );

    expect(await response?.json()).toEqual({ id: '42' });
    expect(response?.headers.get('x-load')).toBe('42');
  });

  it("uses the host's own response when given a context", async () => {
    const context = nodeContext();
    const response = await createAnalogRequestHandler()(
      new Request(`${origin}/api/_analog/pages/users/7`),
      context,
    );

    expect(context.res.getHeader('x-load')).toBe('7');
    expect(response?.headers.get('x-load')).toBeNull();
  });

  it('serves same-origin server fetches in-process, whatever the Host', async () => {
    const network = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('network'));
    ANALOG_SERVER_MANIFEST.render =
      async () =>
      async (_url, _document, { fetch }) => {
        const page = await fetch!('/api/_analog/pages/users/1');
        const health = await fetch!('/api/health');
        return JSON.stringify([page, health]);
      };
    const handle = createAnalogRequestHandler({
      fetch: async (request) => Response.json(new URL(request.url).pathname),
    });

    const response = await handle(new Request('http://internal.invalid/'));

    expect(await response?.json()).toEqual([{ id: '1' }, '/api/health']);
    expect(network).not.toHaveBeenCalled();
  });

  it('keeps absolute URLs from BASE_URL in-process behind a proxy', async () => {
    const network = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('network'));
    ANALOG_SERVER_MANIFEST.render =
      async () =>
      async (_url, _document, { fetch }) =>
        JSON.stringify(
          await fetch!('https://app.example/api/_analog/pages/users/2'),
        );

    const response = await createAnalogRequestHandler()(
      new Request(`${origin}/`, {
        headers: {
          'x-forwarded-proto': 'https',
          'x-forwarded-host': 'app.example',
        },
      }),
    );

    expect(await response?.json()).toEqual({ id: '2' });
    expect(network).not.toHaveBeenCalled();
  });

  it('dispatches server functions with a JSON body', async () => {
    const handle = createAnalogRequestHandler();
    const call = (body: string) =>
      handle(
        new Request(`${origin}/_analog/fn/shout`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', origin },
          body,
        }),
      );

    const response = await call(JSON.stringify({ text: 'analog' }));
    expect(response?.status).toBe(200);
    expect(await response?.json()).toEqual({ text: 'ANALOG' });

    const malformed = await call('{bad');
    expect(malformed?.status).toBe(400);
    expect(await malformed?.json()).toEqual({
      message: 'Malformed request body',
    });
  });

  it('returns an empty body for null-body statuses', async () => {
    const response = await createAnalogRequestHandler()(
      new Request(`${origin}/_analog/fn/noContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin },
      }),
    );

    expect(response?.status).toBe(204);
    expect(response?.headers.get('x-done')).toBe('1');
    expect(response?.body).toBeNull();
  });

  it('reports a failing server config only on server function requests', async () => {
    ANALOG_SERVER_MANIFEST.config = async () => {
      throw new Error('bad config');
    };
    const unhandled = vi.spyOn(console, 'error').mockImplementation(() => {});
    const handle = createAnalogRequestHandler();

    expect(await handle(new Request(`${origin}/api/health`))).toBeNull();
    await new Promise((resolve) => setTimeout(resolve));
    expect(unhandled).not.toHaveBeenCalled();
    await expect(
      handle(new Request(`${origin}/_analog/fn/shout`, { method: 'POST' })),
    ).rejects.toThrow('bad config');
  });

  it('needs the server build to fill in the manifest', () => {
    for (const key of Object.keys(ANALOG_SERVER_MANIFEST)) {
      delete ANALOG_SERVER_MANIFEST[key as keyof AnalogServerManifest];
    }

    expect(() => createAnalogRequestHandler()).toThrow(
      /analog\(\{ server \}\)/,
    );
  });
});

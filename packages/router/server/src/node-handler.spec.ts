import {
  createServer,
  request,
  type IncomingMessage,
  type Server,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAnalogHandler } from './node-handler';
import {
  ANALOG_SERVER_MANIFEST,
  type AnalogServerManifest,
} from './server-manifest';

const manifest: AnalogServerManifest = {
  apiPrefix: 'api',
  template: async () => '<html></html>',
  render: async () => async () => '<html></html>',
  config: async () => ({ providers: [] }),
  serverFnModules: [],
  pageEndpoints: {
    '/api/_analog/pages/form': async () => ({
      action: async ({
        event,
        res,
      }: {
        event: { web?: { request?: Request } };
        res: { setHeader(k: string, v: string[]): void };
      }) => {
        res.setHeader('set-cookie', ['host=1']);
        const form = await event.web!.request!.formData();
        return new Response(JSON.stringify({ email: form.get('email') }), {
          headers: {
            'content-type': 'application/json',
            'set-cookie': 'analog=1',
          },
        });
      },
    }),
  },
};

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk)).on('end', () => resolve(body));
  });
}

describe('createAnalogHandler', () => {
  let server: Server;
  let base: string;
  let errors: unknown[];
  let closed: Set<string>;
  let received: Set<string>;

  beforeEach(async () => {
    Object.assign(ANALOG_SERVER_MANIFEST, manifest);
    errors = [];
    closed = new Set();
    received = new Set();
    const handle = createAnalogHandler();
    server = createServer(async (req, res) => {
      received.add(req.url ?? '');
      res.once('close', () => closed.add(req.url ?? ''));
      // A host whose own setup outlasts the client, as the dev server's can.
      if (req.url === '/late') {
        await new Promise((resolve) => req.socket.once('close', resolve));
      }
      // A body parser that ran first and kept the original bytes.
      if (req.url?.endsWith('?parsed')) {
        (req as { rawBody?: Buffer }).rawBody = Buffer.from(
          await readBody(req),
        );
      }
      // A body parser that ran first and didn't.
      if (req.url?.endsWith('?consumed') || req.url === '/bad-host') {
        await readBody(req);
        handle(req, res, (error) =>
          res.end(error ? `error:${(error as Error).message}` : 'next'),
        );
        return;
      }
      handle(req, res, async (error) => {
        if (error) {
          errors.push(error);
          res.destroy();
          return;
        }
        res.end(`next:${await readBody(req)}`);
      });
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    base = `http://localhost:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
    for (const key of Object.keys(ANALOG_SERVER_MANIFEST)) {
      delete ANALOG_SERVER_MANIFEST[key as keyof AnalogServerManifest];
    }
  });

  it('passes requests it does not own to next() with their body', async () => {
    const response = await fetch(`${base}/api/echo`, {
      method: 'POST',
      body: 'kept',
    });

    expect(await response.text()).toBe('next:kept');
  });

  it("writes Analog's response and keeps cookies the app set on res", async () => {
    const response = await fetch(`${base}/api/_analog/pages/form`, {
      method: 'POST',
      body: new URLSearchParams({ email: 'a@b.dev' }),
    });

    expect(await response.json()).toEqual({ email: 'a@b.dev' });
    expect(response.headers.getSetCookie()).toEqual(['host=1', 'analog=1']);
  });

  it('reads the body from rawBody when a parser ran first', async () => {
    const response = await fetch(`${base}/api/_analog/pages/form?parsed`, {
      method: 'POST',
      body: new URLSearchParams({ email: 'raw@b.dev' }),
    });

    expect(await response.json()).toEqual({ email: 'raw@b.dev' });
  });

  it('streams pages and stops rendering when the client disconnects', async () => {
    let signal: AbortSignal | undefined;
    ANALOG_SERVER_MANIFEST.render =
      async () => async (_url, _document, context) => {
        signal = context.signal;
        // A render that never finishes on its own.
        return new ReadableStream({
          start: (controller) =>
            controller.enqueue(new TextEncoder().encode('<html>shell')),
        });
      };
    const client = new AbortController();

    const response = await fetch(`${base}/streamed`, { signal: client.signal });
    const { value } = await response.body!.getReader().read();
    expect(new TextDecoder().decode(value)).toBe('<html>shell');
    expect(signal?.aborted).toBe(false);

    client.abort();
    await vi.waitFor(() => expect(signal?.aborted).toBe(true));
    expect(errors).toEqual([]);
  });

  it('aborts a render whose client disconnected while it was loading', async () => {
    let loading = false;
    let release!: () => void;
    const loaded = new Promise<void>((resolve) => (release = resolve));
    let signal: AbortSignal | undefined;
    ANALOG_SERVER_MANIFEST.render = async () => {
      loading = true;
      await loaded;
      return async (_url, _document, context) => {
        signal = context.signal;
        // As renderStream() does.
        signal?.throwIfAborted();
        return '<html></html>';
      };
    };
    const client = new AbortController();

    const response = fetch(`${base}/slow`, { signal: client.signal });
    await vi.waitFor(() => expect(loading).toBe(true));
    client.abort();
    await response.catch(() => undefined);
    await vi.waitFor(() => expect(closed.has('/slow')).toBe(true));
    release();

    await vi.waitFor(() => expect(signal?.aborted).toBe(true));
    await new Promise((resolve) => setTimeout(resolve));
    expect(errors).toEqual([]);
  });

  it('aborts a render whose client left before Analog ran', async () => {
    let signal: AbortSignal | undefined;
    ANALOG_SERVER_MANIFEST.render =
      async () => async (_url, _document, context) => {
        signal = context.signal;
        return '<html></html>';
      };
    const client = new AbortController();

    const response = fetch(`${base}/late`, { signal: client.signal });
    await vi.waitFor(() => expect(received.has('/late')).toBe(true));
    client.abort();
    await response.catch(() => undefined);

    await vi.waitFor(() => expect(signal?.aborted).toBe(true));
  });

  it('passes a stream that fails mid-response to next() as an error', async () => {
    ANALOG_SERVER_MANIFEST.render = async () => async () =>
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('<html>'));
          controller.error(new Error('render failed'));
        },
      });

    await fetch(`${base}/failing`)
      .then((response) => response.text())
      .catch(() => undefined);

    await vi.waitFor(() =>
      expect(errors).toEqual([
        expect.objectContaining({ message: 'render failed' }),
      ]),
    );
  });

  it('passes a request it cannot convert to next() as an error', async () => {
    const body = await new Promise<string>((resolve, reject) => {
      request(`${base}/bad-host`, { headers: { host: 'bad host' } }, (res) =>
        readBody(res).then(resolve),
      )
        .on('error', reject)
        .end();
    });

    expect(body).toMatch(/^error:.*URL/);
  });

  it('passes requests on after a parser read the body without keeping it', async () => {
    const init = { method: 'POST', body: 'email=a%40b.dev' };
    const passed = await fetch(`${base}/api/echo?consumed`, init);
    const owned = await fetch(`${base}/api/_analog/pages/form?consumed`, init);

    expect(await passed.text()).toBe('next');
    expect(await owned.text()).toMatch(/^error:.*already read/);
  });
});

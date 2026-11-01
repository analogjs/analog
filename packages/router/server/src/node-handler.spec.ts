import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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

  beforeEach(async () => {
    Object.assign(ANALOG_SERVER_MANIFEST, manifest);
    const handle = createAnalogHandler();
    server = createServer(async (req, res) => {
      // A body parser that ran first and kept the original bytes.
      if (req.url?.endsWith('?parsed')) {
        (req as { rawBody?: Buffer }).rawBody = Buffer.from(
          await readBody(req),
        );
      }
      // A body parser that ran first and didn't.
      if (req.url?.endsWith('?consumed')) {
        await readBody(req);
        handle(req, res, (error) =>
          res.end(error ? `error:${(error as Error).message}` : 'next'),
        );
        return;
      }
      handle(req, res, async () => res.end(`next:${await readBody(req)}`));
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

  it('passes requests on after a parser read the body without keeping it', async () => {
    const init = { method: 'POST', body: 'email=a%40b.dev' };
    const passed = await fetch(`${base}/api/echo?consumed`, init);
    const owned = await fetch(`${base}/api/_analog/pages/form?consumed`, init);

    expect(await passed.text()).toBe('next');
    expect(await owned.text()).toMatch(/^error:.*already read/);
  });
});

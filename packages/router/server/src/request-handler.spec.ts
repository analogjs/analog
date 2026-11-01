import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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

  it('needs the server build to fill in the manifest', () => {
    for (const key of Object.keys(ANALOG_SERVER_MANIFEST)) {
      delete ANALOG_SERVER_MANIFEST[key as keyof AnalogServerManifest];
    }

    expect(() => createAnalogRequestHandler()).toThrow(
      /analog\(\{ server \}\)/,
    );
  });
});

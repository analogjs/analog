// @vitest-environment node
import { createServerFnEventHandler } from './event-handler';
import { serverFn } from './server-fn';
import { serverFnRegistry } from './registry';
import { DestroyRef, Injector, inject } from '@angular/core';
import { nullable, string } from 'valibot';
import { H3, toNodeHandler } from 'nitro/h3';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const parent = Injector.create({ providers: [] });
const app = new H3()
  .all('/_analog/fn/:id', createServerFnEventHandler(parent))
  .all(
    '/_analog/promised/:id',
    createServerFnEventHandler(Promise.resolve(parent)),
  );
const server = createServer(toNodeHandler(app));
const listening = Promise.withResolvers<URL>();
const standardInput = nullable(string());

beforeAll(async () => {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (address === null || typeof address === 'string')
    throw new Error('Expected an allocated loopback TCP port');
  listening.resolve(new URL(`http://127.0.0.1:${address.port}`));
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  parent.destroy();
  serverFnRegistry.clear();
});

describe('server functions over Node HTTP', () => {
  it.each([null, 'text'])(
    'decodes a JSON body and releases the request scope for %j',
    async (input) => {
      const destroyed = vi.fn<() => void>();
      const ref = serverFn(
        { id: 'http-input', input: standardInput },
        (value) => {
          inject(DestroyRef).onDestroy(destroyed);
          return { value };
        },
      );
      const response = await fetch(new URL(ref.url, await listening.promise), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ value: input });
      expect(destroyed).toHaveBeenCalledExactlyOnceWith();
    },
  );

  it('returns a JSON validation error without invoking the handler', async () => {
    const handler = vi.fn<(value: string | null) => string | null>(
      (value) => value,
    );
    const ref = serverFn({ id: 'http-invalid', input: standardInput }, handler);
    const response = await fetch(new URL(ref.url, await listening.promise), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"unexpected":true}',
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toHaveProperty('errors');
    expect(handler).not.toHaveBeenCalled();
  });

  it('preserves a redirect status and Location over the native HTTP adapter', async () => {
    const ref = serverFn(
      { id: 'http-redirect' },
      () =>
        new Response(null, {
          status: 303,
          headers: { Location: '/destination' },
        }),
    );
    const response = await fetch(new URL(ref.url, await listening.promise), {
      redirect: 'manual',
    });
    await response.text();
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/destination');
  });

  it('awaits a promised application injector', async () => {
    serverFn({ id: 'http-promised' }, () => ({ ready: true }));
    const response = await fetch(
      new URL('/_analog/promised/http-promised', await listening.promise),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ready: true });
  });

  it('returns the JSON error contract for malformed JSON', async () => {
    const handler = vi.fn<() => string>(() => 'never');
    const ref = serverFn({ id: 'http-malformed', method: 'POST' }, handler);
    const response = await fetch(new URL(ref.url, await listening.promise), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{invalid',
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      message: 'Malformed request body',
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it('keeps repeated response cookies separate', async () => {
    const ref = serverFn({ id: 'http-cookies' }, () => {
      const headers = new Headers();
      headers.append('set-cookie', 'first=1; Path=/');
      headers.append('set-cookie', 'second=2; Path=/');
      return new Response(null, { status: 204, headers });
    });
    const response = await fetch(new URL(ref.url, await listening.promise));
    await response.text();
    expect(response.status).toBe(204);
    expect(response.headers.getSetCookie()).toEqual([
      'first=1; Path=/',
      'second=2; Path=/',
    ]);
  });
});

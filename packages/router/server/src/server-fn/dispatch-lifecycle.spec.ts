// @vitest-environment node
import { dispatchServerFn } from './dispatch';
import { serverFn } from './server-fn';
import { serverFnRegistry } from './registry';
import { DestroyRef, inject } from '@angular/core';
import { type InferOutput, object, string } from 'valibot';
import { mockEvent } from 'nitro/h3';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';

const standardInput = object({ page: string() });
const sockets: Socket[] = [];

function eventFor(headers: IncomingMessage['headers'] = {}) {
  const socket = new Socket();
  sockets.push(socket);
  const req = new IncomingMessage(socket);
  req.headers = { host: 'qualification.example', ...headers };
  return { node: { req, res: new ServerResponse(req) } };
}

afterEach(() => {
  serverFnRegistry.clear();
  for (const socket of sockets.splice(0)) socket.destroy();
});

describe('native Node dispatcher lifetime', () => {
  it('rejects a GET definition with input rather than silently dropping that input', () => {
    expect(() =>
      serverFn(
        { id: 'invalid-get', method: 'GET', input: standardInput },
        (input) => input.page,
      ),
    ).toThrow('must use POST');
    expect(serverFnRegistry.has('invalid-get')).toBe(false);
  });

  it('enforces transport origin, method, content type and input before invoking the handler', async () => {
    const handler = vi.fn<(input: InferOutput<typeof standardInput>) => string>(
      (input) => input.page,
    );
    serverFn({ id: 'guarded', input: standardInput }, handler);
    const input = { page: 'services' };
    const crossOrigin = await dispatchServerFn(
      'guarded',
      input,
      eventFor({ 'sec-fetch-site': 'cross-site' }),
      { method: 'POST' },
    );
    const wrongMethod = await dispatchServerFn('guarded', input, eventFor(), {
      method: 'GET',
    });
    const wrongType = await dispatchServerFn(
      'guarded',
      input,
      eventFor({ 'content-type': 'text/plain' }),
      { method: 'POST' },
    );
    const invalid = await dispatchServerFn(
      'guarded',
      { page: 5 },
      eventFor({ 'content-type': 'application/json' }),
      { method: 'POST' },
    );
    expect([
      crossOrigin.status,
      wrongMethod.status,
      wrongType.status,
      invalid.status,
    ]).toEqual([403, 405, 415, 400]);
    expect(handler).not.toHaveBeenCalled();
    const http = await dispatchServerFn(
      'guarded',
      input,
      eventFor({ 'content-type': 'application/json' }),
      { method: 'POST' },
    );
    const ssr = await dispatchServerFn('guarded', input, eventFor());
    expect(http).toEqual({ status: 200, body: 'services' });
    expect(ssr).toEqual(http);
  });

  it('releases its request injector after the awaited handler completes', async () => {
    const completion = Promise.withResolvers<string>();
    const destroyed = vi.fn<() => void>();
    serverFn({ id: 'lifetime' }, () => {
      inject(DestroyRef).onDestroy(destroyed);
      return completion.promise;
    });
    const pending = dispatchServerFn('lifetime', undefined, eventFor());
    expect(destroyed).not.toHaveBeenCalled();
    completion.resolve('complete');
    await expect(pending).resolves.toEqual({ status: 200, body: 'complete' });
    expect(destroyed).toHaveBeenCalledExactlyOnceWith();
  });

  it('releases its request injector when the handler fails', async () => {
    const failure = new Error('qualification failure');
    const destroyed = vi.fn<() => void>();
    serverFn({ id: 'failure' }, () => {
      inject(DestroyRef).onDestroy(destroyed);
      return Promise.reject(failure);
    });
    await expect(
      dispatchServerFn('failure', undefined, eventFor()),
    ).rejects.toBe(failure);
    expect(destroyed).toHaveBeenCalledExactlyOnceWith();
  });

  it('retains its request scope while buffering a Response body', async () => {
    const body =
      Promise.withResolvers<ReadableStreamDefaultController<Uint8Array>>();
    const destroyed = vi.fn<() => void>();
    serverFn({ id: 'response' }, () => {
      inject(DestroyRef).onDestroy(destroyed);
      return new Response(
        new ReadableStream<Uint8Array>({
          start: (controller) => body.resolve(controller),
        }),
        { status: 202 },
      );
    });
    const pending = dispatchServerFn('response', undefined, eventFor());
    const controller = await body.promise;
    expect(destroyed).not.toHaveBeenCalled();
    controller.enqueue(new TextEncoder().encode('buffered'));
    controller.close();
    await expect(pending).resolves.toMatchObject({
      status: 202,
      body: 'buffered',
    });
    expect(destroyed).toHaveBeenCalledExactlyOnceWith();
  });

  it('releases its request scope when Response consumption fails', async () => {
    const failure = new Error('body failure');
    const destroyed = vi.fn<() => void>();
    serverFn({ id: 'response-failure' }, () => {
      inject(DestroyRef).onDestroy(destroyed);
      return new Response(
        new ReadableStream({
          start: (controller) => controller.error(failure),
        }),
      );
    });
    await expect(
      dispatchServerFn('response-failure', undefined, eventFor()),
    ).rejects.toBe(failure);
    expect(destroyed).toHaveBeenCalledExactlyOnceWith();
  });

  it('fails explicitly when the target has no Node request context', async () => {
    await expect(
      dispatchServerFn(
        'target-only',
        undefined,
        mockEvent('https://qualification.example'),
      ),
    ).rejects.toThrow('require a Node runtime');
  });
});

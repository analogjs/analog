import { Injector } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Keep h3 real except `readBody`, whose parse-failure path is what the
// malformed-body case exercises — driving that from a plain fake event would
// mean reconstructing h3's raw-body stream internals.
vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3');
  return {
    ...actual,
    readBody: async (event: { __throws?: boolean; _requestBody?: unknown }) => {
      if (event.__throws) {
        throw new SyntaxError('Unexpected token in JSON');
      }
      return event._requestBody;
    },
  };
});

import { handleServerFnRequest } from './event-handler';
import { serverFnRegistry } from './registry';
import { serverFn } from './server-fn';

type FakeRes = {
  statusCode: number;
  headers: Record<string, string | string[]>;
  setHeader(key: string, value: string | string[]): void;
};

function fakeEvent(options: {
  id: string;
  method?: string;
  body?: unknown;
  bodyThrows?: boolean;
  headers?: Record<string, string>;
}) {
  const res: FakeRes = {
    statusCode: 200,
    headers: {},
    setHeader(key, value) {
      this.headers[key] = value;
    },
  };
  return {
    method: options.method ?? 'GET',
    context: { params: { id: options.id } },
    node: {
      req: { headers: options.headers ?? {} },
      res,
    },
    // `readBody(event)` reads `event._requestBody` under h3's unenv shim in
    // tests; model it (and the throwing case) directly.
    _requestBody: options.bodyThrows ? undefined : (options.body ?? undefined),
    __throws: options.bodyThrows,
  } as never;
}

// h3's readBody is hard to drive from a plain object, so exercise the handler
// through a small event whose body accessor we control.
describe('handleServerFnRequest', () => {
  beforeEach(() => serverFnRegistry.clear());

  const jsonHeaders = { 'content-type': 'application/json' };

  it('dispatches a GET and writes the status and body', async () => {
    serverFn({ id: 'read' }, async () => ({ ok: true }));

    const event = fakeEvent({ id: 'read', method: 'GET' });
    const body = await handleServerFnRequest(
      event,
      Injector.create({ providers: [] }),
    );

    expect(body).toEqual({ ok: true });
    expect(
      (event as never as { node: { res: FakeRes } }).node.res.statusCode,
    ).toBe(200);
  });

  it('accepts a promised injector, awaiting it before dispatch', async () => {
    serverFn({ id: 'read2' }, async () => 'ok');

    const event = fakeEvent({ id: 'read2', method: 'GET' });
    const injector = Promise.resolve(Injector.create({ providers: [] }));

    await expect(handleServerFnRequest(event, injector)).resolves.toBe('ok');
  });

  it('propagates response headers onto the h3 response', async () => {
    serverFn({ id: 'redir' }, async () => {
      return new Response(null, {
        status: 302,
        headers: { Location: '/next' },
      });
    });

    const event = fakeEvent({ id: 'redir', method: 'GET' });
    const res = (event as never as { node: { res: FakeRes } }).node.res;

    await handleServerFnRequest(event, Injector.create({ providers: [] }));

    expect(res.statusCode).toBe(302);
    expect(res.headers['location']).toBe('/next');
  });

  it('returns 400 with the JSON error contract when the body is malformed', async () => {
    serverFn({ id: 'write', method: 'POST' }, async () => 'never');

    const event = fakeEvent({
      id: 'write',
      method: 'POST',
      bodyThrows: true,
      headers: jsonHeaders,
    });
    const res = (event as never as { node: { res: FakeRes } }).node.res;

    const body = await handleServerFnRequest(
      event,
      Injector.create({ providers: [] }),
    );

    expect(res.statusCode).toBe(400);
    expect(body).toEqual({ message: 'Malformed request body' });
  });
});

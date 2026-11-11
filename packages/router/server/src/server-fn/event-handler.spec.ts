import { Injector, inject } from '@angular/core';
import { RESPONSE } from '@analogjs/router/tokens';
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

  describe('on h3 v2, which replies from event.res', () => {
    function h3v2Event(options: Parameters<typeof fakeEvent>[0]) {
      const event = fakeEvent(options) as never as {
        res: { status?: number; headers: Headers };
        node: { res: FakeRes };
      };
      event.res = { headers: new Headers() };
      return event;
    }

    it('writes a validation failure status to event.res', async () => {
      const handler = vi.fn();
      serverFn(
        {
          id: 'validated',
          method: 'POST',
          input: {
            '~standard': {
              version: 1,
              vendor: 'test',
              validate: () => ({ issues: [{ message: 'invalid' }] }),
            },
          },
        } as never,
        handler,
      );

      const event = h3v2Event({
        id: 'validated',
        method: 'POST',
        body: { unexpected: true },
        headers: jsonHeaders,
      });
      const body = await handleServerFnRequest(
        event as never,
        Injector.create({ providers: [] }),
      );

      expect(event.res.status).toBe(422);
      expect(body).toHaveProperty('errors');
      expect(handler).not.toHaveBeenCalled();
    });

    it('writes a redirect status and Location to event.res', async () => {
      serverFn({ id: 'redirect' }, async () => {
        return new Response(null, {
          status: 303,
          headers: { Location: '/destination' },
        });
      });

      const event = h3v2Event({ id: 'redirect', method: 'GET' });
      await handleServerFnRequest(
        event as never,
        Injector.create({ providers: [] }),
      );

      expect(event.res.status).toBe(303);
      expect(event.res.headers.get('location')).toBe('/destination');
    });

    it('writes the malformed-body status to event.res', async () => {
      serverFn({ id: 'write2', method: 'POST' }, async () => 'never');

      const event = h3v2Event({
        id: 'write2',
        method: 'POST',
        bodyThrows: true,
        headers: jsonHeaders,
      });
      const body = await handleServerFnRequest(
        event as never,
        Injector.create({ providers: [] }),
      );

      expect(event.res.status).toBe(400);
      expect(body).toEqual({ message: 'Malformed request body' });
    });
  });

  it('serves events without a Node request from their fetch Request', async () => {
    serverFn({ id: 'shout', method: 'POST' }, async (input: unknown) => {
      inject(RESPONSE).setHeader('x-shout', 'yes');
      return (input as { text: string }).text.toUpperCase();
    });

    const response = (await handleServerFnRequest(
      {
        method: 'POST',
        context: { params: { id: 'shout' } },
        req: new Request('http://localhost/_analog/fn/shout', {
          method: 'POST',
          headers: jsonHeaders,
          body: JSON.stringify({ text: 'hi' }),
        }),
      } as never,
      Injector.create({ providers: [] }),
    )) as Response;

    expect(response.status).toBe(200);
    expect(response.headers.get('x-shout')).toBe('yes');
    expect(await response.json()).toBe('HI');
  });
});

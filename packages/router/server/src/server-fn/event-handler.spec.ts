import { Injector, inject } from '@angular/core';
import { REQUEST, RESPONSE, type ServerRequest } from '@analogjs/router/tokens';
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

function fakeEvent(options: {
  id: string;
  method?: string;
  body?: unknown;
  bodyThrows?: boolean;
  headers?: Record<string, string>;
}) {
  return {
    method: options.method ?? 'GET',
    context: { params: { id: options.id } },
    node: {
      req: { headers: options.headers ?? {} },
      res: {},
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

  it('dispatches a GET and returns the status and body as a Response', async () => {
    serverFn({ id: 'read' }, async () => ({ ok: true }));

    const response = await handleServerFnRequest(
      fakeEvent({ id: 'read', method: 'GET' }),
      Injector.create({ providers: [] }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it('accepts a promised injector, awaiting it before dispatch', async () => {
    serverFn({ id: 'read2' }, async () => 'ok');

    const event = fakeEvent({ id: 'read2', method: 'GET' });
    const injector = Promise.resolve(Injector.create({ providers: [] }));

    const response = await handleServerFnRequest(event, injector);
    expect(await response.json()).toBe('ok');
  });

  it('carries a returned Response status and headers on the Node path', async () => {
    serverFn({ id: 'redir' }, async () => {
      return new Response(null, {
        status: 303,
        headers: { Location: '/next' },
      });
    });

    const response = await handleServerFnRequest(
      fakeEvent({ id: 'redir', method: 'GET' }),
      Injector.create({ providers: [] }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/next');
  });

  it('answers invalid input with 422 on the Node path', async () => {
    serverFn(
      {
        id: 'validated',
        method: 'POST',
        input: {
          '~standard': {
            version: 1,
            vendor: 'spec',
            validate: () => ({ issues: [{ message: 'invalid' }] }),
          },
        },
      },
      async () => 'never',
    );

    const response = await handleServerFnRequest(
      fakeEvent({
        id: 'validated',
        method: 'POST',
        body: {},
        headers: jsonHeaders,
      }),
      Injector.create({ providers: [] }),
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      errors: [{ message: 'invalid' }],
    });
  });

  it('returns 400 with the JSON error contract when the body is malformed', async () => {
    serverFn({ id: 'write', method: 'POST' }, async () => 'never');

    const response = await handleServerFnRequest(
      fakeEvent({
        id: 'write',
        method: 'POST',
        bodyThrows: true,
        headers: jsonHeaders,
      }),
      Injector.create({ providers: [] }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      message: 'Malformed request body',
    });
  });

  it('serves events without a Node request from their fetch Request', async () => {
    serverFn({ id: 'shout', method: 'POST' }, async (input: unknown) => {
      inject(RESPONSE).setHeader('x-shout', 'yes');
      return (input as { text: string }).text.toUpperCase();
    });

    const response = await handleServerFnRequest(
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
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('x-shout')).toBe('yes');
    expect(await response.json()).toBe('HI');
  });

  it('exposes the fetch Request and its abort signal on REQUEST', async () => {
    serverFn({ id: 'aborted' }, async () => {
      const req = inject(REQUEST) as ServerRequest & { request: Request };
      return { aborted: req.signal.aborted, url: req.request.url };
    });
    const controller = new AbortController();
    controller.abort();

    const response = await handleServerFnRequest(
      {
        method: 'GET',
        context: { params: { id: 'aborted' } },
        req: new Request('http://localhost/_analog/fn/aborted', {
          signal: controller.signal,
        }),
      } as never,
      Injector.create({ providers: [] }),
    );

    expect(await response.json()).toEqual({
      aborted: true,
      url: 'http://localhost/_analog/fn/aborted',
    });
  });
});

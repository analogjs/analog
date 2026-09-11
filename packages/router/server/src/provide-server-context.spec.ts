import type { ServerRequest } from '../../tokens/src/index.js';
import {
  getBaseUrl,
  getRequestProtocol,
  provideServerContext,
} from './provide-server-context';
import { Injector, inject } from '@angular/core';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { SERVER_FN_DISPATCHER } from '../../src/lib/server-fn/dispatcher';
import { REQUEST, RESPONSE } from '../../tokens/src/index.js';
import { serverFn } from './server-fn/server-fn';
import { serverFnRegistry } from './server-fn/registry';

function createRequest({
  headers = {},
  originalUrl = '/',
  encrypted = false,
}: {
  headers?: Record<string, string | string[] | undefined>;
  originalUrl?: string;
  encrypted?: boolean;
}) {
  return {
    headers,
    originalUrl,
    url: originalUrl,
    connection: { encrypted },
  } as unknown as ServerRequest;
}

describe('provideServerContext', () => {
  it('provides an in-process server-function dispatcher with this request context', async () => {
    const socket = new Socket();
    const req = Object.assign(new IncomingMessage(socket), {
      originalUrl: '/test',
    });
    const res = new ServerResponse(req);
    const parent = Injector.create({
      providers: provideServerContext({ req, res }),
    });
    const fn = serverFn({ id: 'request-provider-test' }, () => ({
      sameRequest: inject(REQUEST) === req,
      sameResponse: inject(RESPONSE) === res,
    }));
    try {
      const dispatcher = parent.get(SERVER_FN_DISPATCHER);
      expect(dispatcher).not.toBeNull();
      expect(await dispatcher!(fn, undefined, parent)).toEqual({
        sameRequest: true,
        sameResponse: true,
      });
    } finally {
      parent.destroy();
      serverFnRegistry.delete(fn.id);
      socket.destroy();
    }
  });
  it('prefers forwarded host and protocol headers', () => {
    const req = createRequest({
      headers: {
        host: 'localhost:4200',
        'x-forwarded-host': 'preview.analogjs.dev',
        'x-forwarded-proto': 'https, http',
      },
      originalUrl: '/notes/',
    });

    expect(getRequestProtocol(req)).toBe('https');
    expect(getBaseUrl(req)).toBe('https://preview.analogjs.dev');
  });

  it('falls back to localhost when the host header is missing', () => {
    const req = createRequest({
      originalUrl: '/notes',
    });

    expect(getBaseUrl(req)).toBe('http://localhost');
  });

  it('can ignore forwarded protocol headers when requested', () => {
    const req = createRequest({
      headers: {
        host: 'analogjs.dev',
        'x-forwarded-proto': 'https',
      },
      encrypted: false,
    });

    expect(getRequestProtocol(req, { xForwardedProto: false })).toBe('http');
  });
});

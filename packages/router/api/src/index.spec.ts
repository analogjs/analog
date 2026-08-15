import { createServer } from 'node:http';
import { defineEventHandler, eventHandler, getRouterParam } from 'h3';
import { serverFn } from '@analogjs/router/server';

import {
  apiRoutesFromFiles,
  createApiRoutesHandler,
  createPageEndpointsHandler,
  createServerFnsHandler,
  createServerMiddlewareHandler,
  pageEndpointRoutesFromFiles,
} from './index';

describe('apiRoutesFromFiles', () => {
  it('maps filenames to routes, params, methods, and catch-alls', () => {
    const routes = apiRoutesFromFiles({
      '/src/server/routes/api/hello.ts': () => Promise.resolve({ default: 0 }),
      '/src/server/routes/api/index.ts': () => Promise.resolve({ default: 0 }),
      '/src/server/routes/api/products/[id].get.ts': () =>
        Promise.resolve({ default: 0 }),
      '/src/server/routes/api/docs/[...slug].ts': () =>
        Promise.resolve({ default: 0 }),
    });

    expect(routes).toEqual([
      expect.objectContaining({ route: '/api/hello', method: undefined }),
      expect.objectContaining({ route: '/api', method: undefined }),
      expect.objectContaining({ route: '/api/products/:id', method: 'GET' }),
      expect.objectContaining({ route: '/api/docs/**', method: undefined }),
    ]);
  });
});

describe('createApiRoutesHandler', () => {
  const handler = createApiRoutesHandler({
    '/src/server/routes/api/hello.ts': () =>
      Promise.resolve({
        default: defineEventHandler(() => ({ message: 'hello' })),
      }),
    '/src/server/routes/api/products/[id].get.ts': () =>
      Promise.resolve({
        default: defineEventHandler((event) => ({
          id: getRouterParam(event, 'id'),
        })),
      }),
  });

  it('matches discovered routes and nothing else', () => {
    expect(handler.matches('/api/hello')).toBe(true);
    expect(handler.matches('/api/products/42')).toBe(true);
    expect(handler.matches('/products/42')).toBe(false);
    expect(handler.matches('/')).toBe(false);
  });

  it('serves handlers with route params over real requests', async () => {
    const server = createServer((req, res) => void handler.handler(req, res));
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    try {
      const hello = await (
        await fetch(`http://localhost:${port}/api/hello`)
      ).json();
      expect(hello).toEqual({ message: 'hello' });

      const product = await (
        await fetch(`http://localhost:${port}/api/products/42`)
      ).json();
      expect(product).toEqual({ id: '42' });
    } finally {
      server.close();
    }
  });
});

describe('pageEndpointRoutesFromFiles', () => {
  it('maps server files to _analog page endpoint routes', () => {
    const routes = pageEndpointRoutesFromFiles({
      '/src/app/pages/feedback.server.ts': () => Promise.resolve({}) as never,
      '/src/app/pages/products/[productId].server.ts': () =>
        Promise.resolve({}) as never,
      '/src/app/pages/blog.[slug].server.ts': () =>
        Promise.resolve({}) as never,
    });

    expect(routes.map((r) => r.route)).toEqual([
      '/api/_analog/pages/feedback',
      '/api/_analog/pages/products/:productId',
      '/api/_analog/pages/blog/:slug',
    ]);
  });
});

describe('createPageEndpointsHandler', () => {
  const handler = createPageEndpointsHandler({
    '/src/app/pages/products/[productId].server.ts': () =>
      Promise.resolve({
        load: ({ params }: { params: Record<string, string> }) => ({
          product: params['productId'],
        }),
        action: () => ({ ok: true }),
      }) as never,
  });

  it('serves load on GET and action on POST with params', async () => {
    expect(handler.matches('/api/_analog/pages/products/7')).toBe(true);
    expect(handler.matches('/api/hello')).toBe(false);

    const server = createServer((req, res) => void handler.handler(req, res));
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    try {
      const loaded = await (
        await fetch(`http://localhost:${port}/api/_analog/pages/products/7`)
      ).json();
      expect(loaded).toEqual({ product: '7' });

      const acted = await (
        await fetch(`http://localhost:${port}/api/_analog/pages/products/7`, {
          method: 'POST',
        })
      ).json();
      expect(acted).toEqual({ ok: true });
    } finally {
      server.close();
    }
  });
});

describe('createServerFnsHandler', () => {
  it('dispatches a registered server function over HTTP', async () => {
    // The id is normally build-derived; supplying it directly stands in
    // for the transform here.
    serverFn({ id: 'testfn0000000000' }, () => ({ hello: 'fn' }));
    const handler = createServerFnsHandler();

    expect(handler.matches('/_analog/fn/testfn0000000000')).toBe(true);
    expect(handler.matches('/api/hello')).toBe(false);

    const server = createServer((req, res) => void handler.handler(req, res));
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    try {
      const result = await (
        await fetch(`http://localhost:${port}/_analog/fn/testfn0000000000`)
      ).json();
      expect(result).toEqual({ hello: 'fn' });
    } finally {
      server.close();
    }
  });
});

describe('createServerMiddlewareHandler', () => {
  it('runs globally, ends the response on redirect, bridges context', async () => {
    const middleware = createServerMiddlewareHandler({
      '/src/server/middleware/test.ts': () =>
        Promise.resolve({
          default: eventHandler((event) => {
            event.context['who'] = 'middleware';
            if (event.node.req.url === '/blocked') {
              event.node.res.statusCode = 302;
              event.node.res.setHeader('location', '/');
              event.node.res.end();
            }
          }),
        }),
    });
    const api = createApiRoutesHandler({
      '/src/server/routes/api/who.ts': () =>
        Promise.resolve({
          default: defineEventHandler((event) => ({
            who: event.context['who'] ?? null,
          })),
        }),
    });

    const server = createServer(
      (req, res) =>
        void (async () => {
          if (await middleware.run(req, res)) return;
          await api.handler(req, res);
        })(),
    );
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    try {
      const blocked = await fetch(`http://localhost:${port}/blocked`, {
        redirect: 'manual',
      });
      expect(blocked.status).toBe(302);
      expect(blocked.headers.get('location')).toBe('/');

      const who = await (
        await fetch(`http://localhost:${port}/api/who`)
      ).json();
      expect(who).toEqual({ who: 'middleware' });
    } finally {
      server.close();
    }
  });
});

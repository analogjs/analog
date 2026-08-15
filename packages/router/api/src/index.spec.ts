import { createServer } from 'node:http';
import { defineEventHandler, getRouterParam } from 'h3';

import { apiRoutesFromFiles, createApiRoutesHandler } from './index';

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

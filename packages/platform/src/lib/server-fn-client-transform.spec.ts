import { describe, expect, it } from 'vitest';

import { scrubServerFnModule } from './server-fn-client-transform';

const PRODUCTS_SERVER = `
import { inject } from '@angular/core';
import { REQUEST } from '@analogjs/router/tokens';
import { serverFn } from '@analogjs/router/server';
import { object, string } from './schema';
import { CatalogService, type Product } from './catalog.service';

export const getProducts = serverFn(
  { id: 'getProducts', method: 'GET' },
  async (): Promise<Product[]> => {
    const catalog = inject(CatalogService);
    inject(REQUEST);
    return catalog.list();
  },
);

export const getProduct = serverFn(
  { id: 'getProduct', input: object({ id: string() }) },
  async (input) => inject(CatalogService).find(input.id),
);
`;

describe('scrubServerFnModule', () => {
  it('returns null for modules with no serverFn', () => {
    expect(scrubServerFnModule(`export const x = 1;`)).toBeNull();
    expect(
      scrubServerFnModule(
        `export default async function load() { return {}; }`,
      ),
    ).toBeNull();
  });

  it('replaces server handlers with client proxies, dropping server imports', () => {
    const result = scrubServerFnModule(PRODUCTS_SERVER, 'products.server.ts');
    expect(result).not.toBeNull();
    const code = result!.code;

    // Proxies keep id + resolved method.
    expect(code).toContain(
      `export const getProducts = createServerFnRef({ id: "getProducts", method: "GET" });`,
    );
    expect(code).toContain(
      `export const getProduct = createServerFnRef({ id: "getProduct", method: "POST" });`,
    );
    // Single client-safe import; no server code survives.
    expect(code).toContain(
      `import { createServerFnRef } from '@analogjs/router';`,
    );
    expect(code).not.toContain('@angular/core');
    expect(code).not.toContain('@analogjs/router/tokens');
    expect(code).not.toContain('@analogjs/router/server');
    expect(code).not.toContain('CatalogService');
    expect(code).not.toContain('inject(');
    expect(code).not.toContain('async');
  });

  it('derives POST from an input schema and GET without one', () => {
    const { proxies } = scrubServerFnModule(PRODUCTS_SERVER)!;
    expect(proxies).toEqual([
      { name: 'getProducts', id: 'getProducts', method: 'GET' },
      { name: 'getProduct', id: 'getProduct', method: 'POST' },
    ]);
  });

  it('honors an explicit method over the input-based default', () => {
    const src = `
      import { serverFn } from '@analogjs/router/server';
      export const search = serverFn(
        { id: 'search', method: 'GET', input: someSchema },
        async () => [],
      );
    `;
    expect(scrubServerFnModule(src)!.proxies[0].method).toBe('GET');
  });

  it('resolves the local name when serverFn is aliased', () => {
    const src = `
      import { serverFn as sf } from '@analogjs/router/server';
      export const ping = sf({ id: 'ping' }, async () => 'pong');
    `;
    const { proxies } = scrubServerFnModule(src)!;
    expect(proxies).toEqual([{ name: 'ping', id: 'ping', method: 'GET' }]);
  });

  it('preserves the load shim when a page file also hosts a server function', () => {
    const src = `
      import { serverFn } from '@analogjs/router/server';
      export const getData = serverFn({ id: 'getData' }, async () => ({}));
      export default async function load() { return { ok: true }; }
    `;
    const result = scrubServerFnModule(src)!;
    expect(result.hadDefaultExport).toBe(true);
    expect(result.code).toContain('export default undefined;');
    expect(result.code).toContain('export const getData = createServerFnRef(');
  });

  it('throws when a server function has no static id', () => {
    const src = `
      import { serverFn } from '@analogjs/router/server';
      export const bad = serverFn({ method: 'GET' }, async () => 1);
    `;
    expect(() => scrubServerFnModule(src)).toThrow(/static string .id./);
  });
});

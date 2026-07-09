import { deriveServerFnId } from '@analogjs/vite-plugin-nitro/server-fn-id';
import { describe, expect, it } from 'vitest';

import { scrubServerFnModule } from './server-fn-client-transform';

const FILE_ID = 'src/app/server-fns/products.server.ts';

const PRODUCTS_SERVER = `
import { inject } from '@angular/core';
import { REQUEST } from '@analogjs/router/tokens';
import { serverFn } from '@analogjs/router/server';
import { object, string } from './schema';
import { CatalogService, type Product } from './catalog.service';

export const getProducts = serverFn(
  { method: 'GET' },
  async (): Promise<Product[]> => {
    const catalog = inject(CatalogService);
    inject(REQUEST);
    return catalog.list();
  },
);

export const getProduct = serverFn(
  { input: object({ id: string() }) },
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
    const result = scrubServerFnModule(PRODUCTS_SERVER, FILE_ID);
    expect(result).not.toBeNull();
    const code = result!.code;

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

  it('derives the id from the file path + export name (never the source)', () => {
    const { proxies } = scrubServerFnModule(PRODUCTS_SERVER, FILE_ID)!;
    expect(proxies).toEqual([
      {
        name: 'getProducts',
        id: deriveServerFnId(FILE_ID, 'getProducts'),
        method: 'GET',
      },
      {
        name: 'getProduct',
        id: deriveServerFnId(FILE_ID, 'getProduct'),
        method: 'POST',
      },
    ]);
    // Opaque digest, not the author name.
    expect(proxies[0].id).not.toBe('getProducts');
    expect(proxies[0].id).toMatch(/^[0-9a-f]{16}$/);
  });

  it('gives different files the same export name different ids', () => {
    const a = scrubServerFnModule(PRODUCTS_SERVER, 'src/a.server.ts')!;
    const b = scrubServerFnModule(PRODUCTS_SERVER, 'src/b.server.ts')!;
    expect(a.proxies[0].id).not.toBe(b.proxies[0].id);
  });

  it('derives POST from an input schema and GET without one', () => {
    const { proxies } = scrubServerFnModule(PRODUCTS_SERVER, FILE_ID)!;
    expect(proxies.map((p) => p.method)).toEqual(['GET', 'POST']);
  });

  it('honors an explicit method for an input-less function', () => {
    const src = `
      import { serverFn } from '@analogjs/router/server';
      export const trigger = serverFn({ method: 'POST' }, async () => []);
    `;
    expect(scrubServerFnModule(src, FILE_ID)!.proxies[0].method).toBe('POST');
  });

  it("rejects method: 'GET' with an input schema at build time", () => {
    const src = `
      import { serverFn } from '@analogjs/router/server';
      export const bad = serverFn({ method: 'GET', input: schema }, async () => 1);
    `;
    expect(() => scrubServerFnModule(src, FILE_ID)).toThrow(
      /GET carries no body/,
    );
  });

  it('resolves the local name when serverFn is aliased', () => {
    const src = `
      import { serverFn as sf } from '@analogjs/router/server';
      export const ping = sf({}, async () => 'pong');
    `;
    const { proxies } = scrubServerFnModule(src, FILE_ID)!;
    expect(proxies[0].name).toBe('ping');
    expect(proxies[0].id).toBe(deriveServerFnId(FILE_ID, 'ping'));
  });

  it('preserves the load shim when a page file also hosts a server function', () => {
    const src = `
      import { serverFn } from '@analogjs/router/server';
      export const getData = serverFn({}, async () => ({}));
      export default async function load() { return { ok: true }; }
    `;
    const result = scrubServerFnModule(src, FILE_ID)!;
    expect(result.hadDefaultExport).toBe(true);
    expect(result.code).toContain('export default undefined;');
    expect(result.code).toContain('export const getData = createServerFnRef(');
  });
});

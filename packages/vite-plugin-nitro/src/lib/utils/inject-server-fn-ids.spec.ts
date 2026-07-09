import { describe, expect, it } from 'vitest';

import { deriveServerFnId } from './derive-server-fn-id';
import { injectServerFnIds } from './inject-server-fn-ids';

const FILE_ID = 'src/app/server-fns/products.server.ts';

describe('injectServerFnIds', () => {
  it('returns null when no server function is present', () => {
    expect(injectServerFnIds(`export const x = 1;`, FILE_ID)).toBeNull();
  });

  it('injects the derived id into each serverFn config, keeping the handler', () => {
    const src = `
import { serverFn } from '@analogjs/router/server';
export const getProducts = serverFn({ method: 'GET' }, async () => list());
export const getProduct = serverFn({ input: schema }, async (i) => find(i.id));
`;
    const result = injectServerFnIds(src, FILE_ID)!;
    const getProductsId = deriveServerFnId(FILE_ID, 'getProducts');
    const getProductId = deriveServerFnId(FILE_ID, 'getProduct');

    expect(result.ids).toEqual([
      { name: 'getProducts', id: getProductsId },
      { name: 'getProduct', id: getProductId },
    ]);
    expect(result.code).toContain(`id: "${getProductsId}", method: 'GET'`);
    expect(result.code).toContain(`id: "${getProductId}", input: schema`);
    // Handlers survive untouched.
    expect(result.code).toContain('async () => list()');
    expect(result.code).toContain('async (i) => find(i.id)');
  });

  it('overwrites a stray author-supplied id with the derived one', () => {
    const src = `
import { serverFn } from '@analogjs/router/server';
export const fn = serverFn({ id: 'guessable', method: 'GET' }, async () => 1);
`;
    const result = injectServerFnIds(src, FILE_ID)!;
    expect(result.code).not.toContain(`'guessable'`);
    expect(result.code).toContain(`id: "${deriveServerFnId(FILE_ID, 'fn')}"`);
  });

  it('resolves an aliased serverFn import', () => {
    const src = `
import { serverFn as sf } from '@analogjs/router/server';
export const ping = sf({}, async () => 'pong');
`;
    const result = injectServerFnIds(src, FILE_ID)!;
    expect(result.ids).toEqual([
      { name: 'ping', id: deriveServerFnId(FILE_ID, 'ping') },
    ]);
    expect(result.code).toContain(
      `{ id: "${deriveServerFnId(FILE_ID, 'ping')}"`,
    );
  });
});

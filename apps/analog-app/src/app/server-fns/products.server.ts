import { inject } from '@angular/core';
import { REQUEST } from '@analogjs/router/tokens';

import { serverFn } from '../server-fn';
import { object, string } from '../server-fn/schema';
import { CatalogService, type Product } from './catalog.service';

/** GET (input-less read) — proves DI (`inject`) inside a server function. */
export const getProducts = serverFn(
  { id: 'getProducts', method: 'GET' },
  async (): Promise<Product[]> => {
    const catalog = inject(CatalogService);
    const req = inject(REQUEST); // request-scoped token resolves
    console.log('[serverFn getProducts] ua:', req?.headers['user-agent']);
    return catalog.list();
  },
);

/** POST (input) — validated with valibot Standard Schema. */
export const getProduct = serverFn(
  { id: 'getProduct', input: object({ id: string() }) },
  async (input): Promise<Product | { notFound: true }> => {
    const catalog = inject(CatalogService);
    return catalog.find(input.id) ?? { notFound: true };
  },
);

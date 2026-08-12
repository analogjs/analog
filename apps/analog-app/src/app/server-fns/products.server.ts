import { inject } from '@angular/core';
import { REQUEST } from '@analogjs/router/tokens';

import { serverFn } from '@analogjs/router/server';

import { object, string } from './schema';
import { CatalogService, type Product } from './catalog.service';

/** GET (input-less read) — handler-only shape; proves DI inside a server fn. */
export const getProducts = serverFn(async (): Promise<Product[]> => {
  const catalog = inject(CatalogService);
  const req = inject(REQUEST); // request-scoped token resolves
  console.log('[serverFn getProducts] ua:', req?.headers['user-agent']);
  return catalog.list();
});

/** POST (input) — schema-first shape; a Standard Schema implies POST + input. */
export const getProduct = serverFn(
  object({ id: string() }),
  async (input): Promise<Product | { notFound: true }> => {
    const catalog = inject(CatalogService);
    return catalog.find(input.id) ?? { notFound: true };
  },
);

import type { PageServerLoad } from '@analogjs/router';

import type { Product } from '../../products';

/** Runs on the server for SSR and is fetched as JSON on client navigations. */
export const load = async ({ fetch }: PageServerLoad) => {
  const products = await fetch<Product[]>('/api/v1/products');
  return { products };
};

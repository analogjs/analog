import { definePageLoad } from '@analogjs/router/server/actions';
import * as v from 'valibot';

import type { Product } from '../../products';

export const load = definePageLoad({
  params: v.object({
    productId: v.pipe(v.string(), v.transform(Number), v.integer()),
  }),
  handler: async ({ params, fetch }) => {
    const products = await fetch<Product[]>('/api/v1/products');
    return {
      product: products.find((p) => p.id === params.productId) ?? null,
    };
  },
});

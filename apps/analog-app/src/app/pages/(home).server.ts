import { setCookie } from 'h3';
import type { PageServerLoad } from '@analogjs/router';

import type { Product } from '../products';

export const load = async ({ fetch, event }: PageServerLoad) => {
  setCookie(event, 'test', 'test');
  const products = await fetch<Product[]>('/api/v1/products');

  return {
    products: products,
  };
};

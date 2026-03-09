import { PageServerLoad } from '@analogjs/router';
import { setCookie } from 'h3';

import { Product } from '../products';

export const load = async ({ fetch, event }: PageServerLoad) => {
  setCookie(event, 'test', 'test', {
    path: '/',
  });
  const products = await fetch<Product[]>('/api/v1/products');

  return {
    products: products,
  };
};

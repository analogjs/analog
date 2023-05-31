import { PageServerLoad } from '@analogjs/router';

import { Product } from '../products';

export const load = async ({ fetch }: PageServerLoad) => {
  const products = await fetch<Product[]>('/api/v1/products');

  return {
    products: products,
  };
};

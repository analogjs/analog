import { PageServerLoad } from '@analogjs/router';
import { setCookie } from 'nitro/h3';

import type { Product } from '../products';
import type { Service } from '../services';

export const load = async ({ fetch, event }: PageServerLoad) => {
  setCookie(event, 'test', 'test', {
    path: '/',
  });
  const products = await fetch<Product[]>('/api/v1/products');
  const services = await fetch<Service[]>('/api/v1/services');

  return {
    products: products,
    services: services,
  };
};

import type { Product } from '../../app/products';

const products: Product[] = [
  {
    id: 1,
    name: 'Signal Mug',
    price: 18,
    description: 'Holds exactly one reactive value.',
  },
  {
    id: 2,
    name: 'Zoneless Hoodie',
    price: 54,
    description: 'No monkey patches, just comfort.',
  },
  {
    id: 3,
    name: 'Hydration Bottle',
    price: 24,
    description: 'Server-rendered, client-refilled.',
  },
];

export function getProducts(): Product[] {
  return products;
}

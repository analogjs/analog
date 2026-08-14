import type { Product } from '../../app/products';
import { getDemoDataSourcePath, readNamedArrayFromSource } from './demo-data';

const PRODUCTS: Product[] = [
  {
    id: 1,
    name: 'Phone XL',
    price: 799,
    description: 'A large phone with one of the best screen',
  },
  {
    id: 2,
    name: 'Phone Mini',
    price: 699,
    description: 'A great phone with one of the best cameras',
  },
  {
    id: 3,
    name: 'Phone Standard',
    price: 299,
    description: '',
  },
];

export const PRODUCTS_SOURCE_PATH = getDemoDataSourcePath('products.ts');

export function getProducts(): Product[] {
  return readNamedArrayFromSource<Product>(
    PRODUCTS_SOURCE_PATH,
    'PRODUCTS',
    PRODUCTS,
  );
}

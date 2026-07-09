import { Injectable } from '@angular/core';

export interface Product {
  id: string;
  name: string;
  price: number;
}

const PRODUCTS: Product[] = [
  { id: 'p1', name: 'Phone XL', price: 799 },
  { id: 'p2', name: 'Phone Mini', price: 699 },
  { id: 'p3', name: 'Phone Standard', price: 299 },
];

/** A plain DI service used by the server functions to prove `inject()` works. */
@Injectable()
export class CatalogService {
  list(): Product[] {
    return PRODUCTS;
  }

  find(id: string): Product | undefined {
    return PRODUCTS.find((p) => p.id === id);
  }
}

export interface Product {
  readonly name: RegExp;
  readonly price: string;
}

export const phones: Record<'mini' | 'standard' | 'xl', Product> = {
  mini: {
    name: /phone mini/i,
    price: '$699.00',
  },
  standard: {
    name: /phone standard/i,
    price: '$299.00',
  },
  xl: {
    name: /phone xl/i,
    price: '$799.00',
  },
};

export const allPhones = Object.values(phones);

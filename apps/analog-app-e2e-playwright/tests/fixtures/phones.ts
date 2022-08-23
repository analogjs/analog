interface Phone {
  name: string;
  price: string;
}

export const phones: Record<'mini' | 'standard' | 'xl', Phone> = {
  mini: {
    name: 'phone mini',
    price: '$699.00',
  },
  standard: {
    name: 'phone standard',
    price: '$299.00',
  },
  xl: {
    name: 'phone xl',
    price: '$799.00',
  },
} as const;

export const allPhones = Object.values(phones);

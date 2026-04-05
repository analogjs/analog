import type { Service } from '../../app/services';
import { getDemoDataSourcePath, readNamedArrayFromSource } from './demo-data';

const SERVICES: Service[] = [
  {
    id: 1,
    name: 'Priority Setup',
    price: 149,
    description: 'White-glove onboarding for a new device or storefront setup.',
  },
  {
    id: 2,
    name: 'Extended Support',
    price: 79,
    description: 'Dedicated troubleshooting and replacement coordination.',
  },
  {
    id: 3,
    name: 'Data Transfer',
    price: 49,
    description: 'Move contacts, photos, and settings onto a new device.',
  },
];

export const SERVICES_SOURCE_PATH = getDemoDataSourcePath('services.ts');

export function getServices(): Service[] {
  return readNamedArrayFromSource<Service>(
    SERVICES_SOURCE_PATH,
    'SERVICES',
    SERVICES,
  );
}

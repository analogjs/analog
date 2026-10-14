import type { PageServerLoad } from '@analogjs/router';
import { getQuery } from 'h3';

export async function load({ event }: PageServerLoad) {
  const searchTerm = String(getQuery(event)['search'] ?? '');
  console.log('loaded search', searchTerm);

  return {
    loaded: true,
    searchTerm,
  };
}

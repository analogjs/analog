import type { PageServerLoad } from '@analogjs/router';

export async function load({ event }: PageServerLoad) {
  const searchTerm = event.url.searchParams.get('search') ?? '';
  console.log('loaded search', searchTerm);

  return {
    loaded: true,
    searchTerm,
  };
}

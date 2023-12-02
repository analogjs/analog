import { PageServerLoad } from '@analogjs/router';

export function load({ params }: PageServerLoad) {
  console.log('slug', params?.['slug']);

  return {
    loaded: true,
  };
}

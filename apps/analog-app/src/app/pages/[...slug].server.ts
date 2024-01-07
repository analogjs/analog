import { PageServerLoad } from '@analogjs/router';

export function load({ params }: PageServerLoad) {
  console.log('params', params);

  return {
    loaded: true,
  };
}

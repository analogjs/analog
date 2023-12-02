import { parseCookies } from 'h3';
import { PageServerLoad } from '@analogjs/router';

export const load = async ({ event }: PageServerLoad) => {
  console.log('shipping');
  const cookies = parseCookies(event);

  console.log('test cookie', cookies['test']);

  return {
    shipping: true,
  };
};

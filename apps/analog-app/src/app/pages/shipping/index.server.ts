import { PageServerLoad } from '@analogjs/router';
import { getCookie } from 'nitro/h3';

export const load = async ({ event }: PageServerLoad) => {
  console.log('shipping');
  const testCookie = getCookie(event, 'test');

  console.log('test cookie', testCookie);

  return {
    shipping: true,
  };
};

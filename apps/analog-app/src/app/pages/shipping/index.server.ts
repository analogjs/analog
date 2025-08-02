import { getCookie } from 'h3';
import { PageServerLoad } from '@analogjs/router';

export const load = async ({ event }: PageServerLoad) => {
  console.log('shipping');

  // In h3 v2, use getCookie instead of parseCookies for better compatibility
  const testCookie = getCookie(event, 'test');
  console.log('test cookie', testCookie);

  return {
    shipping: true,
  };
};

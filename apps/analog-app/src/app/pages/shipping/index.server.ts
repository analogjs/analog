import { PageServerLoad } from '@analogjs/router';

function getCookieValue(cookieHeader: string | null, name: string) {
  if (!cookieHeader) {
    return undefined;
  }

  return cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

export const load = async ({ event }: PageServerLoad) => {
  console.log('shipping');
  const testCookie = getCookieValue(event.req.headers.get('cookie'), 'test');

  console.log('test cookie', testCookie);

  return {
    shipping: true,
  };
};

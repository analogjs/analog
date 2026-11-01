import { PageServerLoad } from '@analogjs/router';

export const load = async ({ res }: PageServerLoad) => {
  // Set on the Node response; fetch-native hosts get it folded into theirs.
  res.setHeader('x-analog-load', 'about');
  return { about: 'About, from a page endpoint' };
};

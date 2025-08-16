import { PageServerLoad } from '@analogjs/router';

export const load = async ({ event }: PageServerLoad) => {
  console.log('[Blog Server] Load function called');

  return {
    message: 'Blog page loaded successfully',
    timestamp: new Date().toISOString(),
  };
};

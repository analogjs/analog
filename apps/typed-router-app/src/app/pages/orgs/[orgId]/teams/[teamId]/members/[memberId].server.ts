import type { PageServerLoad } from '@analogjs/router';

export const load = async ({ params }: PageServerLoad) => {
  const memberId = params?.['memberId'] ?? '';
  return {
    memberId,
    projects: ['router', 'content'].map((name) => `${name}-${memberId}`),
  };
};

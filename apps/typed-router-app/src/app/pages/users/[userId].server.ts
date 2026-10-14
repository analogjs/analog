import type { PageServerLoad } from '@analogjs/router';

import { findUser } from '../../data';

export const load = async ({ params }: PageServerLoad) => {
  const user = findUser(params?.['userId'] ?? null);
  return {
    postCount: user?.posts.length ?? 0,
    renderedAt: new Date().toISOString(),
  };
};

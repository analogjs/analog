import { PageServerLoad } from '@analogjs/router';

export const load = async ({ params, fetch }: PageServerLoad) => {
  return {
    slug: true,
  };
};

export type LoadType = Awaited<ReturnType<typeof load>>;

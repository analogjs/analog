import { PageServerLoad } from '@analogjs/router';
import { defineAction, json } from '@analogjs/router/server/actions';
import * as v from 'valibot';

export const load = async ({ fetch }: PageServerLoad) => {
  const nest = await fetch<{ message: string }>('/api/hello/load');
  return { message: 'Hello from a page endpoint', nest: nest.message };
};

export const action = defineAction({
  schema: v.object({ email: v.pipe(v.string(), v.email()) }),
  handler: async ({ data }) => json({ subscribed: data.email }),
});

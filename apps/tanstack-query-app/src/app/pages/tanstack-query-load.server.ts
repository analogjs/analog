import { definePageLoadQueries } from '@analogjs/router/tanstack-query/server';
import * as v from 'valibot';

const QuerySchema = v.object({
  scope: v.optional(v.pipe(v.string(), v.nonEmpty()), 'default'),
});

export const load = definePageLoadQueries({
  query: QuerySchema,
  handler: async ({ client, fetch, query }) => {
    await client.prefetchQuery({
      queryKey: ['analog-query-load-posts', query.scope] as const,
      queryFn: () =>
        fetch('/api/v1/query-posts', { query: { scope: query.scope } }),
    });
    return { scope: query.scope };
  },
});

import { defineServerRoute } from '@analogjs/router/server/actions';
import * as v from 'valibot';
import { getScopeState } from './_query-todos-state';

const QuerySchema = v.object({
  scope: v.optional(v.pipe(v.string(), v.nonEmpty()), 'default'),
});

export const route = defineServerRoute({
  query: QuerySchema,
  handler: ({ query }) => {
    const state = getScopeState(query.scope);
    state.fetchCount += 1;

    return {
      fetchCount: state.fetchCount,
      items: [...state.items],
    };
  },
});

export default route;

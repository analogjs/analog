import { defineServerRoute } from '@analogjs/router/server/actions';
import * as v from 'valibot';
import { getScopeState } from './_query-comments-state';

const QuerySchema = v.object({
  scope: v.optional(v.pipe(v.string(), v.nonEmpty()), 'default'),
  cursor: v.optional(
    v.pipe(
      v.string(),
      v.regex(/^\d+$/, 'cursor must be a non-negative integer'),
      v.transform(Number),
    ),
    '0',
  ),
  limit: v.optional(
    v.pipe(
      v.string(),
      v.regex(/^[1-9]\d*$/, 'limit must be a positive integer'),
      v.transform(Number),
    ),
    '3',
  ),
});

export const route = defineServerRoute({
  query: QuerySchema,
  handler: ({ query }) => {
    const state = getScopeState(query.scope);
    state.fetchCount += 1;

    const start = query.cursor;
    const end = start + query.limit;
    const items = state.items.slice(start, end);
    const nextCursor = end < state.items.length ? end : null;

    return {
      fetchCount: state.fetchCount,
      items,
      nextCursor,
    };
  },
});

export default route;

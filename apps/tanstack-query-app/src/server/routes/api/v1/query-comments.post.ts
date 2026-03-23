import { defineServerRoute } from '@analogjs/router/server/actions';
import * as v from 'valibot';
import { getScopeState } from './_query-comments-state';
import type { Comment } from './_query-comments-state';

const CreateCommentSchema = v.object({
  scope: v.pipe(v.string(), v.nonEmpty('scope is required')),
  text: v.pipe(v.string(), v.nonEmpty('text is required')),
});

export const route = defineServerRoute({
  body: CreateCommentSchema,
  handler: ({ body }) => {
    const state = getScopeState(body.scope);
    const comment: Comment = {
      id: String(state.items.length + 1),
      text: body.text,
    };

    state.items = [...state.items, comment];

    return {
      created: true as const,
      item: comment,
    };
  },
});

export default route;

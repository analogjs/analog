import { defineServerRoute } from '@analogjs/router/server/actions';
import * as v from 'valibot';
import { getScopeState } from './_query-todos-state';
import type { Todo } from './_query-todos-state';

const CreateTodoSchema = v.object({
  scope: v.pipe(v.string(), v.nonEmpty('scope is required')),
  title: v.pipe(v.string(), v.nonEmpty('title is required')),
});

export const route = defineServerRoute({
  body: CreateTodoSchema,
  handler: ({ body }) => {
    const state = getScopeState(body.scope);
    const todo: Todo = {
      id: String(state.items.length + 1),
      title: body.title,
    };

    state.items = [...state.items, todo];

    return {
      created: true as const,
      item: todo,
    };
  },
});

export default route;

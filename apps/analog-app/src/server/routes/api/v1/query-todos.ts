import { defineServerRoute } from '@analogjs/router/server/actions';
import type { StandardSchemaV1 } from '@standard-schema/spec';

type Todo = {
  id: string;
  title: string;
};

type QueryInput = {
  scope: string;
};

type CreateTodoInput = {
  scope: string;
  title: string;
};

type ScopeState = {
  fetchCount: number;
  items: Todo[];
};

const scopes = new Map<string, ScopeState>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getScopeState(scope: string): ScopeState {
  let state = scopes.get(scope);

  if (!state) {
    state = {
      fetchCount: 0,
      items: [{ id: '1', title: 'Read the Analog docs' }],
    };
    scopes.set(scope, state);
  }

  return state;
}

const QuerySchema: StandardSchemaV1<unknown, QueryInput> = {
  '~standard': {
    version: 1,
    vendor: 'analog-e2e',
    validate: (value) => {
      if (!isRecord(value)) {
        return { value: { scope: 'default' } };
      }

      const scope = value['scope'];
      return {
        value: {
          scope:
            typeof scope === 'string' && scope.length > 0 ? scope : 'default',
        },
      };
    },
  },
};

const CreateTodoSchema: StandardSchemaV1<unknown, CreateTodoInput> = {
  '~standard': {
    version: 1,
    vendor: 'analog-e2e',
    validate: (value) => {
      if (!isRecord(value)) {
        return {
          issues: [
            { message: 'scope is required', path: ['scope'] },
            { message: 'title is required', path: ['title'] },
          ],
        };
      }

      const scope = value['scope'];
      const title = value['title'];

      if (typeof scope !== 'string' || scope.length === 0) {
        return {
          issues: [{ message: 'scope is required', path: ['scope'] }],
        };
      }

      if (typeof title !== 'string' || title.length === 0) {
        return {
          issues: [{ message: 'title is required', path: ['title'] }],
        };
      }

      return { value: { scope, title } };
    },
  },
};

export default defineServerRoute({
  query: QuerySchema,
  body: CreateTodoSchema,
  handler: ({ event, query, body }) => {
    const method = event.method.toUpperCase();

    if (method === 'GET') {
      const state = getScopeState(query.scope);
      state.fetchCount += 1;

      return {
        fetchCount: state.fetchCount,
        items: [...state.items],
      };
    }

    const state = getScopeState(body.scope);
    const todo = {
      id: String(state.items.length + 1),
      title: body.title,
    };

    state.items = [...state.items, todo];

    return {
      created: true,
      item: todo,
    };
  },
});

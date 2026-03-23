import { defineServerRoute } from '@analogjs/router/server/actions';
import type { StandardSchemaV1 } from '@standard-schema/spec';

type Comment = {
  id: string;
  text: string;
};

type QueryInput = {
  scope: string;
  cursor: number;
  limit: number;
};

type CreateCommentInput = {
  scope: string;
  text: string;
};

type ScopeState = {
  fetchCount: number;
  items: Comment[];
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
      items: Array.from({ length: 7 }, (_, i) => ({
        id: String(i + 1),
        text: `Comment ${i + 1}`,
      })),
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
        return { value: { scope: 'default', cursor: 0, limit: 3 } };
      }

      const scope = value['scope'];
      const cursor = value['cursor'];
      const limit = value['limit'];

      return {
        value: {
          scope:
            typeof scope === 'string' && scope.length > 0 ? scope : 'default',
          cursor: typeof cursor === 'string' ? parseInt(cursor, 10) || 0 : 0,
          limit: typeof limit === 'string' ? parseInt(limit, 10) || 3 : 3,
        },
      };
    },
  },
};

const CreateCommentSchema: StandardSchemaV1<unknown, CreateCommentInput> = {
  '~standard': {
    version: 1,
    vendor: 'analog-e2e',
    validate: (value) => {
      if (!isRecord(value)) {
        return {
          issues: [
            { message: 'scope is required', path: ['scope'] },
            { message: 'text is required', path: ['text'] },
          ],
        };
      }

      const scope = value['scope'];
      const text = value['text'];

      if (typeof scope !== 'string' || scope.length === 0) {
        return {
          issues: [{ message: 'scope is required', path: ['scope'] }],
        };
      }

      if (typeof text !== 'string' || text.length === 0) {
        return {
          issues: [{ message: 'text is required', path: ['text'] }],
        };
      }

      return { value: { scope, text } };
    },
  },
};

export default defineServerRoute({
  query: QuerySchema,
  body: CreateCommentSchema,
  handler: ({ event, query, body }) => {
    const method = event.method.toUpperCase();

    if (method === 'GET') {
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
    }

    const state = getScopeState(body.scope);
    const comment: Comment = {
      id: String(state.items.length + 1),
      text: body.text,
    };

    state.items = [...state.items, comment];

    return {
      created: true,
      item: comment,
    };
  },
});

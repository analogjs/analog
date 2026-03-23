import { defineServerRoute } from '@analogjs/router/server/actions';
import * as v from 'valibot';

type Post = {
  id: string;
  title: string;
  author: string;
};

type ScopeState = {
  listFetchCount: number;
  detailFetchCount: number;
  authorFetchCount: number;
  posts: Post[];
};

const scopes = new Map<string, ScopeState>();

const SEED_POSTS: Post[] = [
  { id: '1', title: 'Getting Started with Analog', author: 'Alice' },
  { id: '2', title: 'SSR Made Easy', author: 'Alice' },
  { id: '3', title: 'Query Hydration Deep Dive', author: 'Bob' },
  { id: '4', title: 'Angular Signals Primer', author: 'Carol' },
];

function getScopeState(scope: string): ScopeState {
  let state = scopes.get(scope);

  if (!state) {
    state = {
      listFetchCount: 0,
      detailFetchCount: 0,
      authorFetchCount: 0,
      posts: SEED_POSTS.map((p) => ({ ...p })),
    };
    scopes.set(scope, state);
  }

  return state;
}

const QuerySchema = v.object({
  scope: v.optional(v.pipe(v.string(), v.nonEmpty()), 'default'),
  postId: v.optional(v.string(), ''),
  author: v.optional(v.string(), ''),
});

export const route = defineServerRoute({
  query: QuerySchema,
  handler: ({ query }) => {
    const state = getScopeState(query.scope);

    if (query.postId) {
      state.detailFetchCount += 1;
      const post = state.posts.find((p) => p.id === query.postId);

      return {
        detailFetchCount: state.detailFetchCount,
        post: post ?? null,
      };
    }

    if (query.author) {
      state.authorFetchCount += 1;

      return {
        authorFetchCount: state.authorFetchCount,
        authorPosts: state.posts.filter((p) => p.author === query.author),
      };
    }

    state.listFetchCount += 1;

    return {
      listFetchCount: state.listFetchCount,
      posts: [...state.posts],
    };
  },
});

export default route;

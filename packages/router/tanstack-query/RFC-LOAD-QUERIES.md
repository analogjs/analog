# RFC: Load-time query prefetch for `@analogjs/router/tanstack-query`

**Branch:** `feat/load-queries-tanstack-query` (off `alpha`)
**Status:** Draft — implementation not yet started, awaiting approval
**Scope:** Sub-entry-point only. No new package, no new top-level entry.

---

## Background

`@analogjs/router/tanstack-query` on `alpha` ships three pieces:

| Symbol                                      | Path                                                | Role                                                                                                                                            |
| ------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `provideAnalogQuery()`                      | `tanstack-query/src/provide-analog-query.ts`        | Client-side `ENVIRONMENT_INITIALIZER` that reads `ANALOG_QUERY_STATE_KEY` from `TransferState` and `hydrate(client, state)`s once at bootstrap. |
| `provideServerAnalogQuery()`                | `tanstack-query/src/provide-server-analog-query.ts` | `BEFORE_APP_SERIALIZED` hook that `dehydrate(queryClient)`s into `TransferState` after SSR render.                                              |
| `serverQueryOptions` (+ mutation, infinite) | `tanstack-query/src/server-query.ts`                | Builders that take a typed `ServerRouteHandler` + `HttpClient` and infer `query`/`body`/`result` from the server-route definition.              |

Today's supported flow is **fetch-in-component**:

```ts
// posts.page.ts
readonly posts = injectQuery(() =>
  serverQueryOptions<typeof postsRoute>(this.http, '/api/posts', {
    queryKey: ['posts'],
  }),
);
```

During SSR, the query fires while Angular renders the component tree, the client captures it, `BEFORE_APP_SERIALIZED` dehydrates, the client hydrates on bootstrap, no refetch flash. End-to-end correct, fully typed.

## Problem

There is no **declare-in-load** path. `.server.ts` `load()` handlers live in Nitro (no Angular injector, no `QueryClient`); they can return arbitrary data via `injectLoad()` but cannot prefetch into the TanStack cache. Three real consequences:

1. **Request waterfall.** A component-issued query during SSR is one network hop from the Angular SSR process to the Nitro endpoint. Declaring queries at `load()` time lets them run in-process inside the same H3 handler, in parallel with anything else `load()` does.
2. **No pre-render redirect/404 on query failure.** Once the SSR render starts, headers are committed; a 404 from a component-issued query can't cleanly become a 404 response.
3. **Forces fetch logic into components.** Users wanting Start/Remix-style "data lives with the route" have nowhere to put it.

## Proposal

Add **one helper** and **one router-events hydrator**, both under `@analogjs/router/tanstack-query`. No public API removed or changed.

### 1. `definePageLoadQueries` (server-only)

New file: `packages/router/tanstack-query/server/src/define-page-load-queries.ts`
Re-exported from `packages/router/tanstack-query/server/src/index.ts`.

```ts
import {
  definePageLoad,
  type PageLoadContext,
} from '@analogjs/router/server/actions';
import {
  QueryClient,
  dehydrate,
  type DehydratedState,
} from '@tanstack/angular-query-experimental';
import type { StandardSchemaV1 } from '@standard-schema/spec';

export const ANALOG_QUERIES_KEY = '__analogQueries' as const;

export interface PageLoadQueriesResult<TData> {
  [ANALOG_QUERIES_KEY]: DehydratedState;
  data: TData;
}

export interface DefinePageLoadQueriesOptions<
  TParamsSchema extends StandardSchemaV1 | undefined,
  TQuerySchema extends StandardSchemaV1 | undefined,
  TData,
> {
  params?: TParamsSchema;
  query?: TQuerySchema;
  /**
   * Optional QueryClient factory. Defaults to `new QueryClient()`.
   * Override to set `defaultOptions` (e.g. `queries: { staleTime: Infinity }`).
   */
  client?: () => QueryClient;
  /**
   * Handler receives the standard PageLoadContext plus a per-request
   * QueryClient. Use `client.prefetchQuery` / `ensureQueryData` /
   * `prefetchInfiniteQuery`. Anything you return becomes `data` on the
   * load result; the dehydrated QueryClient becomes `__analogQueries`.
   */
  handler: (
    ctx: PageLoadContext<TParamsSchema, TQuerySchema> & { client: QueryClient },
  ) => Promise<TData> | TData;
}

export function definePageLoadQueries<
  TParamsSchema extends StandardSchemaV1 | undefined = undefined,
  TQuerySchema extends StandardSchemaV1 | undefined = undefined,
  TData = void,
>(options: DefinePageLoadQueriesOptions<TParamsSchema, TQuerySchema, TData>) {
  return definePageLoad({
    params: options.params,
    query: options.query,
    handler: async (ctx) => {
      const client = options.client?.() ?? new QueryClient();
      const data = await options.handler({ ...ctx, client });
      return {
        [ANALOG_QUERIES_KEY]: dehydrate(client),
        data,
      } satisfies PageLoadQueriesResult<TData>;
    },
  });
}
```

**Why not a list-of-queries shorthand?** A factory-returning-options helper (`(ctx) => [queryOptions(...)]`) looks tidier but covers ~70% of cases — it forbids the user from running mutations server-side, doing conditional prefetches, or returning supplemental non-query data. `client.prefetchQuery` is the same primitive TanStack Start uses; ergonomics are fine.

**Per-request isolation.** A fresh `QueryClient` is built per `load()` invocation; never shared across requests. The dehydrated snapshot is the only thing that leaves the handler.

**Validation.** Inherits `params` / `query` Standard Schema validation from `definePageLoad`. If validation fails, the wrapped handler is never called, the `QueryClient` is never constructed, and `definePageLoad` returns its existing `fail(422, issues)` response.

### 2. Router-events hydrator (both client and server)

Update: `packages/router/tanstack-query/src/provide-analog-query.ts`

`provideAnalogQuery()` gains a second initializer that subscribes to `Router.events`. On `ResolveEnd`, it walks the activated snapshot tree, finds any `data['load']?.[ANALOG_QUERIES_KEY]` payloads, and `hydrate`s each into the request-scoped `QueryClient`.

This is run on **both server and client**:

- **Server flow**: Angular's resolver fetches `/_analog/pages/<route>`, which runs the `.server.ts` handler → returns `{ __analogQueries, data }` → router emits `ResolveEnd` → hydrator merges into the in-process `QueryClient` → component tree renders, `injectQuery(postsQuery)` finds the cache warm, no re-fetch → `BEFORE_APP_SERIALIZED` dehydrates the now-merged client into `TransferState`.
- **Client flow on subsequent navigations**: User navigates client-side → Angular resolves → resolver may hit the same `/_analog/pages/...` endpoint (Analog already does this) → result includes `__analogQueries` → hydrator merges. Components rendering on the new route see the cache warm.
- **Client flow on first paint**: Existing `ENVIRONMENT_INITIALIZER` reads the SSR-dehydrated state from `TransferState`. The router event hasn't fired yet at bootstrap, but the SSR dehydrate already captured everything the load merged, so this path is already covered.

The hydrator is idempotent: `hydrate` doesn't clobber a fresher cached entry. Calling it twice for the same key is a no-op.

```ts
// sketch — final code uses DestroyRef for teardown
export function provideAnalogQuery(): EnvironmentProviders {
  return makeEnvironmentProviders([
    // existing client-side TransferState hydration (unchanged)
    {
      provide: ENVIRONMENT_INITIALIZER,
      multi: true,
      useValue: hydrateFromTransferState,
    },
    // new router-events hydrator (runs on both server and client)
    {
      provide: ENVIRONMENT_INITIALIZER,
      multi: true,
      useValue: hydrateFromRouteData,
    },
  ]);
}
```

### 3. Public API surface change

Additions only:

```ts
// @analogjs/router/tanstack-query/server
export {
  definePageLoadQueries,
  ANALOG_QUERIES_KEY,
} from './define-page-load-queries.js';
export type {
  PageLoadQueriesResult,
  DefinePageLoadQueriesOptions,
} from './define-page-load-queries.js';
```

No changes to `provideAnalogQuery` / `provideServerAnalogQuery` signatures. No deprecations.

## User-facing shape

```ts
// src/app/pages/posts.server.ts
import { definePageLoadQueries } from '@analogjs/router/tanstack-query/server';
import { queryOptions } from '@tanstack/angular-query-experimental';

export const postsQuery = queryOptions({
  queryKey: ['posts'],
  queryFn: async ({ signal }) =>
    fetch('https://api.example.com/posts', { signal }).then((r) => r.json()),
});

export const load = definePageLoadQueries({
  handler: async ({ client }) => {
    await client.prefetchQuery(postsQuery);
  },
});
```

```ts
// src/app/pages/posts.page.ts
import { injectQuery } from '@tanstack/angular-query-experimental';
import { postsQuery } from './posts.server';

@Component({
  /* ... */
})
export default class PostsPage {
  readonly posts = injectQuery(() => postsQuery);
}
```

`injectLoad()` continues to work; users wanting the supplemental `data` field call it as today and read `.data`.

## Constraints respected

- **No new packages.** All code lives under `packages/router/tanstack-query/` and its existing `server/` sub-entry.
- **No removed code** ([[feedback_dont_remove_code]]). `provideAnalogQuery` keeps its existing `ENVIRONMENT_INITIALIZER`; the new one is additive.
- **OXC AST not needed** ([[feedback_compiler_use_oxc_ast]]); no compile-time transforms.
- **Standalone vite-plugin-angular preserved** ([[feedback_vpa_standalone]]); no plugin changes.
- **Codegen stays in `@analogjs/platform`** ([[feedback_codegen_in_platform]]); this RFC adds no codegen.
- **Logical commits** ([[feedback_commit_strategy]]):
  1. `feat(router): add definePageLoadQueries helper`
  2. `feat(router): hydrate route-data __analogQueries on ResolveEnd`
  3. `test(router): coverage for definePageLoadQueries + route-data hydration`
  4. `docs(router): tanstack-query load-time prefetch`

## Testing strategy

Following [[feedback_testing_style]] — focused unit tests, no exhaustive edge-case sweep.

1. **`define-page-load-queries.spec.ts`** — builds a load handler, asserts the result has `__analogQueries` (well-formed `DehydratedState`) and `data`; asserts a fresh `QueryClient` per call; asserts validation failure short-circuits before any prefetch.
2. **`provide-analog-query.spec.ts`** (extend existing) — emits a fake `ResolveEnd` with route data containing `__analogQueries`, asserts the test `QueryClient` has the expected keys cached; second `ResolveEnd` with new keys merges (doesn't reset).

No e2e changes in this RFC. A follow-up can extend `apps/tanstack-query-app` once the API is in user hands.

## Open questions

1. **Should the resolver auto-hydrate or require a flag?** Default = auto. Opting out is a niche need; users wanting raw control can call `hydrate(client, state)` manually and not import the new helper.
2. **Streaming / `@defer`.** Out of scope for this RFC; current `dehydrate` semantics suffice for the non-streaming SSR path Analog uses today.
3. **Mutation invalidation across `load` boundaries.** Discussed in the broader Query-integration thread; not part of this RFC. Wait until users hit the gap.

## What this RFC does **not** do

- No new top-level `@analogjs/*` package.
- No `@analogjs/router` API changes outside the `tanstack-query` sub-entry.
- No `@analogjs/platform` changes.
- No changes to `definePageLoad` (it remains the underlying primitive `definePageLoadQueries` delegates to).
- No changes to `serverQueryOptions` / `serverMutationOptions` / `serverInfiniteQueryOptions`.

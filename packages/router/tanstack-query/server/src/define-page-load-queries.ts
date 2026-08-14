import type { StandardSchemaV1 } from '@standard-schema/spec';
import { QueryClient, dehydrate } from '@tanstack/angular-query-experimental';
import type { DehydratedState } from '@tanstack/angular-query-experimental';
import type { H3Event, H3EventContext } from 'nitro/h3';
import type { $Fetch } from 'nitro/types';

import {
  definePageLoad,
  type PageLoadContext,
} from '../../../server/actions/src/index.js';
import { ANALOG_QUERIES_KEY } from '../../src/constants.js';

export { ANALOG_QUERIES_KEY } from '../../src/constants.js';

type NodeContext = NonNullable<H3Event['node']>;
type OptionalSchema = StandardSchemaV1 | undefined;

export interface PageLoadQueriesResult<TData> {
  __analogQueries: DehydratedState;
  data: TData;
}

export interface DefinePageLoadQueriesOptions<
  TParamsSchema extends OptionalSchema,
  TQuerySchema extends OptionalSchema,
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
   * `prefetchInfiniteQuery` to warm the cache; the dehydrated client
   * is returned as `__analogQueries` on the load result. Anything you
   * return from the handler becomes `data` on the same result.
   */
  handler: (
    ctx: PageLoadContext<TParamsSchema, TQuerySchema> & { client: QueryClient },
  ) => Promise<TData> | TData;
}

/**
 * Page load helper that prefetches TanStack Query queries inside the
 * `.server.ts` handler and ships the dehydrated cache alongside any
 * additional data. The router-side hydrator in `provideAnalogQuery()`
 * merges the dehydrated payload into the active `QueryClient` on
 * `ResolveEnd`, so components reading the same query options see a
 * warm cache on first render.
 *
 * @example
 * ```ts
 * // src/app/pages/posts.server.ts
 * import { definePageLoadQueries } from '@analogjs/router/tanstack-query/server';
 * import { queryOptions } from '@tanstack/angular-query-experimental';
 *
 * export const postsQuery = queryOptions({
 *   queryKey: ['posts'],
 *   queryFn: async ({ signal }) =>
 *     fetch('https://api.example.com/posts', { signal }).then((r) => r.json()),
 * });
 *
 * export const load = definePageLoadQueries({
 *   handler: async ({ client }) => {
 *     await client.prefetchQuery(postsQuery);
 *   },
 * });
 * ```
 */
export function definePageLoadQueries<
  TParamsSchema extends OptionalSchema = undefined,
  TQuerySchema extends OptionalSchema = undefined,
  TData = void,
>(
  options: DefinePageLoadQueriesOptions<TParamsSchema, TQuerySchema, TData>,
): (ctx: {
  params: H3EventContext['params'];
  req: NodeContext['req'];
  res: NonNullable<NodeContext['res']>;
  fetch: $Fetch;
  event: H3Event;
}) => Promise<PageLoadQueriesResult<TData> | Response> {
  return definePageLoad({
    params: options.params,
    query: options.query,
    handler: async (ctx): Promise<PageLoadQueriesResult<TData>> => {
      const client = options.client?.() ?? new QueryClient();
      const data = await options.handler({ ...ctx, client });
      return {
        [ANALOG_QUERIES_KEY]: dehydrate(client),
        data,
      };
    },
  });
}

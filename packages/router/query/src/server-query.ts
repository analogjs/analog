import type { HttpClient } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';
import type {
  CreateQueryOptions,
  CreateMutationOptions,
  CreateInfiniteQueryOptions,
  DefaultError,
  InfiniteData,
  QueryKey,
} from '@tanstack/angular-query-experimental';
import type {
  ServerRouteHandler,
  InferRouteQuery,
  InferRouteBody,
  InferRouteResult,
} from '@analogjs/router/server/actions';

function buildUrl(base: string, params?: Record<string, unknown>): string {
  if (!params) return base;
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const k = encodeURIComponent(key);
    if (Array.isArray(value)) {
      for (const item of value) {
        parts.push(`${k}=${encodeURIComponent(String(item))}`);
      }
    } else {
      parts.push(`${k}=${encodeURIComponent(String(value))}`);
    }
  }
  if (parts.length === 0) return base;
  return `${base}?${parts.join('&')}`;
}

export function serverQueryOptions<
  TRoute extends ServerRouteHandler<any, any, any>,
  TError = DefaultError,
  TData = InferRouteResult<TRoute>,
  TQueryKey extends QueryKey = QueryKey,
>(
  http: HttpClient,
  url: string,
  options: { queryKey: TQueryKey; query?: InferRouteQuery<TRoute> } & Omit<
    CreateQueryOptions<InferRouteResult<TRoute>, TError, TData, TQueryKey>,
    'queryKey' | 'queryFn'
  >,
): CreateQueryOptions<InferRouteResult<TRoute>, TError, TData, TQueryKey> {
  const { query, ...rest } = options;
  return {
    ...rest,
    queryFn: () =>
      lastValueFrom(
        http.get<InferRouteResult<TRoute>>(
          buildUrl(url, query as Record<string, any>),
        ),
      ),
  } as CreateQueryOptions<InferRouteResult<TRoute>, TError, TData, TQueryKey>;
}

export function serverMutationOptions<
  TRoute extends ServerRouteHandler<any, any, any>,
  TError = DefaultError,
  TOnMutateResult = unknown,
>(
  http: HttpClient,
  url: string,
  options?: Omit<
    CreateMutationOptions<
      InferRouteResult<TRoute>,
      TError,
      InferRouteBody<TRoute>,
      TOnMutateResult
    >,
    'mutationFn'
  >,
): CreateMutationOptions<
  InferRouteResult<TRoute>,
  TError,
  InferRouteBody<TRoute>,
  TOnMutateResult
> {
  return {
    mutationFn: (body: InferRouteBody<TRoute>) =>
      lastValueFrom(http.post<InferRouteResult<TRoute>>(url, body)),
    ...options,
  } as CreateMutationOptions<
    InferRouteResult<TRoute>,
    TError,
    InferRouteBody<TRoute>,
    TOnMutateResult
  >;
}

export function serverInfiniteQueryOptions<
  TRoute extends ServerRouteHandler<any, any, any>,
  TError = DefaultError,
  TData = InfiniteData<InferRouteResult<TRoute>>,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = unknown,
>(
  http: HttpClient,
  url: string,
  options: {
    queryKey: TQueryKey;
    query: (context: { pageParam: TPageParam }) => InferRouteQuery<TRoute>;
    initialPageParam: TPageParam;
    getNextPageParam: (
      lastPage: InferRouteResult<TRoute>,
      allPages: InferRouteResult<TRoute>[],
    ) => TPageParam | undefined | null;
  } & Omit<
    CreateInfiniteQueryOptions<
      InferRouteResult<TRoute>,
      TError,
      TData,
      TQueryKey,
      TPageParam
    >,
    'queryKey' | 'queryFn' | 'initialPageParam' | 'getNextPageParam'
  >,
): CreateInfiniteQueryOptions<
  InferRouteResult<TRoute>,
  TError,
  TData,
  TQueryKey,
  TPageParam
> {
  const { query: buildQuery, ...rest } = options;
  return {
    ...rest,
    queryFn: (context: { pageParam: TPageParam }) =>
      lastValueFrom(
        http.get<InferRouteResult<TRoute>>(
          buildUrl(url, buildQuery(context) as Record<string, any>),
        ),
      ),
  } as CreateInfiniteQueryOptions<
    InferRouteResult<TRoute>,
    TError,
    TData,
    TQueryKey,
    TPageParam
  >;
}

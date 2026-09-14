import {
  HttpClient,
  HttpErrorResponse,
  provideHttpClient,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  QueryClient,
  QueryObserver,
} from '@tanstack/angular-query-experimental';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerRouteHandler } from '../../server/actions/src/index';
import {
  serverInfiniteQueryOptions,
  serverMutationOptions,
  serverQueryOptions,
} from './server-query';

type Route = ServerRouteHandler<
  { term?: string; tag?: string[]; page?: number; empty?: null },
  { title: string },
  { items: string[]; next: number | null }
>;
const clients: QueryClient[] = [];
function client() {
  const value = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(value);
  return value;
}

beforeEach(() =>
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  }),
);
afterEach(() => {
  for (const value of clients.splice(0)) value.clear();
  TestBed.inject(HttpTestingController).verify();
  TestBed.resetTestingModule();
});

describe('server query HTTP lifecycle', () => {
  it('encodes query values and repeated array keys alongside an existing query', async () => {
    const pending = client().fetchQuery(
      serverQueryOptions<Route>(
        TestBed.inject(HttpClient),
        '/api/items?fixed=yes',
        {
          queryKey: ['items'],
          query: { term: 'a & b', tag: ['x/y', 'two words'], empty: null },
        },
      ),
    );
    TestBed.inject(HttpTestingController)
      .expectOne(
        '/api/items?fixed=yes&term=a%20%26%20b&tag=x%2Fy&tag=two%20words',
      )
      .flush({ items: ['result'], next: null });
    await expect(pending).resolves.toEqual({ items: ['result'], next: null });
  });

  it('unsubscribes the HTTP request when a query is cancelled', async () => {
    const cache = client();
    const pending = cache
      .fetchQuery(
        serverQueryOptions<Route>(TestBed.inject(HttpClient), '/api/items', {
          queryKey: ['items'],
        }),
      )
      .catch((error: unknown) => error);
    const request = TestBed.inject(HttpTestingController).expectOne(
      '/api/items',
    );
    expect(request.request.transferCache).toBe(false);
    await cache.cancelQueries({ queryKey: ['items'] });
    await pending;
    expect(request.cancelled).toBe(true);
    expect(cache.getQueryData(['items'])).toBeUndefined();
  });

  it('unsubscribes the HTTP request when an infinite query is cancelled', async () => {
    const cache = client();
    const pending = cache
      .fetchInfiniteQuery(
        serverInfiniteQueryOptions<
          Route,
          Error,
          { pages: Route['_types']['result'][]; pageParams: number[] },
          readonly ['pages'],
          number
        >(TestBed.inject(HttpClient), '/api/items', {
          queryKey: ['pages'],
          initialPageParam: 0,
          query: ({ pageParam }) => ({ page: pageParam }),
          getNextPageParam: (page) => page.next,
        }),
      )
      .catch((error: unknown) => error);
    const request = TestBed.inject(HttpTestingController).expectOne(
      '/api/items?page=0',
    );
    expect(request.request.transferCache).toBe(false);
    await cache.cancelQueries({ queryKey: ['pages'] });
    await pending;
    expect(request.cancelled).toBe(true);
    expect(cache.getQueryData(['pages'])).toBeUndefined();
  });

  it('aborts the HTTP request when its last observer unsubscribes', () => {
    const observer = new QueryObserver(
      client(),
      serverQueryOptions<Route>(TestBed.inject(HttpClient), '/api/items', {
        queryKey: ['items'],
      }),
    );
    const unsubscribe = observer.subscribe(() => {});
    const request = TestBed.inject(HttpTestingController).expectOne(
      '/api/items',
    );
    unsubscribe();
    expect(request.cancelled).toBe(true);
  });

  it('retains HTTP failure status and does not cache an error as data', async () => {
    const cache = client();
    const pending = cache.fetchQuery(
      serverQueryOptions<Route>(TestBed.inject(HttpClient), '/api/items', {
        queryKey: ['items'],
      }),
    );
    TestBed.inject(HttpTestingController)
      .expectOne('/api/items')
      .flush(
        { message: 'unavailable' },
        { status: 503, statusText: 'Unavailable' },
      );
    await expect(pending).rejects.toMatchObject({
      status: 503,
      error: { message: 'unavailable' },
    });
    expect(cache.getQueryData(['items'])).toBeUndefined();
  });

  it('passes the next page parameter through successive infinite requests', async () => {
    const pending = client().fetchInfiniteQuery({
      ...serverInfiniteQueryOptions<
        Route,
        Error,
        { pages: Route['_types']['result'][]; pageParams: number[] },
        readonly ['pages'],
        number
      >(TestBed.inject(HttpClient), '/api/items', {
        queryKey: ['pages'],
        initialPageParam: 0,
        query: ({ pageParam }) => ({ page: pageParam }),
        getNextPageParam: (page) => page.next,
      }),
      pages: 2,
    });
    const requests = TestBed.inject(HttpTestingController);
    requests
      .expectOne('/api/items?page=0')
      .flush({ items: ['first'], next: 1 });
    await vi.waitFor(() =>
      requests
        .expectOne('/api/items?page=1')
        .flush({ items: ['second'], next: null }),
    );
    await expect(pending).resolves.toEqual({
      pages: [
        { items: ['first'], next: 1 },
        { items: ['second'], next: null },
      ],
      pageParams: [0, 1],
    });
  });

  it('sends the mutation body and preserves callback results', async () => {
    const cache = client();
    const onSuccess = vi.fn();
    const mutation = cache.getMutationCache().build(
      cache,
      serverMutationOptions<Route>(TestBed.inject(HttpClient), '/api/items', {
        onSuccess,
      }),
    );
    const pending = mutation.execute({ title: 'new' });
    await vi.waitFor(() => {
      const request = TestBed.inject(HttpTestingController).expectOne(
        '/api/items',
      );
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({ title: 'new' });
      request.flush({ items: ['new'], next: null });
    });
    await expect(pending).resolves.toEqual({ items: ['new'], next: null });
    expect(onSuccess).toHaveBeenCalledOnce();
  });

  it('preserves mutation validation errors without automatic retries', async () => {
    const cache = client();
    const mutation = cache
      .getMutationCache()
      .build(
        cache,
        serverMutationOptions<Route>(TestBed.inject(HttpClient), '/api/items'),
      );
    const pending = mutation
      .execute({ title: '' })
      .catch((error: unknown) => error);
    await vi.waitFor(() =>
      TestBed.inject(HttpTestingController)
        .expectOne('/api/items')
        .flush(
          { issues: ['required'] },
          { status: 422, statusText: 'Unprocessable Content' },
        ),
    );
    const error = await pending;
    expect(error).toBeInstanceOf(HttpErrorResponse);
    expect(error).toMatchObject({
      status: 422,
      error: { issues: ['required'] },
    });
    TestBed.inject(HttpTestingController).expectNone('/api/items');
  });
});

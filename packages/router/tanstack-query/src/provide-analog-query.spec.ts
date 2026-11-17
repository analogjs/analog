import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID, TransferState, makeStateKey } from '@angular/core';
import {
  ResolveEnd,
  Router,
  type ActivatedRouteSnapshot,
  type RouterStateSnapshot,
} from '@angular/router';
import { Subject } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import {
  QueryClient,
  dehydrate,
  provideTanStackQuery,
  withHydrationKey,
} from '@tanstack/angular-query';

import { ANALOG_QUERIES_KEY } from './constants';
import { provideAnalogQuery } from './provide-analog-query';

const QUERY_STATE_KEY =
  makeStateKey<ReturnType<typeof dehydrate>>('test_query_state');

function makeSnapshot(
  data: Record<string, unknown>,
  children: ActivatedRouteSnapshot[] = [],
): ActivatedRouteSnapshot {
  return { data, children } as unknown as ActivatedRouteSnapshot;
}

function emitResolveEnd(
  events: Subject<unknown>,
  root: ActivatedRouteSnapshot,
): void {
  events.next(
    new ResolveEnd(0, '/', '/', { root } as unknown as RouterStateSnapshot),
  );
}

describe('TanStack Query SSR integration', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('hydrates the QueryClient from TransferState using the shared state key', async () => {
    const transferState = new TransferState();
    const queryClient = new QueryClient();
    const seedClient = new QueryClient();

    await seedClient.prefetchQuery({
      queryKey: ['todos'],
      queryFn: async () => ['analog'],
    });

    transferState.set(QUERY_STATE_KEY, dehydrate(seedClient));

    TestBed.configureTestingModule({
      providers: [
        { provide: TransferState, useValue: transferState },
        provideTanStackQuery(
          () => queryClient,
          withHydrationKey('test_query_state'),
        ),
        provideAnalogQuery(),
      ],
    });

    const hydratedClient = TestBed.inject(QueryClient);

    expect(hydratedClient.getQueryData(['todos'])).toEqual(['analog']);
    expect(transferState.hasKey(QUERY_STATE_KEY)).toBe(false);
  });

  it('serializes component-issued queries using TanStack hydration without an Analog server provider', async () => {
    const transferState = new TransferState();
    const queryClient = new QueryClient();

    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'server' },
        { provide: TransferState, useValue: transferState },
        provideTanStackQuery(
          () => queryClient,
          withHydrationKey('test_query_state'),
        ),
      ],
    });
    TestBed.inject(QueryClient);

    queryClient.setQueryData(['todos'], ['analog']);
    expect(transferState.hasKey(QUERY_STATE_KEY)).toBe(false);
    transferState.toJson();

    const dehydratedState = transferState.get(QUERY_STATE_KEY, null);
    expect(dehydratedState?.queries).toHaveLength(1);
    expect(dehydratedState?.queries[0]?.state.data).toEqual(['analog']);
  });

  it('hydrates the QueryClient from route data on ResolveEnd', async () => {
    const events = new Subject<unknown>();
    const queryClient = new QueryClient();

    const seedClient = new QueryClient();
    await seedClient.prefetchQuery({
      queryKey: ['posts'],
      queryFn: async () => [{ id: 1 }],
    });
    const dehydratedState = dehydrate(seedClient);

    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: { events } },
        provideTanStackQuery(
          () => queryClient,
          withHydrationKey('test_query_state'),
        ),
        provideAnalogQuery(),
      ],
    });

    // Force the environment initializers to run.
    TestBed.inject(QueryClient);

    const snapshot = makeSnapshot({
      load: {
        [ANALOG_QUERIES_KEY]: dehydratedState,
        data: undefined,
      },
    });
    emitResolveEnd(events, snapshot);

    expect(queryClient.getQueryData(['posts'])).toEqual([{ id: 1 }]);
  });

  it('walks the snapshot tree and merges dehydrated state from child routes', async () => {
    const events = new Subject<unknown>();
    const queryClient = new QueryClient();

    const rootSeed = new QueryClient();
    await rootSeed.prefetchQuery({
      queryKey: ['user'],
      queryFn: async () => ({ name: 'analog' }),
    });

    const childSeed = new QueryClient();
    await childSeed.prefetchQuery({
      queryKey: ['posts'],
      queryFn: async () => ['a', 'b'],
    });

    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: { events } },
        provideTanStackQuery(
          () => queryClient,
          withHydrationKey('test_query_state'),
        ),
        provideAnalogQuery(),
      ],
    });
    TestBed.inject(QueryClient);

    const child = makeSnapshot({
      load: { [ANALOG_QUERIES_KEY]: dehydrate(childSeed) },
    });
    const root = makeSnapshot(
      { load: { [ANALOG_QUERIES_KEY]: dehydrate(rootSeed) } },
      [child],
    );
    emitResolveEnd(events, root);

    expect(queryClient.getQueryData(['user'])).toEqual({ name: 'analog' });
    expect(queryClient.getQueryData(['posts'])).toEqual(['a', 'b']);
  });

  it('serializes the freshest entry when parent and child prefetch the same queryHash', async () => {
    const events = new Subject<unknown>();
    const queryClient = new QueryClient();
    const transferState = new TransferState();

    // Parent prefetched `['posts']` with stale data.
    const parentSeed = new QueryClient();
    await parentSeed.prefetchQuery({
      queryKey: ['posts'],
      queryFn: async () => ['stale'],
    });

    // Child prefetched the same queryKey with fresher data.
    const childSeed = new QueryClient();
    childSeed.setQueryData(['posts'], ['fresh'], {
      updatedAt: Date.now() + 1,
    });

    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'server' },
        { provide: TransferState, useValue: transferState },
        { provide: Router, useValue: { events } },
        provideTanStackQuery(
          () => queryClient,
          withHydrationKey('test_query_state'),
        ),
        provideAnalogQuery(),
      ],
    });
    TestBed.inject(QueryClient);

    const child = makeSnapshot({
      load: { [ANALOG_QUERIES_KEY]: dehydrate(childSeed) },
    });
    const root = makeSnapshot(
      { load: { [ANALOG_QUERIES_KEY]: dehydrate(parentSeed) } },
      [child],
    );
    emitResolveEnd(events, root);

    transferState.toJson();
    const stored = transferState.get<ReturnType<typeof dehydrate> | null>(
      QUERY_STATE_KEY,
      null,
    );
    expect(stored?.queries).toHaveLength(1);
    expect(stored?.queries[0]?.state.data).toEqual(['fresh']);
  });

  it('serializes route-load and component-issued queries together on the server', async () => {
    const events = new Subject<unknown>();
    const queryClient = new QueryClient();
    const transferState = new TransferState();

    const seedClient = new QueryClient();
    await seedClient.prefetchQuery({
      queryKey: ['posts'],
      queryFn: async () => [{ id: 1 }],
    });
    const dehydratedState = dehydrate(seedClient);

    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'server' },
        { provide: TransferState, useValue: transferState },
        { provide: Router, useValue: { events } },
        provideTanStackQuery(
          () => queryClient,
          withHydrationKey('test_query_state'),
        ),
        provideAnalogQuery(),
      ],
    });
    TestBed.inject(QueryClient);

    emitResolveEnd(
      events,
      makeSnapshot({
        load: { [ANALOG_QUERIES_KEY]: dehydratedState },
      }),
    );

    queryClient.setQueryData(['component-query'], ['component']);
    transferState.toJson();
    const stored = transferState.get<typeof dehydratedState | null>(
      QUERY_STATE_KEY,
      null,
    );
    expect(stored?.queries).toHaveLength(2);
    expect(stored?.queries[0]?.queryKey).toEqual(['posts']);
    expect(stored?.queries[1]?.queryKey).toEqual(['component-query']);
    expect(queryClient.getQueryData(['posts'])).toEqual([{ id: 1 }]);
  });

  it('does not write to TransferState on the client (PLATFORM_ID = browser)', async () => {
    const events = new Subject<unknown>();
    const queryClient = new QueryClient();
    const transferState = new TransferState();

    const seedClient = new QueryClient();
    await seedClient.prefetchQuery({
      queryKey: ['posts'],
      queryFn: async () => [{ id: 1 }],
    });

    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: TransferState, useValue: transferState },
        { provide: Router, useValue: { events } },
        provideTanStackQuery(
          () => queryClient,
          withHydrationKey('test_query_state'),
        ),
        provideAnalogQuery(),
      ],
    });
    TestBed.inject(QueryClient);

    emitResolveEnd(
      events,
      makeSnapshot({
        load: { [ANALOG_QUERIES_KEY]: dehydrate(seedClient) },
      }),
    );

    transferState.toJson();
    expect(transferState.hasKey(QUERY_STATE_KEY)).toBe(false);
    expect(queryClient.getQueryData(['posts'])).toEqual([{ id: 1 }]);
  });

  it('ignores route data without an __analogQueries field', async () => {
    const events = new Subject<unknown>();
    const queryClient = new QueryClient();

    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: { events } },
        provideTanStackQuery(
          () => queryClient,
          withHydrationKey('test_query_state'),
        ),
        provideAnalogQuery(),
      ],
    });
    TestBed.inject(QueryClient);

    // Plain load data — should not crash, should not affect the cache.
    emitResolveEnd(events, makeSnapshot({ load: { user: { id: 1 } } }));
    emitResolveEnd(events, makeSnapshot({}));

    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });
});

import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID, TransferState, makeStateKey } from '@angular/core';
import { BEFORE_APP_SERIALIZED } from '@angular/platform-server';
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
} from '@tanstack/angular-query-experimental';

import { ANALOG_QUERIES_KEY } from './constants';
import {
  ANALOG_QUERY_STATE_KEY,
  provideAnalogQuery,
} from './provide-analog-query';
import { provideServerAnalogQuery } from './provide-server-analog-query';

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

    transferState.set(ANALOG_QUERY_STATE_KEY, dehydrate(seedClient));

    TestBed.configureTestingModule({
      providers: [
        { provide: TransferState, useValue: transferState },
        provideTanStackQuery(queryClient),
        provideAnalogQuery(),
      ],
    });

    const hydratedClient = TestBed.inject(QueryClient);

    expect(hydratedClient.getQueryData(['todos'])).toEqual(['analog']);
    expect(transferState.hasKey(ANALOG_QUERY_STATE_KEY)).toBe(false);
  });

  it('serializes the QueryClient into TransferState on the server hook', async () => {
    const transferState = new TransferState();
    const queryClient = new QueryClient();
    const stateKey = makeStateKey<any>('analog_query_state');

    await queryClient.prefetchQuery({
      queryKey: ['todos'],
      queryFn: async () => ['analog'],
    });

    TestBed.configureTestingModule({
      providers: [
        { provide: TransferState, useValue: transferState },
        provideTanStackQuery(queryClient),
        provideServerAnalogQuery(),
      ],
    });

    const hooks = TestBed.inject(BEFORE_APP_SERIALIZED);
    await hooks[0]?.();

    const dehydratedState = transferState.get(stateKey, null);

    expect(dehydratedState?.queries).toHaveLength(1);
    expect(dehydratedState?.queries[0]?.queryKey).toEqual(['todos']);
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
        provideTanStackQuery(queryClient),
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
        provideTanStackQuery(queryClient),
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

  it('mirrors hydrated load payloads into TransferState on the server', async () => {
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
        provideTanStackQuery(queryClient),
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

    const stored = transferState.get<typeof dehydratedState | null>(
      ANALOG_QUERY_STATE_KEY,
      null,
    );
    expect(stored?.queries).toHaveLength(1);
    expect(stored?.queries[0]?.queryKey).toEqual(['posts']);
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
        provideTanStackQuery(queryClient),
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

    expect(transferState.hasKey(ANALOG_QUERY_STATE_KEY)).toBe(false);
    expect(queryClient.getQueryData(['posts'])).toEqual([{ id: 1 }]);
  });

  it('ignores route data without an __analogQueries field', async () => {
    const events = new Subject<unknown>();
    const queryClient = new QueryClient();

    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: { events } },
        provideTanStackQuery(queryClient),
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

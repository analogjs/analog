import { TestBed } from '@angular/core/testing';
import { TransferState, makeStateKey } from '@angular/core';
import { BEFORE_APP_SERIALIZED } from '@angular/platform-server';
import { afterEach, describe, expect, it } from 'vitest';
import {
  QueryClient,
  dehydrate,
  provideTanStackQuery,
} from '@tanstack/angular-query-experimental';

import {
  ANALOG_QUERY_STATE_KEY,
  provideAnalogQuery,
} from './provide-analog-query';
import { provideServerAnalogQuery } from './provide-server-analog-query';

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
});

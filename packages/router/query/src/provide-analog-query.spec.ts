import { TestBed } from '@angular/core/testing';
import { TransferState, makeStateKey } from '@angular/core';
import { BEFORE_APP_SERIALIZED } from '@angular/platform-server';
import { afterEach, describe, expect, it } from 'vitest';
import { QueryClient, dehydrate } from '@tanstack/angular-query-experimental';

import { provideAnalogQuery } from './provide-analog-query';
import { provideServerAnalogQuery } from './provide-server-analog-query';

describe('provideAnalogQuery', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('hydrates the provided QueryClient from TransferState', async () => {
    const transferState = new TransferState();
    const seedClient = new QueryClient();
    const queryClient = new QueryClient();
    const stateKey = makeStateKey<any>('analog_query_state');

    await seedClient.prefetchQuery({
      queryKey: ['todos'],
      queryFn: async () => ['analog'],
    });

    transferState.set(stateKey, dehydrate(seedClient));

    TestBed.configureTestingModule({
      providers: [
        { provide: TransferState, useValue: transferState },
        provideAnalogQuery(queryClient),
      ],
    });

    const hydratedClient = TestBed.inject(QueryClient);

    expect(hydratedClient.getQueryData(['todos'])).toEqual(['analog']);
    expect(transferState.hasKey(stateKey)).toBe(false);
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
        provideAnalogQuery(queryClient),
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

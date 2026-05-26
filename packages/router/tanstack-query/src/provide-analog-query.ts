import {
  DestroyRef,
  ENVIRONMENT_INITIALIZER,
  PLATFORM_ID,
  TransferState,
  inject,
  makeEnvironmentProviders,
  makeStateKey,
} from '@angular/core';
import type { EnvironmentProviders, StateKey } from '@angular/core';
import { isPlatformServer } from '@angular/common';
import { ResolveEnd, Router } from '@angular/router';
import type { ActivatedRouteSnapshot } from '@angular/router';
import { QueryClient, hydrate } from '@tanstack/angular-query-experimental';
import type { DehydratedState } from '@tanstack/angular-query-experimental';

import { ANALOG_QUERIES_KEY } from './constants.js';

export const ANALOG_QUERY_STATE_KEY: StateKey<DehydratedState> =
  makeStateKey<DehydratedState>('analog_query_state');

export function provideAnalogQuery(): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: ENVIRONMENT_INITIALIZER,
      multi: true,
      useValue() {
        if (import.meta.env.SSR) {
          return;
        }

        const transferState = inject(TransferState);
        const client = inject(QueryClient);
        const dehydratedState = transferState.get<DehydratedState | null>(
          ANALOG_QUERY_STATE_KEY,
          null,
        );

        if (dehydratedState) {
          hydrate(client, dehydratedState);
          transferState.remove(ANALOG_QUERY_STATE_KEY);
        }
      },
    },
    {
      provide: ENVIRONMENT_INITIALIZER,
      multi: true,
      useValue() {
        const router = inject(Router, { optional: true });
        if (!router) {
          return;
        }

        const client = inject(QueryClient);
        const destroyRef = inject(DestroyRef);
        // On the server, also mirror any dehydrated load payloads into
        // `TransferState` so Angular's own serializer can include them in
        // the `ng-state` script — we can't rely on
        // `provideServerAnalogQuery()`'s `BEFORE_APP_SERIALIZED` running
        // before Angular's `TRANSFER_STATE_SERIALIZATION_PROVIDERS`.
        const transferState = isPlatformServer(inject(PLATFORM_ID))
          ? inject(TransferState)
          : null;

        const subscription = router.events.subscribe((event) => {
          if (event instanceof ResolveEnd) {
            mergeRouteSnapshot(event.state.root, client, transferState);
          }
        });

        destroyRef.onDestroy(() => subscription.unsubscribe());
      },
    },
  ]);
}

function mergeRouteSnapshot(
  snapshot: ActivatedRouteSnapshot,
  client: QueryClient,
  transferState: TransferState | null,
): void {
  const load = snapshot.data?.['load'];
  if (load && typeof load === 'object' && ANALOG_QUERIES_KEY in load) {
    const dehydrated = (load as Record<string, unknown>)[ANALOG_QUERIES_KEY] as
      | DehydratedState
      | undefined;
    if (dehydrated) {
      hydrate(client, dehydrated);
      if (transferState) {
        const existing = transferState.get<DehydratedState | null>(
          ANALOG_QUERY_STATE_KEY,
          null,
        );
        transferState.set(
          ANALOG_QUERY_STATE_KEY,
          existing ? mergeDehydrated(existing, dehydrated) : dehydrated,
        );
      }
    }
  }
  for (const child of snapshot.children) {
    mergeRouteSnapshot(child, client, transferState);
  }
}

function mergeDehydrated(
  base: DehydratedState,
  next: DehydratedState,
): DehydratedState {
  // Last-writer-wins on duplicate `queryHash`: child route resolves run
  // after parent resolves, so the later entry is the fresher one and
  // matches `hydrate()`'s own newer-wins semantics for the QueryClient.
  const queriesByHash = new Map(
    base.queries.map((query) => [query.queryHash, query]),
  );
  for (const query of next.queries) {
    queriesByHash.set(query.queryHash, query);
  }
  return {
    mutations: [...base.mutations, ...next.mutations],
    queries: [...queriesByHash.values()],
  };
}

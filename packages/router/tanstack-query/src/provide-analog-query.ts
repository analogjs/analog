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
import {
  QueryClient,
  dehydrate,
  hydrate,
} from '@tanstack/angular-query-experimental';
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
        // Serialize the cache hydrate actually retained. An older child load
        // must not overwrite newer parent or application-prefetched data.
        transferState.set(ANALOG_QUERY_STATE_KEY, dehydrate(client));
      }
    }
  }
  for (const child of snapshot.children) {
    mergeRouteSnapshot(child, client, transferState);
  }
}

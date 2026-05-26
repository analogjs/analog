import {
  DestroyRef,
  ENVIRONMENT_INITIALIZER,
  TransferState,
  inject,
  makeEnvironmentProviders,
  makeStateKey,
} from '@angular/core';
import type { EnvironmentProviders, StateKey } from '@angular/core';
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

        const subscription = router.events.subscribe((event) => {
          if (event instanceof ResolveEnd) {
            mergeRouteSnapshot(event.state.root, client);
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
): void {
  const load = snapshot.data?.['load'];
  if (load && typeof load === 'object' && ANALOG_QUERIES_KEY in load) {
    const dehydrated = (load as Record<string, unknown>)[ANALOG_QUERIES_KEY];
    if (dehydrated) {
      hydrate(client, dehydrated as DehydratedState);
    }
  }
  for (const child of snapshot.children) {
    mergeRouteSnapshot(child, client);
  }
}

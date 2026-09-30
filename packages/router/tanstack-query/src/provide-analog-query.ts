import {
  DestroyRef,
  ENVIRONMENT_INITIALIZER,
  inject,
  makeEnvironmentProviders,
} from '@angular/core';
import type { EnvironmentProviders } from '@angular/core';
import { ResolveEnd, Router } from '@angular/router';
import type { ActivatedRouteSnapshot } from '@angular/router';
import { QueryClient, hydrate } from '@tanstack/angular-query';
import type { DehydratedState } from '@tanstack/angular-query';

import { ANALOG_QUERIES_KEY } from './constants.js';

export function provideAnalogQuery(): EnvironmentProviders {
  return makeEnvironmentProviders([
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
    const dehydrated = (load as Record<string, unknown>)[ANALOG_QUERIES_KEY] as
      | DehydratedState
      | undefined;
    if (dehydrated) {
      hydrate(client, dehydrated);
    }
  }
  for (const child of snapshot.children) {
    mergeRouteSnapshot(child, client);
  }
}

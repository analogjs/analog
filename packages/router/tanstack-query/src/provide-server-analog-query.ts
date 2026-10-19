import {
  ApplicationRef,
  ENVIRONMENT_INITIALIZER,
  TransferState,
  inject,
  makeEnvironmentProviders,
} from '@angular/core';
import type { EnvironmentProviders } from '@angular/core';
import { filter, skipWhile, take } from 'rxjs/operators';
import { QueryClient, dehydrate } from '@tanstack/angular-query-experimental';

import { ANALOG_QUERY_STATE_KEY } from './provide-analog-query';

export function provideServerAnalogQuery(): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: ENVIRONMENT_INITIALIZER,
      multi: true,
      useValue() {
        // Dehydrate the QueryClient into `TransferState` once the app
        // becomes stable POST-RENDER on the server. `renderApplication`
        // awaits `whenStable()` itself before invoking
        // `BEFORE_APP_SERIALIZED` (which is where Angular's
        // `TRANSFER_STATE_SERIALIZATION_PROVIDERS` reads the store and
        // writes the `ng-state` script). Settling our write at the same
        // point — but ahead of Angular's own subscriber — lets the
        // dehydrated cache land in `TransferState` before the serializer
        // snapshots it, so component-issued queries make it to the client
        // without depending on provider declaration order.
        //
        // `skipWhile(stable => stable)` waits past the initial "no
        // pending tasks yet" emission `BehaviorSubject` semantics give
        // us at subscribe time; the next stable transition is the
        // post-render one with all queries settled.
        const appRef = inject(ApplicationRef);
        const queryClient = inject(QueryClient);
        const transferState = inject(TransferState);

        const subscription = appRef.isStable
          .pipe(
            skipWhile((stable) => stable),
            filter((stable) => stable),
            take(1),
          )
          .subscribe(() => {
            transferState.set(ANALOG_QUERY_STATE_KEY, dehydrate(queryClient));
          });

        appRef.onDestroy(() => subscription.unsubscribe());
      },
    },
  ]);
}

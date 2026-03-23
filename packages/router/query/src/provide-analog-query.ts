import {
  ENVIRONMENT_INITIALIZER,
  InjectionToken,
  TransferState,
  inject,
  makeEnvironmentProviders,
  makeStateKey,
} from '@angular/core';
import type { EnvironmentProviders, StateKey } from '@angular/core';
import type {
  DehydratedState,
  QueryFeatures,
} from '@tanstack/angular-query-experimental';
import {
  QueryClient,
  dehydrate,
  hydrate,
  provideTanStackQuery,
} from '@tanstack/angular-query-experimental';

export const ANALOG_QUERY_STATE_KEY: StateKey<DehydratedState> =
  makeStateKey<DehydratedState>('analog_query_state');

export function provideAnalogQuery(
  queryClient: QueryClient | InjectionToken<QueryClient>,
  ...features: QueryFeatures[]
): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideTanStackQuery(queryClient, ...features),
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
  ]);
}

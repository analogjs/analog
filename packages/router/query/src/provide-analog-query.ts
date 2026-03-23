import {
  ENVIRONMENT_INITIALIZER,
  InjectionToken,
  TransferState,
  inject,
  makeEnvironmentProviders,
  makeStateKey,
} from '@angular/core';
import { BEFORE_APP_SERIALIZED } from '@angular/platform-server';
import type { EnvironmentProviders, Provider } from '@angular/core';
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

const ANALOG_QUERY_STATE_KEY =
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

const SERVER_ANALOG_QUERY_PROVIDER: Provider = {
  provide: BEFORE_APP_SERIALIZED,
  multi: true,
  useFactory: (queryClient: QueryClient, transferState: TransferState) => {
    return () => {
      transferState.set(ANALOG_QUERY_STATE_KEY, dehydrate(queryClient));
    };
  },
  deps: [QueryClient, TransferState],
};

export function provideServerAnalogQuery(): EnvironmentProviders {
  return makeEnvironmentProviders([SERVER_ANALOG_QUERY_PROVIDER]);
}

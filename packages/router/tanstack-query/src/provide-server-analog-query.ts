import { TransferState, makeEnvironmentProviders } from '@angular/core';
import type { EnvironmentProviders, Provider } from '@angular/core';
import { BEFORE_APP_SERIALIZED } from '@angular/platform-server';
import { QueryClient, dehydrate } from '@tanstack/angular-query-experimental';

import { ANALOG_QUERY_STATE_KEY } from './provide-analog-query';

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

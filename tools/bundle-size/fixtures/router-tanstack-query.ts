import {
  provideAnalogQuery,
  serverInfiniteQueryOptions,
  serverMutationOptions,
  serverQueryOptions,
} from '@analogjs/router/tanstack-query';

export const routerTanstackQueryFixture = [
  provideAnalogQuery,
  serverInfiniteQueryOptions,
  serverMutationOptions,
  serverQueryOptions,
];

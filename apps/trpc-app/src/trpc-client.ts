import { AppRouter } from './server/trpc/routers';
import { createTrpcClient } from '@analogjs/trpc';
import { inject } from '@angular/core';
import superjson from 'superjson';

export const { provideTrpcClient, TrpcClient, TrpcHeaders } =
  createTrpcClient<AppRouter>({
    url: '/api/trpc',
    options: {
      transformer: superjson,
    },
  });

export function injectTrpcClient() {
  return inject(TrpcClient);
}

import { AppRouter } from './server/trpc/routers';
import { createTrpcClient } from '@analogjs/trpc';
import { inject } from '@angular/core';
import superjson from 'superjson';

export const { provideTRPCClient, tRPCClient } = createTrpcClient<AppRouter>({
  url: 'http://localhost:4205/api/trpc',
  options: {
    transformer: superjson,
  },
});

export function injectTRPCClient() {
  return inject(tRPCClient);
}

import { AppRouter } from './server/trpc/routers';
import { createTrpcClient } from '@analogjs/trpc';
import { inject } from '@angular/core';

export const { provideTRPCClient, tRPCClient } = createTrpcClient<AppRouter>({
  url: 'http://127.0.0.1:4200/api/trpc',
});

export function injectTRPCClient() {
  return inject(tRPCClient);
}

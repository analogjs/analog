import { InjectionToken, Provider, TransferState } from '@angular/core';
import 'isomorphic-fetch';
import { httpBatchLink } from '@trpc/client';
import { AnyRouter } from '@trpc/server';
import { transferStateLink } from './links/transfer-state-link';
import {
  provideTrpcCacheState,
  provideTrpcCacheStateStatusManager,
  tRPC_CACHE_STATE,
} from './cache-state';
import { createTRPCRxJSProxyClient } from './trpc-rxjs-proxy';
import { CreateTRPCClientOptions } from '@trpc/client/src/createTRPCUntypedClient';

export type TrpcOptions<T extends AnyRouter> = {
  url: string;
  options?: Partial<CreateTRPCClientOptions<T>>;
};

export type TrpcClient<AppRouter extends AnyRouter> = ReturnType<
  typeof createTRPCRxJSProxyClient<AppRouter>
>;
const tRPC_INJECTION_TOKEN = new InjectionToken<unknown>(
  '@analogjs/trpc proxy client'
);
export const createTrpcClient = <AppRouter extends AnyRouter>({
  url,
  options,
}: TrpcOptions<AppRouter>) => {
  const provideTRPCClient = (): Provider[] => [
    provideTrpcCacheState(),
    provideTrpcCacheStateStatusManager(),
    {
      provide: tRPC_INJECTION_TOKEN,
      useFactory: () => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore TODO: figure out why TS is complaining
        return createTRPCRxJSProxyClient<AppRouter>({
          transformer: options?.transformer,
          links: [
            ...(options?.links ?? []),
            transferStateLink(),
            httpBatchLink({
              url: url ?? '',
            }),
          ],
        });
      },
      deps: [tRPC_CACHE_STATE, TransferState],
    },
  ];
  return {
    tRPCClient: tRPC_INJECTION_TOKEN as InjectionToken<TrpcClient<AppRouter>>,
    provideTRPCClient,
  };
};

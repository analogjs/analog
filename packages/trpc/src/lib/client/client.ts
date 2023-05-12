/**
 * Inspired by this awesome project to integrate trpc more into the angular way
 * of doing things https://github.com/Dafnik/ngx-trpc
 */
import { InjectionToken, Provider, TransferState } from '@angular/core';
import 'isomorphic-fetch';
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import { AnyRouter } from '@trpc/server';
import { transferStateLink } from './links/transfer-state-link';
import {
  provideTrpcCacheState,
  provideTrpcCacheStateStatusManager,
  tRPC_CACHE_STATE,
} from './cache-state';
import { CreateTRPCClientOptions } from '@trpc/client/src/createTRPCUntypedClient';

export type TrpcOptions<T extends AnyRouter> = {
  url: string;
  options?: Partial<CreateTRPCClientOptions<T>>;
};

export type TrpcClient<AppRouter extends AnyRouter> = ReturnType<
  typeof createTRPCProxyClient<AppRouter>
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
        return createTRPCProxyClient<AppRouter>({
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

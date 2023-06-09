import { InjectionToken, Provider, signal, TransferState } from '@angular/core';
import 'isomorphic-fetch';
import { httpBatchLink, HttpBatchLinkOptions } from '@trpc/client';
import { AnyRouter } from '@trpc/server';
import { transferStateLink } from './links/transfer-state-link';
import {
  provideTrpcCacheState,
  provideTrpcCacheStateStatusManager,
  tRPC_CACHE_STATE,
} from './cache-state';
import { createTRPCRxJSProxyClient } from './trpc-rxjs-proxy';
import { CreateTRPCClientOptions } from '@trpc/client/src/createTRPCUntypedClient';
import { HTTPHeaders } from '@trpc/client/src/links/types';

export type TrpcOptions<T extends AnyRouter> = {
  url: string;
  options?: Partial<CreateTRPCClientOptions<T>>;
  batchLinkOptions?: Omit<HttpBatchLinkOptions, 'url' | 'headers'>;
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
  batchLinkOptions,
}: TrpcOptions<AppRouter>) => {
  const TrpcHeaders = signal<HTTPHeaders>({});
  const provideTrpcClient = (): Provider[] => [
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
              ...(batchLinkOptions ?? {}),
              headers() {
                return TrpcHeaders();
              },
              url: url ?? '',
            }),
          ],
        });
      },
      deps: [tRPC_CACHE_STATE, TransferState],
    },
  ];
  const TrpcClient = tRPC_INJECTION_TOKEN as InjectionToken<
    TrpcClient<AppRouter>
  >;
  return {
    TrpcClient,
    provideTrpcClient,
    TrpcHeaders,
    /** @deprecated use TrpcClient instead */
    tRPCClient: TrpcClient,
    /** @deprecated use provideTrpcClient instead */
    provideTRPCClient: provideTrpcClient,
    /** @deprecated use TrpcHeaders instead */
    tRPCHeaders: TrpcHeaders,
  };
};

import { InjectionToken, Provider, TransferState } from "@angular/core";
import "isomorphic-fetch";
import { httpBatchLink } from "@trpc/client";
import { AnyRouter } from "@trpc/server";
import { transferStateLink } from "../links/transfer-state-link";
import { provideTrpcCacheState, provideTrpcCacheStateStatusManager, tRPC_CACHE_STATE } from "../cache-state";
import { createTRPCRxJSProxyClient } from "./trpc-rxjs-proxy";
import { TrpcOptions } from "../client-shared";

export type TrpcClient$<AppRouter extends AnyRouter> = ReturnType<
  typeof createTRPCRxJSProxyClient<AppRouter>
>;

const tRPC$_INJECTION_TOKEN = new InjectionToken<unknown>(
  '@analogjs/trpc rxjs proxy client'
);
export const createTrpcClient$ = <AppRouter extends AnyRouter>({
  url,
  options,
}: TrpcOptions<AppRouter>) => {
  const provideTRPCClient = (): Provider[] => [
    provideTrpcCacheState(),
    provideTrpcCacheStateStatusManager(),
    {
      provide: tRPC$_INJECTION_TOKEN,
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
    tRPCClient: tRPC$_INJECTION_TOKEN as InjectionToken<TrpcClient$<AppRouter>>,
    provideTRPCClient,
  };
};

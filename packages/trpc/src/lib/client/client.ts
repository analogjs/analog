import { InjectionToken, Provider, signal, TransferState } from '@angular/core';
import 'isomorphic-fetch';
import {
  httpBatchLink,
  HTTPBatchLinkOptions,
  CreateTRPCClientOptions,
  HTTPHeaders,
  TRPCLink,
} from '@trpc/client';
import { AnyRouter } from '@trpc/server';
import { transferStateLink } from './links/transfer-state-link';
import { transformerLink } from './links/transformer-link';
import {
  provideTrpcCacheState,
  provideTrpcCacheStateStatusManager,
  tRPC_CACHE_STATE,
} from './cache-state';
import { createTRPCRxJSProxyClient } from './trpc-rxjs-proxy';

export type TrpcOptions<T extends AnyRouter> = {
  url: string;
  options?: Partial<CreateTRPCClientOptions<T>>;
  batchLinkOptions?: Omit<
    HTTPBatchLinkOptions<T['_def']['_config']['$types']>,
    'url' | 'headers'
  >;
  transformer?: any; // Transformer at top level for better DX
};

export type TrpcClient<AppRouter extends AnyRouter> = ReturnType<
  typeof createTRPCRxJSProxyClient<AppRouter>
>;
const tRPC_INJECTION_TOKEN = new InjectionToken<unknown>(
  '@analogjs/trpc proxy client',
);

function customFetch(
  input: RequestInfo | URL,
  init?: RequestInit & { method: 'GET' },
) {
  if ((globalThis as any).$fetch) {
    return (globalThis as any).$fetch
      .raw(input.toString(), init)
      .catch((e: any) => {
        throw e;
      })
      .then((response: any) => ({
        ...response,
        headers: response.headers,
        json: () => Promise.resolve(response._data),
      }));
  }

  // dev server trpc for analog & nitro
  if (typeof window === 'undefined') {
    const host =
      process.env['NITRO_HOST'] ?? process.env['ANALOG_HOST'] ?? 'localhost';
    const port =
      process.env['NITRO_PORT'] ?? process.env['ANALOG_PORT'] ?? 4205;
    const base = `http://${host}:${port}`;
    if (input instanceof Request) {
      input = new Request(base, input);
    } else {
      input = new URL(input, base);
    }
  }

  return fetch(input, init);
}

export const createTrpcClient = <AppRouter extends AnyRouter>({
  url,
  options,
  batchLinkOptions,
  transformer,
}: TrpcOptions<AppRouter>) => {
  const TrpcHeaders = signal<HTTPHeaders>({});
  const provideTrpcClient = (): Provider[] => [
    provideTrpcCacheState(),
    provideTrpcCacheStateStatusManager(),
    {
      provide: tRPC_INJECTION_TOKEN,
      useFactory: () => {
        const links: TRPCLink<AppRouter>[] = [
          ...(options?.links ?? []),
          ...(transformer ? [transformerLink(transformer)] : []),
          transferStateLink(),
          httpBatchLink<AppRouter>({
            ...(batchLinkOptions ?? {}),
            headers() {
              return TrpcHeaders();
            },
            fetch: customFetch as any,
            url: url ?? '',
            // Remove this line: ...(transformer && { transformer }),
          } as HTTPBatchLinkOptions<AppRouter['_def']['_config']['$types']>),
        ];

        return createTRPCRxJSProxyClient<AppRouter>({
          links,
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

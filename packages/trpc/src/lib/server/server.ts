/**
 * ALl credit goes to the awesome trpc-nuxt plugin https://github.com/wobsoriano/trpc-nuxt
 * Since Analog currently uses Nitro as the underlying server we can
 * simply reuse the hard work done by Robert Soriano and friends
 * **/

import type { ResponseMeta } from '@trpc/server/http';
import { resolveHTTPResponse } from '@trpc/server/http';
import type {
  AnyRouter,
  inferRouterContext,
  inferRouterError,
  ProcedureType,
} from '@trpc/server';
import { TRPCError } from '@trpc/server';
import { createURL } from 'ufo';
import type { H3Event } from 'h3';
import { createError, defineEventHandler, isMethod, readBody } from 'h3';
import type { TRPCResponse } from '@trpc/server/rpc';

type MaybePromise<T> = T | Promise<T>;

export type CreateContextFn<TRouter extends AnyRouter> = (
  event: H3Event
) => MaybePromise<inferRouterContext<TRouter>>;

export interface ResponseMetaFnPayload<TRouter extends AnyRouter> {
  data: TRPCResponse<unknown, inferRouterError<TRouter>>[];
  ctx?: inferRouterContext<TRouter>;
  paths?: string[];
  type: ProcedureType | 'unknown';
  errors: TRPCError[];
}

export type ResponseMetaFn<TRouter extends AnyRouter> = (
  opts: ResponseMetaFnPayload<TRouter>
) => ResponseMeta;

export interface OnErrorPayload<TRouter extends AnyRouter> {
  error: TRPCError;
  type: ProcedureType | 'unknown';
  path: string | undefined;
  req: H3Event['node']['req'];
  input: unknown;
  ctx: undefined | inferRouterContext<TRouter>;
}

export type OnErrorFn<TRouter extends AnyRouter> = (
  opts: OnErrorPayload<TRouter>
) => void;

export interface ResolveHTTPRequestOptions<TRouter extends AnyRouter> {
  router: TRouter;
  createContext?: CreateContextFn<TRouter>;
  responseMeta?: ResponseMetaFn<TRouter>;
  onError?: OnErrorFn<TRouter>;
  batching?: {
    enabled: boolean;
  };
}

function getPath(event: H3Event): string | null {
  const { params } = event.context;

  if (typeof params?.['trpc'] === 'string') {
    return params['trpc'];
  }

  if (params?.['trpc'] && Array.isArray(params['trpc'])) {
    return (params['trpc'] as string[]).join('/');
  }

  return null;
}

export function createTrpcNitroHandler<TRouter extends AnyRouter>({
  router,
  createContext,
  responseMeta,
  onError,
  batching,
}: ResolveHTTPRequestOptions<TRouter>) {
  return defineEventHandler(async (event) => {
    const { req, res } = event.node;

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const $url = createURL(req.url!);

    const path = getPath(event);

    if (path === null) {
      const error = router.getErrorShape({
        error: new TRPCError({
          message:
            'Param "trpc" not found - is the file named `[trpc]`.ts or `[...trpc].ts`?',
          code: 'INTERNAL_SERVER_ERROR',
        }),
        type: 'unknown',
        ctx: undefined,
        path: undefined,
        input: undefined,
      });

      throw createError({
        statusCode: 500,
        statusMessage: JSON.stringify(error),
      });
    }

    const httpResponse = await resolveHTTPResponse({
      batching,
      router,
      req: {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        method: req.method!,
        headers: req.headers,
        body: isMethod(event, 'GET') ? null : await readBody(event),
        query: $url.searchParams,
      },
      path,
      createContext: async () => await createContext?.(event),
      responseMeta,
      onError: (o) => {
        onError?.({
          ...o,
          req,
        });
      },
    });

    const { status, headers, body } = httpResponse;

    res.statusCode = status;

    headers &&
      Object.keys(headers).forEach((key) => {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        res.setHeader(key, headers[key]!);
      });

    return body;
  });
}

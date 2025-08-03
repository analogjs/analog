/**
 * ALl credit goes to the awesome trpc-nuxt plugin https://github.com/wobsoriano/trpc-nuxt
 * Since Analog currently uses Nitro as the underlying server we can
 * simply reuse the hard work done by Robert Soriano and friends
 * **/

import type { ResponseMeta } from '@trpc/server/http';
import { resolveResponse } from '@trpc/server/http';
import type {
  AnyRouter,
  inferRouterContext,
  inferRouterError,
  ProcedureType,
} from '@trpc/server';
import { TRPCError } from '@trpc/server';
import type { H3Event } from 'h3';
import {
  createError,
  defineEventHandler,
  isMethod,
  readBody,
  getRequestURL,
} from 'h3';
import type { TRPCResponse } from '@trpc/server/rpc';

type MaybePromise<T> = T | Promise<T>;

export type CreateContextFn<TRouter extends AnyRouter> = (
  event: H3Event,
) => MaybePromise<inferRouterContext<TRouter>>;

export interface ResponseMetaFnPayload<TRouter extends AnyRouter> {
  data: TRPCResponse<unknown, inferRouterError<TRouter>>[];
  ctx?: inferRouterContext<TRouter>;
  paths?: string[];
  type: ProcedureType | 'unknown';
  errors: TRPCError[];
}

export type ResponseMetaFn<TRouter extends AnyRouter> = (
  opts: ResponseMetaFnPayload<TRouter>,
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
  opts: OnErrorPayload<TRouter>,
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

    // Get the full URL using h3's getRequestURL
    const fullUrl = getRequestURL(event);

    const path = getPath(event);

    if (path === null) {
      throw createError({
        statusCode: 500,
        statusMessage: JSON.stringify({
          message:
            'Param "trpc" not found - is the file named `[trpc]`.ts or `[...trpc].ts`?',
          code: 'INTERNAL_SERVER_ERROR',
        }),
      });
    }

    const body = isMethod(event, 'GET') ? null : await readBody(event);
    const request = new Request(fullUrl, {
      method: req.method!,
      headers: req.headers as HeadersInit,
      body: body ? JSON.stringify(body) : undefined,
    });

    const httpResponse = await resolveResponse({
      batching,
      router,
      req: request,
      path,
      error: null,
      createContext: async () => await createContext?.(event),
      responseMeta: responseMeta as any,
      onError: (o: any) => {
        onError?.({
          ...o,
          req,
        });
      },
    });

    const { status, headers, body: responseBody } = httpResponse;

    res.statusCode = status;

    if (headers) {
      headers.forEach((value, key) => {
        res.setHeader(key, value);
      });
    }

    return responseBody;
  });
}

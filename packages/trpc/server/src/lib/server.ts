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
import { HTTPError, defineHandler } from 'h3';
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

// In h3 v2, event.node is typed as optional since it's only available in
// Node.js contexts. NonNullable unwraps the optional to keep the public type
// compatible with existing consumers.
type NodeContext = NonNullable<H3Event['node']>;

export interface OnErrorPayload<TRouter extends AnyRouter> {
  error: TRPCError;
  type: ProcedureType | 'unknown';
  path: string | undefined;
  req: NodeContext['req'];
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

function getNodeRequestResponse(event: H3Event) {
  const req = event.node?.req;
  const res = event.node?.res;

  if (!req || !res) {
    throw new HTTPError({
      status: 500,
      statusText:
        'createTrpcNitroHandler requires a Node.js request/response context.',
    });
  }

  return { req, res };
}

async function readRequestBody(event: H3Event) {
  if (event.method === 'GET' || event.method === 'HEAD') {
    return null;
  }

  if (event.req.headers.get('content-length') === '0') {
    return undefined;
  }

  const contentType = event.req.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    try {
      return await event.req.json();
    } catch {
      throw new HTTPError({
        status: 400,
        statusText: 'Invalid JSON request body.',
      });
    }
  }

  const text = await event.req.text();
  return text === '' ? undefined : text;
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
  return defineHandler(async (event) => {
    const { req, res } = getNodeRequestResponse(event);
    const $url = createURL(event.path || req.url || event.url.toString());

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

      throw new HTTPError({
        status: 500,
        statusText: JSON.stringify(error),
      });
    }

    const httpResponse = await resolveHTTPResponse({
      batching,
      router,
      req: {
        method: event.method,
        headers: req.headers,
        body: await readRequestBody(event),
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
        res.setHeader(key, headers[key]!);
      });

    return body;
  });
}

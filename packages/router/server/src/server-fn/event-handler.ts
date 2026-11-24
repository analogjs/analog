import type { Injector } from '@angular/core';
import {
  eventHandler,
  getRouterParam,
  readBody,
  type EventHandler,
  type H3Event,
} from 'h3';

import { dispatchServerFn, type DispatchResult } from './dispatch';
import { nodeContext, withResponseHeaders } from './node-context';
import type { AnalogRequestContext } from '../request-handler';

/**
 * The h3 request/response layer for the server-function dispatch route.
 *
 * `createServerFnAppInjector` bootstraps the parent injector once; this wraps
 * that in the `/_analog/fn/:id` handler the Nitro build registers. Kept as a
 * runtime function (rather than inlined into the generated module) so the
 * transport behaviour — body decoding, the malformed-body contract, and header
 * propagation — is unit-tested directly instead of by matching generated source.
 *
 * `appInjector` may be a promise: the generated module bootstraps the app at
 * import time and passes the pending injector, which is awaited on first request
 * and resolved instantly thereafter.
 */
export function createServerFnEventHandler(
  appInjector: Injector | Promise<Injector>,
): EventHandler {
  return eventHandler((event) => handleServerFnRequest(event, appInjector));
}

/**
 * Decode a server-function request, dispatch it, and write the result to the
 * h3 response. Same-origin, method, content-type, validation, and interceptors
 * are enforced inside `dispatchServerFn`; this owns only the h3 I/O around it.
 */
export async function handleServerFnRequest(
  event: H3Event,
  appInjector: Injector | Promise<Injector>,
): Promise<Response> {
  const id = getRouterParam(event, 'id') ?? '';
  if (!event.node?.req) {
    return handleServerFnFetch(
      id,
      (event as unknown as { req: Request }).req,
      await appInjector,
    );
  }

  // h3 parses the body before dispatch gets a say, and its parse error is an
  // HTML/500-shaped response rather than the JSON contract callers expect.
  let input: unknown;
  if (event.method !== 'GET') {
    try {
      input = await readBody(event);
    } catch {
      return malformedBodyResponse();
    }
  }

  return serverFnResponse(
    await dispatchServerFn(id, input, event, {
      parent: await appInjector,
      method: event.method,
    }),
  );
}

/** h3 v2 on fetch-native hosts (workerd, Bun, Deno) has a `Request` only. */
async function handleServerFnFetch(
  id: string,
  request: Request,
  parent: Injector,
): Promise<Response> {
  const context = nodeContext(request, new URL(request.url));
  const response = await callServerFn(id, request, context, parent);
  return withResponseHeaders(response, context.res);
}

export async function callServerFn(
  id: string,
  request: Request,
  context: AnalogRequestContext,
  parent: Injector,
): Promise<Response> {
  let input: unknown;
  if (request.method !== 'GET') {
    const text = await request.text();
    try {
      input = text ? JSON.parse(text) : undefined;
    } catch {
      return malformedBodyResponse();
    }
  }
  return serverFnResponse(
    await dispatchServerFn(
      id,
      input,
      { node: context },
      { parent, method: request.method },
    ),
  );
}

function serverFnResponse({ status, body, headers }: DispatchResult): Response {
  const responseHeaders = new Headers();
  for (const [key, value] of Object.entries(headers ?? {})) {
    for (const item of [value].flat()) {
      responseHeaders.append(key, item);
    }
  }
  if (isNullBodyStatus(status)) {
    return new Response(null, { status, headers: responseHeaders });
  }
  return Response.json(body ?? null, { status, headers: responseHeaders });
}

function malformedBodyResponse(): Response {
  return Response.json({ message: 'Malformed request body' }, { status: 400 });
}

function isNullBodyStatus(status: number): boolean {
  return status === 204 || status === 205 || status === 304;
}

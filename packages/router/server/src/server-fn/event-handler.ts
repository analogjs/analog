import type { Injector } from '@angular/core';
import {
  eventHandler,
  getRouterParam,
  readBody,
  setResponseHeader,
  setResponseStatus,
  type EventHandler,
  type H3Event,
} from 'nitro/h3';

import { dispatchServerFn, type DispatchResult } from './dispatch';
import { assertNodeContext } from './node-context';

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
): Promise<unknown> {
  assertNodeContext(event);
  const id = getRouterParam(event, 'id') ?? '';

  // h3 parses the body before dispatch gets a say, and its parse error is an
  // HTML/500-shaped response rather than the JSON contract callers expect.
  let input: unknown;
  if (event.method !== 'GET') {
    try {
      input = await readBody(event);
    } catch {
      setResponseStatus(event, 400);
      return { message: 'Malformed request body' };
    }
  }

  const { status, body, headers } = await dispatchServerFn(id, input, event, {
    parent: await appInjector,
    method: event.method,
  });

  setResponseStatus(event, status);
  if (headers) {
    for (const [key, value] of Object.entries(headers)) {
      setResponseHeader(event, key, value);
    }
  }
  return serializeServerFnBody(event, { status, body, headers });
}

function serializeServerFnBody(
  event: H3Event,
  result: DispatchResult,
): unknown {
  const { status, body, headers } = result;
  const contentType = headers?.['content-type'];
  const mediaType =
    typeof contentType === 'string'
      ? contentType.split(';')[0].trim().toLowerCase()
      : undefined;
  if (
    mediaType &&
    mediaType !== 'application/json' &&
    !mediaType.endsWith('+json')
  )
    return body;
  if (
    body === undefined ||
    status === 204 ||
    status === 205 ||
    status === 304 ||
    (body === null && status !== 200 && !mediaType)
  )
    return body;

  // h3 treats strings as text and null as an empty body. RPC callers expect JSON
  // for these values too, while explicit non-JSON Response headers retain control.
  setResponseHeader(
    event,
    'content-type',
    contentType ?? 'application/json; charset=utf-8',
  );
  return JSON.stringify(body);
}

import type { Injector } from '@angular/core';
import { eventHandler, getRouterParam, readBody, type H3Event } from 'h3';

import { dispatchServerFn } from './dispatch';

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
) {
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
  const id = getRouterParam(event, 'id') ?? '';

  // h3 parses the body before dispatch gets a say, and its parse error is an
  // HTML/500-shaped response rather than the JSON contract callers expect.
  let input: unknown;
  if (event.method !== 'GET') {
    try {
      input = await readBody(event);
    } catch {
      event.node.res.statusCode = 400;
      return { message: 'Malformed request body' };
    }
  }

  const { status, body, headers } = await dispatchServerFn(id, input, event, {
    parent: await appInjector,
    method: event.method,
  });

  event.node.res.statusCode = status;
  if (headers) {
    for (const [key, value] of Object.entries(headers)) {
      event.node.res.setHeader(key, value);
    }
  }
  return body;
}

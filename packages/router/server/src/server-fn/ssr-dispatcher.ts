import { Injector } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import type { ServerRequest, ServerResponse } from '@analogjs/router/tokens';
import type { ServerFn, ServerFnDispatcher } from '@analogjs/router';
import type { H3Event } from 'h3';

import { dispatchServerFn } from './dispatch';

/**
 * The in-process transport used during SSR. `ServerFnClient` picks this up from
 * DI and calls the handler directly instead of issuing an HTTP request back
 * into the app — the render and the handler already share a process and a
 * request, so the round-trip only adds latency (and would need an absolute URL).
 *
 * `method` is deliberately not passed to `dispatchServerFn`: this is a trusted
 * in-process caller, so the HTTP-transport-only checks (same-origin, method
 * enforcement, content type) do not apply. Validation and the interceptor chain
 * still run, so an SSR call behaves like a browser call in every other respect.
 *
 * A non-2xx result is thrown as an `HttpErrorResponse` so the failure surfaces
 * on `resource.error()` exactly as it does in the browser.
 */
export function createServerFnDispatcher(
  req: ServerRequest,
  res: ServerResponse,
  injector: Injector,
): ServerFnDispatcher {
  const event = { node: { req, res } } as unknown as Pick<H3Event, 'node'>;

  return async <In, Out>(fn: ServerFn<In, Out>, input: In): Promise<Out> => {
    const { status, body } = await dispatchServerFn(fn.id, input, event, {
      parent: injector,
    });

    if (status < 200 || status > 299) {
      throw new HttpErrorResponse({ status, error: body, url: fn.url });
    }

    return body as Out;
  };
}

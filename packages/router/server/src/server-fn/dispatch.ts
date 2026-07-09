import {
  Injector,
  runInInjectionContext,
  type StaticProvider,
} from '@angular/core';
import { REQUEST, RESPONSE } from '@analogjs/router/tokens';
import type { H3Event } from 'h3';

import { serverFnRegistry } from './registry';
import { SERVER_FN_INTERCEPTORS, runInterceptors } from './interceptors';

export interface DispatchResult {
  status: number;
  body: unknown;
  /** Headers from a returned `Response` (`fail`/`redirect`): Location, Set-Cookie, … */
  headers?: Record<string, string>;
}

export interface DispatchServerFnOptions {
  /**
   * The app's environment injector. The per-request injector is created as its
   * child, so handlers resolve app services (and `providedIn: 'root'` services,
   * when this is the app's bootstrapped injector) and registered interceptors
   * without re-listing them per request.
   */
  parent?: Injector;
  /** Extra per-request providers, for direct callers without an app injector. */
  providers?: StaticProvider[];
  /** Request HTTP method; enforced against the function's configured method. */
  method?: string;
}

/**
 * Server-side dispatch for a server function call.
 *
 * 1. look up the function by id
 * 2. enforce the configured HTTP method (405 on mismatch)
 * 3. validate `input` against the Standard-Schema (4xx on failure)
 * 4. build a per-request injector (REQUEST/RESPONSE + app providers)
 * 5. run the interceptor chain, then the handler, re-entering
 *    `runInInjectionContext` at every hop so `inject()` works even after an
 *    interceptor `await`s before calling `next`
 * 6. a `Response` returned by an interceptor/handler (`fail`/`redirect`)
 *    short-circuits with its status AND headers
 *
 * `options.method` is the request's HTTP method; when provided it is enforced
 * against the function's configured method. Transports (the generated Nitro
 * handler) always pass it; trusted in-process callers may omit it.
 */
export async function dispatchServerFn(
  id: string,
  rawInput: unknown,
  event: Pick<H3Event, 'node'>,
  options: DispatchServerFnOptions = {},
): Promise<DispatchResult> {
  const { parent, providers = [], method } = options;

  const def = serverFnRegistry.get(id);
  if (!def) {
    return { status: 404, body: { message: `Unknown server function: ${id}` } };
  }

  // Enforce the transport method: a GET-only read must not be POSTable, and an
  // input-bearing POST must not be reachable via GET.
  if (method && method.toUpperCase() !== def.method) {
    return {
      status: 405,
      body: { message: `Method ${method} not allowed for ${id}` },
      headers: { Allow: def.method },
    };
  }

  let input = rawInput;
  if (def.config.input) {
    const result = await def.config.input['~standard'].validate(rawInput);
    if ('issues' in result && result.issues) {
      return { status: 400, body: { errors: result.issues } };
    }
    input = (result as { value: unknown }).value;
  }

  // Child of the app injector: only REQUEST/RESPONSE are per-request; app
  // services + interceptors resolve up the parent chain.
  const injector = Injector.create({
    parent,
    providers: [
      { provide: REQUEST, useValue: event.node.req },
      { provide: RESPONSE, useValue: event.node.res },
      ...providers,
    ],
  });

  // Re-enter the injection context at each hop rather than wrapping the whole
  // chain once: an interceptor that awaits before `next` would otherwise run the
  // handler outside the context and break `inject()`.
  const runInCtx = <T>(fn: () => T): T => runInInjectionContext(injector, fn);
  const interceptors = injector.get(SERVER_FN_INTERCEPTORS, []);
  const outcome = await runInterceptors(
    interceptors,
    input,
    def.handler,
    runInCtx,
  );

  if (outcome instanceof Response) {
    const text = await outcome.text();
    const body = text ? safeJson(text) : null;
    const headers: Record<string, string> = {};
    outcome.headers.forEach((value, key) => {
      headers[key] = value;
    });
    return {
      status: outcome.status,
      body,
      headers: Object.keys(headers).length ? headers : undefined,
    };
  }

  return { status: 200, body: outcome };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

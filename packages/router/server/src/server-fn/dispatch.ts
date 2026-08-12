import {
  Injector,
  runInInjectionContext,
  type StaticProvider,
} from '@angular/core';
import { BASE_URL, LOCALE, REQUEST, RESPONSE } from '@analogjs/router/tokens';
import type { H3Event } from 'h3';

import { detectLocale, getBaseUrl } from '../provide-server-context';
import { serverFnRegistry } from './registry';
import { SERVER_FN_INTERCEPTORS, runInterceptors } from './interceptors';
import {
  SERVER_FN_ALLOWED_ORIGINS,
  isServerFnOriginAllowed,
  type HeaderBag,
} from './same-origin';

export interface DispatchResult {
  status: number;
  body: unknown;
  /**
   * Headers from a returned `Response` (`fail`/`redirect`): Location, … The
   * value is an array when the header legitimately repeats, which is why
   * `Set-Cookie` is read separately below — collapsing several cookies into one
   * comma-joined value corrupts them.
   */
  headers?: Record<string, string | string[]>;
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
  /**
   * Origins permitted beyond same-origin, merged with any registered through DI
   * (`provideServerFns(withAllowedOrigins([...]))`). The transport is
   * same-origin by default (cross-origin browser calls are rejected with 403);
   * `'*'` disables the check entirely. Only consulted for HTTP-transport calls
   * (those that pass `method`).
   */
  allowedOrigins?: string[];
}

/**
 * Server-side dispatch for a server function call.
 *
 * 1. reject cross-origin browser calls (403), unless allow-listed — HTTP
 *    transport only (in-process callers omit `method` and are exempt)
 * 2. look up the function by id
 * 3. enforce the configured HTTP method (405 on mismatch)
 * 4. require a JSON body on input-bearing calls (415 otherwise)
 * 5. validate `input` against the Standard-Schema (4xx on failure)
 * 6. build a per-request injector (REQUEST/RESPONSE + app providers)
 * 7. run the interceptor chain, then the handler, re-entering
 *    `runInInjectionContext` at every hop so `inject()` works even after an
 *    interceptor `await`s before calling `next`
 * 8. a `Response` returned by an interceptor/handler (`fail`/`redirect`)
 *    short-circuits with its status AND headers
 *
 * `options.method` is the request's HTTP method; when provided it is enforced
 * against the function's configured method AND it turns on the same-origin
 * guard. Transports (the generated Nitro handler) always pass it; trusted
 * in-process callers may omit it, which also exempts them from the origin guard.
 */
export async function dispatchServerFn(
  id: string,
  rawInput: unknown,
  event: Pick<H3Event, 'node'>,
  options: DispatchServerFnOptions = {},
): Promise<DispatchResult> {
  const { parent, providers = [], method, allowedOrigins = [] } = options;
  const headers = (event.node.req.headers ?? {}) as HeaderBag;

  // Same-origin guard runs first — before we even confirm the function exists —
  // so a cross-origin page cannot probe which ids are registered. Gated on
  // `method` so only HTTP-transport calls are checked; in-process callers omit
  // it. The signals (`Origin`/`Sec-Fetch-Site`) are browser-set and unforgeable.
  if (method) {
    const allowed = [
      ...allowedOrigins,
      ...(parent?.get(SERVER_FN_ALLOWED_ORIGINS, []) ?? []),
    ];
    if (!isServerFnOriginAllowed(headers, allowed)) {
      return {
        status: 403,
        body: { message: 'Cross-origin server function call rejected' },
      };
    }
  }

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

  // Input travels as a JSON body. Reject anything else before decoding, so a
  // form post from a cross-origin page (which cannot set a JSON content type
  // without a CORS preflight) never reaches a handler. HTTP transport only.
  if (method && def.method === 'POST' && !isJsonContentType(headers)) {
    return {
      status: 415,
      body: { message: 'Server functions accept an application/json body' },
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

  // Child of the app injector: only the request tokens are per-request; app
  // services + interceptors resolve up the parent chain. All four are provided
  // here so a handler resolves them the same way it would inside a component
  // during SSR, whether it was reached over HTTP or in-process.
  const req = event.node.req as Parameters<typeof getBaseUrl>[0];
  const locale = detectLocale(req);
  const injector = Injector.create({
    parent,
    providers: [
      { provide: REQUEST, useValue: event.node.req },
      { provide: RESPONSE, useValue: event.node.res },
      { provide: BASE_URL, useValue: getBaseUrl(req) },
      ...(locale ? [{ provide: LOCALE, useValue: locale }] : []),
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
    const headers: Record<string, string | string[]> = {};
    outcome.headers.forEach((value, key) => {
      if (key.toLowerCase() !== 'set-cookie') {
        headers[key] = value;
      }
    });
    // `Headers.forEach` yields cookies comma-joined into a single value, which
    // is not a valid way to send more than one; `getSetCookie` keeps them apart.
    const setCookie = outcome.headers.getSetCookie?.() ?? [];
    if (setCookie.length) {
      headers['set-cookie'] = setCookie;
    }
    return {
      status: outcome.status,
      body,
      headers: Object.keys(headers).length ? headers : undefined,
    };
  }

  return { status: 200, body: outcome };
}

function isJsonContentType(headers: HeaderBag): boolean {
  const contentType = headers['content-type'];
  const value = Array.isArray(contentType) ? contentType[0] : contentType;
  if (!value) {
    return false;
  }
  const mediaType = value.split(';')[0].trim().toLowerCase();
  return mediaType === 'application/json' || mediaType.endsWith('+json');
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

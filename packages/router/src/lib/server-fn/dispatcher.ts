import { InjectionToken, type Injector } from '@angular/core';

import type { ServerFn } from './types';

/**
 * In-process transport for a server function call.
 *
 * Provided on the server by `provideServerContext`, so during SSR a server
 * function runs in the same process — and the same request injector — as the
 * render instead of making an HTTP request back into the app. Absent in the
 * browser, where `ServerFnClient` falls back to `HttpClient`.
 *
 * `injector` is the **app environment injector** — `ServerFnClient` is
 * `providedIn: 'root'`, and SSR bootstraps a fresh application per request, so
 * its injector is both per-request and the right scope for a handler to resolve
 * from. It is passed rather than captured from the token because
 * `provideServerContext` is applied as *platform* providers, which sit above
 * the app's `providedIn: 'root'` services.
 *
 * Deliberately not a component's node injector: a handler resolves app-level
 * services, and making that depend on which component happened to call it would
 * be surprising and unportable.
 */
export type ServerFnDispatcher = <In, Out>(
  fn: ServerFn<In, Out>,
  input: In,
  injector: Injector,
) => Promise<Out>;

export const SERVER_FN_DISPATCHER = new InjectionToken<ServerFnDispatcher>(
  '@analogjs/router Server Function Dispatcher',
);

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
 * `injector` is the caller's injector, passed rather than captured because
 * `provideServerContext` is applied as platform providers: the app's
 * `providedIn: 'root'` services live below that, in the injector the caller
 * resolves from.
 */
export type ServerFnDispatcher = <In, Out>(
  fn: ServerFn<In, Out>,
  input: In,
  injector: Injector,
) => Promise<Out>;

export const SERVER_FN_DISPATCHER = new InjectionToken<ServerFnDispatcher>(
  '@analogjs/router Server Function Dispatcher',
);

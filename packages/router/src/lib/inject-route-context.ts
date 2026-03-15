import { inject } from '@angular/core';

import { EXPERIMENTAL_ROUTE_CONTEXT } from './experimental';

/**
 * Injects the root route context provided via `withRouteContext()`.
 *
 * Inspired by TanStack Router's context inheritance where
 * `createRootRouteWithContext<T>()` makes a typed context available
 * to every route's `beforeLoad` and `loader` callbacks.
 *
 * In Angular, this uses DI under the hood — `withRouteContext(ctx)`
 * provides the value, and `injectRouteContext<T>()` retrieves it
 * with the expected type.
 *
 * @example
 * ```ts
 * // app.config.ts
 * provideFileRouter(
 *   withRouteContext({
 *     auth: inject(AuthService),
 *     analytics: inject(AnalyticsService),
 *   }),
 * )
 *
 * // any-page.page.ts
 * const ctx = injectRouteContext<{
 *   auth: AuthService;
 *   analytics: AnalyticsService;
 * }>();
 * ctx.analytics.trackPageView();
 * ```
 *
 * @experimental
 */
export function injectRouteContext<
  T extends Record<string, unknown> = Record<string, unknown>,
>(): T {
  return inject(EXPERIMENTAL_ROUTE_CONTEXT) as T;
}

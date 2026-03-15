import { inject, Injector, Signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';

import type {
  AnalogRoutePath,
  RouteParamsOutput,
  RouteQueryOutput,
} from './route-path';

/**
 * Injects typed route params as a signal, constrained by the route table.
 *
 * Inspired by TanStack Router's `useParams({ from: '/users/$userId' })`
 * pattern where the `from` parameter narrows the return type to only
 * the params defined for that route.
 *
 * The `from` parameter is used purely for TypeScript type inference —
 * at runtime, params are read from the current `ActivatedRoute`. This
 * means it works correctly when used inside a component rendered by
 * the specified route.
 *
 * @example
 * ```ts
 * // In a component rendered at /users/[id]
 * const params = injectTypedParams('/users/[id]');
 * // params() → { id: string }
 *
 * // With schema validation output types
 * const params = injectTypedParams('/products/[slug]');
 * // params() → validated output type from routeParamsSchema
 * ```
 *
 * @experimental
 */
export function injectTypedParams<P extends AnalogRoutePath>(
  _from: P,
  options?: { injector?: Injector },
): Signal<RouteParamsOutput<P>> {
  const route = options?.injector
    ? options.injector.get(ActivatedRoute)
    : inject(ActivatedRoute);

  return toSignal(
    route.params.pipe(map((params) => params as RouteParamsOutput<P>)),
    { requireSync: true },
  );
}

/**
 * Injects typed route query params as a signal, constrained by the
 * route table.
 *
 * Inspired by TanStack Router's `useSearch({ from: '/issues' })` pattern
 * where search params are validated and typed per-route via
 * `validateSearch` schemas.
 *
 * In Analog, the typing comes from `routeQuerySchema` exports that are
 * detected at build time and recorded in the generated route table.
 *
 * @example
 * ```ts
 * // In a component rendered at /issues
 * // (where routeQuerySchema validates { page: number, status: string })
 * const query = injectTypedQuery('/issues');
 * // query() → { page: number; status: string }
 * ```
 *
 * @experimental
 */
export function injectTypedQuery<P extends AnalogRoutePath>(
  _from: P,
  options?: { injector?: Injector },
): Signal<RouteQueryOutput<P>> {
  const route = options?.injector
    ? options.injector.get(ActivatedRoute)
    : inject(ActivatedRoute);

  return toSignal(
    route.queryParams.pipe(map((params) => params as RouteQueryOutput<P>)),
    { requireSync: true },
  );
}

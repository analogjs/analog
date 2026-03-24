import { inject, Injector, isDevMode, Signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map, take } from 'rxjs';

import type {
  AnalogRoutePath,
  RouteParamsOutput,
  RouteQueryOutput,
} from './route-path';
import { EXPERIMENTAL_TYPED_ROUTER } from './experimental';

function extractRouteParams(
  routePath: string,
): { name: string; type: 'dynamic' | 'catchAll' | 'optionalCatchAll' }[] {
  const params: {
    name: string;
    type: 'dynamic' | 'catchAll' | 'optionalCatchAll';
  }[] = [];
  for (const match of routePath.matchAll(/\[\[\.\.\.([^\]]+)\]\]/g)) {
    params.push({ name: match[1], type: 'optionalCatchAll' });
  }
  for (const match of routePath.matchAll(/(?<!\[)\[\.\.\.([^\]]+)\](?!\])/g)) {
    params.push({ name: match[1], type: 'catchAll' });
  }
  for (const match of routePath.matchAll(/(?<!\[)\[(?!\.)([^\]]+)\](?!\])/g)) {
    params.push({ name: match[1], type: 'dynamic' });
  }
  return params;
}

/**
 * When `strictRouteParams` is enabled, warns if expected params from the
 * `_from` pattern are missing from the active `ActivatedRoute`.
 */
function assertRouteMatch(
  from: string,
  route: ActivatedRoute,
  kind: 'injectParams' | 'injectQuery',
): void {
  const expectedParams = extractRouteParams(from)
    .filter((param) => param.type === 'dynamic' || param.type === 'catchAll')
    .map((param) => param.name);

  if (expectedParams.length === 0) return;

  route.params.pipe(take(1)).subscribe((params) => {
    for (const name of expectedParams) {
      if (!(name in params)) {
        console.warn(
          `[Analog] ${kind}('${from}'): expected param "${name}" ` +
            `is not present in the active route's params. ` +
            `Ensure this hook is used inside a component rendered by '${from}'.`,
        );
        break;
      }
    }
  });
}

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
 * When `withTypedRouter({ strictRouteParams: true })` is configured,
 * a dev-mode assertion checks that the expected params from `from`
 * exist in the active route and warns on mismatch.
 *
 * @example
 * ```ts
 * // In a component rendered at /users/[id]
 * const params = injectParams('/users/[id]');
 * // params() → { id: string }
 *
 * // With schema validation output types
 * const params = injectParams('/products/[slug]');
 * // params() → validated output type from routeParamsSchema
 * ```
 *
 * @experimental
 */
export function injectParams<P extends AnalogRoutePath>(
  _from: P,
  options?: { injector?: Injector },
): Signal<RouteParamsOutput<P>> {
  const injector = options?.injector;
  const route = injector
    ? injector.get(ActivatedRoute)
    : inject(ActivatedRoute);

  if (isDevMode()) {
    const config = injector
      ? injector.get(EXPERIMENTAL_TYPED_ROUTER, null)
      : inject(EXPERIMENTAL_TYPED_ROUTER, { optional: true });

    if (config?.strictRouteParams) {
      assertRouteMatch(_from, route, 'injectParams');
    }
  }

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
 * The `from` parameter is used purely for TypeScript type inference.
 * When `withTypedRouter({ strictRouteParams: true })` is configured,
 * a dev-mode assertion checks that the expected params from `from`
 * exist in the active route and warns on mismatch.
 *
 * @example
 * ```ts
 * // In a component rendered at /issues
 * // (where routeQuerySchema validates { page: number, status: string })
 * const query = injectQuery('/issues');
 * // query() → { page: number; status: string }
 * ```
 *
 * @experimental
 */
export function injectQuery<P extends AnalogRoutePath>(
  _from: P,
  options?: { injector?: Injector },
): Signal<RouteQueryOutput<P>> {
  const injector = options?.injector;
  const route = injector
    ? injector.get(ActivatedRoute)
    : inject(ActivatedRoute);

  if (isDevMode()) {
    const config = injector
      ? injector.get(EXPERIMENTAL_TYPED_ROUTER, null)
      : inject(EXPERIMENTAL_TYPED_ROUTER, { optional: true });

    if (config?.strictRouteParams) {
      assertRouteMatch(_from, route, 'injectQuery');
    }
  }

  return toSignal(
    route.queryParams.pipe(map((params) => params as RouteQueryOutput<P>)),
    { requireSync: true },
  );
}

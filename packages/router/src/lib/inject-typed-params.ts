import { inject, Injector, Signal } from '@angular/core';
import { ActivatedRoute, type ResourceResult } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { combineLatest, map, Observable, of } from 'rxjs';

import type {
  AnalogRoutePath,
  RouteDataOutput,
  RouteParamsOutput,
  RouteQueryOutput,
  RouteResourcesOutput,
} from './to-route';

function extractCatchAllParams(
  routePath: string,
): { name: string; type: 'catchAll' | 'optionalCatchAll' }[] {
  const params: {
    name: string;
    type: 'catchAll' | 'optionalCatchAll';
  }[] = [];
  for (const segment of routePath.split('/')) {
    const optional = segment.match(/^\[\[\.\.\.([^\]]+)\]\]$/);
    const required = segment.match(/^\[\.\.\.([^\]]+)\]$/);
    if (optional) {
      params.push({ name: optional[1], type: 'optionalCatchAll' });
    } else if (required) {
      params.push({ name: required[1], type: 'catchAll' });
    }
  }
  return params;
}

/** Internal: params for `route` and its ancestors, with catch-alls as arrays. */
export function observeRouteParams(
  route: ActivatedRoute,
  routePath: string,
): Observable<Record<string, unknown>> {
  const ancestors = route.pathFromRoot ?? [route];
  const catchAllParams = extractCatchAllParams(routePath);
  return combineLatest([
    combineLatest(ancestors.map((entry) => entry.params)),
    combineLatest(ancestors.map((entry) => entry.url ?? of([]))),
  ]).pipe(
    map(([values, segments]) => {
      const params = Object.assign({}, ...values);
      for (const param of catchAllParams) {
        const source = ancestors.findIndex((entry, index) =>
          param.type === 'catchAll'
            ? entry.routeConfig?.path === '**'
            : !!entry.routeConfig?.matcher && values[index][param.name] != null,
        );
        if (source !== -1) {
          params[param.name] = segments[source].map((segment) => segment.path);
        }
      }
      return params;
    }),
  );
}

type InjectOptions = { injector?: Injector };

// Accepts `(from, options)` or `(options)`.
function resolveArgs(
  fromOrOptions: string | InjectOptions | undefined,
  options: InjectOptions | undefined,
) {
  const typed = typeof fromOrOptions === 'string';
  const injector = (typed ? options : fromOrOptions)?.injector;
  return {
    from: typed ? fromOrOptions : '',
    injector,
    route: injector ? injector.get(ActivatedRoute) : inject(ActivatedRoute),
  };
}

/** Read raw route params; catch-all segments are returned as arrays. */
export function injectParams<P extends AnalogRoutePath>(
  from: P,
  options?: InjectOptions,
): Signal<RouteParamsOutput<P>>;
/** Read untyped route params. Catch-all segments require a route path. */
export function injectParams(
  options?: InjectOptions,
): Signal<Record<string, string | undefined>>;
export function injectParams(
  fromOrOptions?: string | InjectOptions,
  options?: InjectOptions,
): Signal<unknown> {
  const { from, injector, route } = resolveArgs(fromOrOptions, options);
  return toSignal(observeRouteParams(route, from), {
    requireSync: true,
    injector,
  });
}

/** Read raw query params as a signal. No schema coercion is performed. */
export function injectQuery<P extends AnalogRoutePath>(
  from: P,
  options?: InjectOptions,
): Signal<RouteQueryOutput<P>>;
/** Read raw query params as a signal. */
export function injectQuery(
  options?: InjectOptions,
): Signal<Record<string, string | string[] | undefined>>;
export function injectQuery(
  fromOrOptions?: string | InjectOptions,
  options?: InjectOptions,
): Signal<unknown> {
  const { injector, route } = resolveArgs(fromOrOptions, options);
  return toSignal(route.queryParams, { requireSync: true, injector });
}

/**
 * Read route data as a signal: static `routeMeta.data` and `routeMeta.resolve`
 * results from the page and its layouts, and the page's server `load` result
 * under `load`.
 */
export function injectRouteData<P extends AnalogRoutePath>(
  from: P,
  options?: InjectOptions,
): Signal<RouteDataOutput<P>>;
/** Read untyped route data as a signal. */
export function injectRouteData(
  options?: InjectOptions,
): Signal<Record<string, unknown>>;
export function injectRouteData(
  fromOrOptions?: string | InjectOptions,
  options?: InjectOptions,
): Signal<unknown> {
  const { injector, route } = resolveArgs(fromOrOptions, options);
  return toSignal(route.data, { requireSync: true, injector });
}

/**
 * Access route resources: returns resources defined on the route and its
 * ancestor layouts via `routeMeta.resources`. Requires `withRouterResources()`.
 */
export function injectResources<P extends AnalogRoutePath>(
  from: P,
  options?: InjectOptions,
): RouteResourcesOutput<P>;
/** Access untyped route resources. */
export function injectResources(options?: InjectOptions): ResourceResult;
export function injectResources(
  fromOrOptions?: string | InjectOptions,
  options?: InjectOptions,
): unknown {
  const { route } = resolveArgs(fromOrOptions, options);
  return route.resources ?? {};
}

export { injectResources as injectRouteResources };

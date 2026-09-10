import { inject, Injector, Signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { combineLatest, map, of } from 'rxjs';

import type {
  AnalogRoutePath,
  RouteParamsOutput,
  RouteQueryOutput,
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

/** Read raw route params; catch-all segments are returned as arrays. */
export function injectParams<P extends AnalogRoutePath>(
  _from: P,
  options?: { injector?: Injector },
): Signal<RouteParamsOutput<P>> {
  const injector = options?.injector;
  const route = injector
    ? injector.get(ActivatedRoute)
    : inject(ActivatedRoute);
  const ancestors = route.pathFromRoot ?? [route];
  const catchAllParams = extractCatchAllParams(_from);
  return toSignal(
    combineLatest([
      combineLatest(ancestors.map((entry) => entry.params)),
      combineLatest(ancestors.map((entry) => entry.url ?? of([]))),
    ]).pipe(
      map(([values, segments]) => {
        const params = Object.assign({}, ...values);
        for (const param of catchAllParams) {
          const source = ancestors.findIndex((entry, index) =>
            param.type === 'catchAll'
              ? entry.routeConfig?.path === '**'
              : !!entry.routeConfig?.matcher &&
                values[index][param.name] != null,
          );
          if (source !== -1) {
            params[param.name] = segments[source].map(
              (segment) => segment.path,
            );
          }
        }
        return params as RouteParamsOutput<P>;
      }),
    ),
    { requireSync: true, injector },
  );
}

/** Read raw query params as a signal. No schema coercion is performed. */
export function injectQuery<P extends AnalogRoutePath>(
  _from: P,
  options?: { injector?: Injector },
): Signal<RouteQueryOutput<P>> {
  const injector = options?.injector;
  const route = injector
    ? injector.get(ActivatedRoute)
    : inject(ActivatedRoute);
  return toSignal(
    route.queryParams.pipe(map((params) => params as RouteQueryOutput<P>)),
    { requireSync: true, injector },
  );
}

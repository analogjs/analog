import { inject, Injector, Signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { combineLatest, map, of } from 'rxjs';

import type {
  AnalogRoutePath,
  RouteParamsOutput,
  RouteQueryOutput,
} from './route-path';

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
  const wildcard = ancestors.find((entry) => entry.routeConfig?.path === '**');
  return toSignal(
    combineLatest([
      combineLatest(ancestors.map((entry) => entry.params)),
      wildcard?.url ?? of([]),
    ]).pipe(
      map(([values, segments]) => {
        const params = Object.assign({}, ...values);
        for (const param of extractRouteParams(_from)) {
          if (param.type !== 'dynamic') {
            const value = params[param.name];
            if (typeof value === 'string') {
              params[param.name] = value ? value.split('/') : [];
            } else if (param.type === 'catchAll' && wildcard) {
              params[param.name] = segments.map((segment) => segment.path);
            }
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

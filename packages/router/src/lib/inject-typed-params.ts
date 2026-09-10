import { inject, Injector, isDevMode, Signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { combineLatest, map, of, take } from 'rxjs';

import type {
  AnalogRoutePath,
  RouteParamsOutput,
  RouteQueryOutput,
} from './route-path';
import { TYPED_ROUTER } from './typed-router';

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

  const config = injector
    ? injector.get(TYPED_ROUTER, null)
    : inject(TYPED_ROUTER, { optional: true });
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
          if (
            isDevMode() &&
            config?.strictRouteParams &&
            param.type !== 'optionalCatchAll' &&
            !(param.name in params)
          ) {
            console.warn(
              `[Analog] injectParams('${_from}'): expected param "${param.name}" is not present in the active route's params.`,
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

  const config = injector
    ? injector.get(TYPED_ROUTER, null)
    : inject(TYPED_ROUTER, { optional: true });
  if (isDevMode() && config?.strictRouteParams) {
    route.params.pipe(take(1)).subscribe((params) => {
      for (const param of extractRouteParams(_from)) {
        if (param.type === 'dynamic' && !(param.name in params)) {
          console.warn(
            `[Analog] injectQuery('${_from}'): expected param "${param.name}" is not present in the active route's params.`,
          );
          break;
        }
      }
    });
  }
  return toSignal(
    route.queryParams.pipe(map((params) => params as RouteQueryOutput<P>)),
    { requireSync: true, injector },
  );
}

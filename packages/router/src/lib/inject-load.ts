import { Injector, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Observable, map } from 'rxjs';

import { PageServerLoad } from './route-types';
import type { AnalogRouteWithLoad, RouteLoadOutput } from './to-route';

/** Reads the result of the page's server `load` function, typed by route path. */
export function injectLoad<P extends AnalogRouteWithLoad>(
  path: P,
  options?: { injector?: Injector },
): Observable<RouteLoadOutput<P>>;
export function injectLoad<
  T extends (pageServerLoad: PageServerLoad) => Promise<any>,
>(options?: { injector?: Injector }): Observable<Awaited<ReturnType<T>>>;
export function injectLoad(
  pathOrOptions?: string | { injector?: Injector },
  options?: { injector?: Injector },
): Observable<unknown> {
  const injector =
    (typeof pathOrOptions === 'string' ? options : pathOrOptions)?.injector ??
    inject(Injector);
  const route = injector.get(ActivatedRoute);

  return route.data.pipe(map((data) => data['load']));
}

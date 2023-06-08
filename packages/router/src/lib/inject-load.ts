import { Injector, assertInInjectionContext, inject } from '@angular/core';
import { ActivatedRoute, Data } from '@angular/router';
import { Observable, map } from 'rxjs';

import { PageServerLoad } from './route-types';

export function injectLoad<
  T extends (pageServerLoad: PageServerLoad) => Promise<any>
>(options?: { injector?: Injector }): Observable<Awaited<ReturnType<T>>> {
  !options?.injector && assertInInjectionContext(injectLoad);

  const injector = options?.injector ?? inject(Injector);
  const route = injector.get(ActivatedRoute);

  return route.data.pipe(
    map<Data, Awaited<ReturnType<T>>>((data) => data['load'])
  );
}

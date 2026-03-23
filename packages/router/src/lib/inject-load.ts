import { Injector, inject } from '@angular/core';
import { ActivatedRoute, Data } from '@angular/router';
import { Observable, map } from 'rxjs';

import { LoadDataResult, PageServerLoad } from './route-types';

function isResponse(value: unknown): value is Response {
  return typeof value === 'object' && value instanceof Response;
}

export function injectLoad<
  T extends (pageServerLoad: PageServerLoad) => Promise<any>,
>(options?: { injector?: Injector }): Observable<Awaited<ReturnType<T>>> {
  const injector = options?.injector ?? inject(Injector);
  const route = injector.get(ActivatedRoute);

  return route.data.pipe(
    map<Data, Awaited<ReturnType<T>>>((data) => data['load']),
  );
}

export function injectLoadData<
  T extends (pageServerLoad: PageServerLoad) => Promise<any>,
>(options?: { injector?: Injector }): Observable<LoadDataResult<T>> {
  return injectLoad<T>(options).pipe(
    map((result): LoadDataResult<T> => {
      if (isResponse(result)) {
        throw new Error('Expected page load data but received a response.');
      }

      return result as LoadDataResult<T>;
    }),
  );
}

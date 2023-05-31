import { Injector, assertInInjectionContext, inject } from '@angular/core';
import { ActivatedRoute, Data } from '@angular/router';
import { map } from 'rxjs';

export function useLoad<T = any>(options?: { injector?: Injector }) {
  !options?.injector && assertInInjectionContext(useLoad);

  const injector = options?.injector ?? inject(Injector);
  const route = injector.get(ActivatedRoute);

  return route.data.pipe(map<Data, T>((data) => data['load']));
}

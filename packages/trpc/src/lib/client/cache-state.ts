import { BehaviorSubject, first } from 'rxjs';
import {
  APP_BOOTSTRAP_LISTENER,
  ApplicationRef,
  inject,
  InjectionToken,
  ɵInitialRenderPendingTasks as InitialRenderPendingTasks,
} from '@angular/core';

export const tRPC_CACHE_STATE = new InjectionToken<{
  isCacheActive: BehaviorSubject<boolean>;
}>('TRPC_HTTP_TRANSFER_STATE_CACHE_STATE');

export const provideTrpcCacheState = () => ({
  provide: tRPC_CACHE_STATE,
  useValue: { isCacheActive: new BehaviorSubject(true) },
});

export const provideTrpcCacheStateStatusManager = () => ({
  provide: APP_BOOTSTRAP_LISTENER,
  multi: true,
  useFactory: () => {
    const appRef = inject(ApplicationRef);
    const cacheState = inject(tRPC_CACHE_STATE);

    // same logic as in https://github.com/angular/angular/blob/main/packages/common/http/src/transfer_cache.ts
    return () => {
      appRef.isStable
        .pipe(first((isStable) => isStable))
        .toPromise()
        .then(() => {
          cacheState.isCacheActive.next(false);
        });
    };
  },
  deps: [ApplicationRef, tRPC_CACHE_STATE, InitialRenderPendingTasks],
});

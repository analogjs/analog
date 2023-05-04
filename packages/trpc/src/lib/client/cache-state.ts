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
    const pendingTasks = inject(InitialRenderPendingTasks);

    return () => {
      const isStablePromise = appRef.isStable
        .pipe(first((isStable) => isStable))
        .toPromise();
      const pendingTasksPromise = pendingTasks.whenAllTasksComplete;

      (Promise as any)
        .allSettled([isStablePromise, pendingTasksPromise])
        .then(() => {
          cacheState.isCacheActive.next(false);
        });
    };
  },
  deps: [ApplicationRef, tRPC_CACHE_STATE, InitialRenderPendingTasks],
});

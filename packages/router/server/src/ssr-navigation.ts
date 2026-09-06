import {
  DestroyRef,
  ENVIRONMENT_INITIALIZER,
  inject,
  makeEnvironmentProviders,
  type EnvironmentProviders,
} from '@angular/core';
import { NavigationEnd, NavigationError, Router } from '@angular/router';

/** Angular can settle initial navigation after an error without rejecting renderApplication. */
export function createSsrNavigationTracker(): {
  provider: EnvironmentProviders;
  throwIfFailed: () => void;
} {
  let failure: NavigationError | undefined;
  return {
    provider: makeEnvironmentProviders([
      {
        provide: ENVIRONMENT_INITIALIZER,
        multi: true,
        useValue() {
          const router = inject(Router, { optional: true });
          if (!router) return;
          const subscription = router.events.subscribe((event) => {
            if (event instanceof NavigationError) failure = event;
            else if (event instanceof NavigationEnd) failure = undefined;
          });
          inject(DestroyRef).onDestroy(() => subscription.unsubscribe());
        },
      },
    ]),
    throwIfFailed(): void {
      if (failure) throw failure.error;
    },
  };
}

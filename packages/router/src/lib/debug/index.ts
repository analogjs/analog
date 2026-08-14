import { EnvironmentProviders, Provider } from '@angular/core';
import { ROUTES } from '@angular/router';

/**
 * Provides routes that provide additional
 * pages for displaying and debugging
 * routes.
 */
export function withDebugRoutes(): {
  ɵkind: number;
  ɵproviders: (Provider | EnvironmentProviders)[];
} {
  const routes = [
    {
      path: '__analog/routes',
      loadComponent: () => import('./debug.page'),
    },
  ];

  return {
    ɵkind: 101 as number,
    ɵproviders: [{ provide: ROUTES, useValue: routes, multi: true }],
  };
}

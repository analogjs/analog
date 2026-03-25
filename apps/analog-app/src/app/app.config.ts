import {
  provideHttpClient,
  withFetch,
  withInterceptors,
} from '@angular/common/http';
import type { ApplicationConfig } from '@angular/core';
import {
  provideClientHydration,
  withEventReplay,
} from '@angular/platform-browser';
import {
  provideFileRouter,
  withExtraRoutes,
  withDebugRoutes,
  withTypedRouter,
  withRouteContext,
  withLoaderCaching,
  requestContextInterceptor,
} from '@analogjs/router';
import { withNavigationErrorHandler } from '@angular/router';

const fallbackRoutes = [
  { path: 'about', loadComponent: () => import('./about') },
];

export const appConfig: ApplicationConfig = {
  providers: [
    provideFileRouter(
      withNavigationErrorHandler(console.error),
      withDebugRoutes(),
      withExtraRoutes(fallbackRoutes),
      // Experimental: TanStack Router-inspired features
      withTypedRouter({ strictRouteParams: true }),
      withRouteContext({ appName: 'analog-app' }),
      withLoaderCaching({
        defaultStaleTime: 30_000,
        defaultGcTime: 300_000,
        defaultPendingMs: 200,
      }),
    ),
    provideHttpClient(
      withFetch(),
      withInterceptors([requestContextInterceptor]),
    ),
    // Hydration must be configured for both server and client bootstraps so
    // SSR can serialize the metadata the browser uses to hydrate.
    provideClientHydration(withEventReplay()),
  ],
};

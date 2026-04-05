import {
  provideHttpClient,
  withFetch,
  withInterceptors,
} from '@angular/common/http';
import { provideContent, withMarkdownRenderer } from '@analogjs/content';
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
import { withContentRoutes } from '@analogjs/router/content';
import { withNavigationErrorHandler } from '@angular/router';

const fallbackRoutes = [
  { path: 'about', loadComponent: () => import('./about') },
];

export const appConfig: ApplicationConfig = {
  providers: [
    provideFileRouter(
      withNavigationErrorHandler(console.error),
      withDebugRoutes(),
      withContentRoutes(),
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
    provideContent(withMarkdownRenderer()),
    // Hydration must be configured for both server and client bootstraps so
    // SSR can serialize the metadata the browser uses to hydrate.
    provideClientHydration(withEventReplay()),
  ],
};

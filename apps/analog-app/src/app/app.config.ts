import { provideHttpClient, withFetch } from '@angular/common/http';
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
    ),
    provideHttpClient(withFetch()),
    provideContent(withMarkdownRenderer()),
    // Hydration must be configured for both server and client bootstraps so
    // SSR can serialize the metadata the browser uses to hydrate.
    provideClientHydration(withEventReplay()),
  ],
};

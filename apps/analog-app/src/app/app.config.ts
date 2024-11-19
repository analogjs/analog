import {
  provideHttpClient,
  withFetch,
  withInterceptors,
} from '@angular/common/http';
import { ApplicationConfig } from '@angular/core';
import {
  provideClientHydration,
  withEventReplay,
} from '@angular/platform-browser';
import {
  provideFileRouter,
  withExtraRoutes,
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
      withExtraRoutes(fallbackRoutes)
    ),
    provideHttpClient(
      withFetch(),
      withInterceptors([requestContextInterceptor])
    ),
    provideClientHydration(withEventReplay()),
  ],
};

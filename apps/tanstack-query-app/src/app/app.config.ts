import {
  provideHttpClient,
  withFetch,
  withInterceptors,
} from '@angular/common/http';
import { InjectionToken } from '@angular/core';
import type { ApplicationConfig } from '@angular/core';
import {
  provideClientHydration,
  withEventReplay,
} from '@angular/platform-browser';
import { provideFileRouter, requestContextInterceptor } from '@analogjs/router';
import { provideAnalogQuery } from '@analogjs/router/tanstack-query';
import {
  QueryClient,
  provideTanStackQuery,
} from '@tanstack/angular-query-experimental';
import { withNavigationErrorHandler } from '@angular/router';

// Per-injector `QueryClient` factory. `bootstrapApplication` creates a
// fresh root injector per SSR request, so each request gets its own
// `QueryClient` and request state can't leak across responses. On the
// browser there's a single injector, so this still yields the expected
// singleton.
const QUERY_CLIENT = new InjectionToken<QueryClient>('QueryClient', {
  factory: () => new QueryClient(),
});

export const appConfig: ApplicationConfig = {
  providers: [
    provideFileRouter(withNavigationErrorHandler(console.error)),
    provideHttpClient(
      withFetch(),
      withInterceptors([requestContextInterceptor]),
    ),
    provideClientHydration(withEventReplay()),
    provideTanStackQuery(QUERY_CLIENT),
    provideAnalogQuery(),
  ],
};

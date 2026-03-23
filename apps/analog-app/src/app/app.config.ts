import {
  provideHttpClient,
  withFetch,
  withInterceptors,
} from '@angular/common/http';
import { ENVIRONMENT_INITIALIZER, TransferState, inject } from '@angular/core';
import type { ApplicationConfig } from '@angular/core';
import {
  provideClientHydration,
  withEventReplay,
} from '@angular/platform-browser';
import {
  provideFileRouter,
  withExtraRoutes,
  withDebugRoutes,
  requestContextInterceptor,
} from '@analogjs/router';
import { ANALOG_QUERY_STATE_KEY } from '@analogjs/router/tanstack-query';
import {
  QueryClient,
  provideTanStackQuery,
  hydrate,
} from '@tanstack/angular-query-experimental';
import type { DehydratedState } from '@tanstack/angular-query-experimental';
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
    ),
    provideHttpClient(
      withFetch(),
      withInterceptors([requestContextInterceptor]),
    ),
    provideTanStackQuery(new QueryClient()),
    {
      provide: ENVIRONMENT_INITIALIZER,
      multi: true,
      useValue() {
        if (import.meta.env.SSR) {
          return;
        }

        const transferState = inject(TransferState);
        const client = inject(QueryClient);
        const dehydratedState = transferState.get<DehydratedState | null>(
          ANALOG_QUERY_STATE_KEY,
          null,
        );

        if (dehydratedState) {
          hydrate(client, dehydratedState);
          transferState.remove(ANALOG_QUERY_STATE_KEY);
        }
      },
    },
    ...(import.meta.env.SSR ? [] : [provideClientHydration(withEventReplay())]),
  ],
};

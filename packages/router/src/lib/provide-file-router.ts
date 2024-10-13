import {
  ENVIRONMENT_INITIALIZER,
  EnvironmentProviders,
  makeEnvironmentProviders,
} from '@angular/core';
import { provideRouter, RouterFeatures, ROUTES, Routes } from '@angular/router';
import { API_PREFIX } from '@analogjs/router/tokens';
import { ɵHTTP_ROOT_INTERCEPTOR_FNS as HTTP_ROOT_INTERCEPTOR_FNS } from '@angular/common/http';

import { routes } from './routes';
import { updateMetaTagsOnRouteChange } from './meta-tags';
import { cookieInterceptor } from './cookie-interceptor';

declare const ANALOG_API_PREFIX: string;

/**
 * Sets up providers for the Angular router, and registers
 * file-based routes. Additional features can be provided
 * to further configure the behavior of the router.
 *
 * @param features
 * @returns Providers and features to configure the router with routes
 */
export function provideFileRouter(
  ...features: RouterFeatures[]
): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideRouter(routes, ...features),
    {
      provide: ENVIRONMENT_INITIALIZER,
      multi: true,
      useValue: () => updateMetaTagsOnRouteChange(),
    },
    {
      provide: HTTP_ROOT_INTERCEPTOR_FNS,
      multi: true,
      useValue: cookieInterceptor,
    },
    {
      provide: API_PREFIX,
      useFactory() {
        return typeof ANALOG_API_PREFIX !== 'undefined'
          ? ANALOG_API_PREFIX
          : 'api';
      },
    },
  ]);
}

export function withExtraRoutes(routes: Routes): RouterFeatures[] {
  return [
    {
      ɵkind: 100 as any,
      ɵproviders: [{ provide: ROUTES, useValue: routes }],
    },
  ];
}

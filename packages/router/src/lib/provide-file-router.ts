import {
  ENVIRONMENT_INITIALIZER,
  EnvironmentProviders,
  makeEnvironmentProviders,
} from '@angular/core';
import { provideRouter, RouterFeatures } from '@angular/router';
import { ɵHTTP_ROOT_INTERCEPTOR_FNS as HTTP_ROOT_INTERCEPTOR_FNS } from '@angular/common/http';

import { routes } from './routes';
import { updateMetaTagsOnRouteChange } from './meta-tags';
import { cookieInterceptor } from './cookie-interceptor';

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
  ]);
}

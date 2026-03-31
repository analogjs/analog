import {
  ENVIRONMENT_INITIALIZER,
  EnvironmentProviders,
  makeEnvironmentProviders,
} from '@angular/core';
import { ɵHTTP_ROOT_INTERCEPTOR_FNS as HTTP_ROOT_INTERCEPTOR_FNS } from '@angular/common/http';
import { provideRouter, RouterFeatures, ROUTES, Routes } from '@angular/router';
import { API_PREFIX } from '@analogjs/router/tokens';

import { cookieInterceptor } from './cookie-interceptor';
import { updateJsonLdOnRouteChange } from './json-ld';
import { updateMetaTagsOnRouteChange } from './meta-tags';

declare const ANALOG_API_PREFIX: string;

export function provideFileRouterWithRoutes(
  routes: Routes,
  ...features: RouterFeatures[]
): EnvironmentProviders {
  const extraRoutesFeature = features.filter((feat) => feat.ɵkind >= 100);
  const routerFeatures = features.filter((feat) => feat.ɵkind < 100);

  return makeEnvironmentProviders([
    extraRoutesFeature.map((erf) => erf.ɵproviders),
    provideRouter(routes, ...routerFeatures),
    {
      provide: ENVIRONMENT_INITIALIZER,
      multi: true,
      useValue: () => updateMetaTagsOnRouteChange(),
    },
    {
      provide: ENVIRONMENT_INITIALIZER,
      multi: true,
      useValue: () => updateJsonLdOnRouteChange(),
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

export function withExtraRoutes(routes: Routes): RouterFeatures {
  return {
    ɵkind: 100 as number,
    ɵproviders: [{ provide: ROUTES, useValue: routes, multi: true }],
  };
}

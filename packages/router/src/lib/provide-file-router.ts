import {
  ENVIRONMENT_INITIALIZER,
  EnvironmentProviders,
  makeEnvironmentProviders,
} from '@angular/core';
import { provideRouter, RouterFeatures, ROUTES, Routes } from '@angular/router';
import { API_PREFIX } from '@analogjs/router/tokens';
import { ɵHTTP_ROOT_INTERCEPTOR_FNS as HTTP_ROOT_INTERCEPTOR_FNS } from '@angular/common/http';

import { routes, createRoutes, Files, ROUTE_FILES } from './routes';
import { PAGE_ENDPOINTS } from './endpoints';
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

/**
 * Provides extra custom routes in addition to the routes
 * discovered from the filesystem-based routing. These routes are
 * inserted before the filesystem-based routes, and take priority in
 * route matching.
 */
export function withExtraRoutes(routes: Routes): RouterFeatures {
  return {
    ɵkind: 100 as number,
    ɵproviders: [{ provide: ROUTES, useValue: routes, multi: true }],
  };
}

/**
 * Provides file-based routes from an explicitly supplied files map,
 * for build integrations that cannot inject the route file glob into
 * this package's module graph (e.g. esbuild-based builds), where the
 * glob-derived `routes` array resolves to an empty array.
 */
export function withRouteFiles(files: Files): RouterFeatures {
  return {
    ɵkind: 101 as number,
    ɵproviders: [
      { provide: ROUTES, useValue: createRoutes(files), multi: true },
      { provide: ROUTE_FILES, useValue: files },
    ],
  };
}

/**
 * Provides page endpoint keys from an explicitly supplied map, for
 * build integrations that cannot inject the endpoint glob into this
 * package's module graph (e.g. esbuild-based builds). Routes whose
 * endpoint key is present fetch their server load data.
 */
export function withPageEndpoints(
  endpoints: Record<string, unknown>,
): RouterFeatures {
  return {
    ɵkind: 102 as number,
    ɵproviders: [{ provide: PAGE_ENDPOINTS, useValue: endpoints }],
  };
}

import {
  ENVIRONMENT_INITIALIZER,
  EnvironmentProviders,
  inject,
  makeEnvironmentProviders,
} from '@angular/core';
import { ɵHTTP_ROOT_INTERCEPTOR_FNS as HTTP_ROOT_INTERCEPTOR_FNS } from '@angular/common/http';
import { provideRouter, RouterFeatures, ROUTES, Routes } from '@angular/router';
import { API_PREFIX } from '@analogjs/router/tokens';

import { cookieInterceptor } from './cookie-interceptor';
import { updateJsonLdOnRouteChange } from './json-ld';
import { updateMetaTagsOnRouteChange } from './meta-tags';
import { createRoutes as createBaseRoutes } from './route-builder';
import {
  ANALOG_ROUTE_FILES,
  ANALOG_EXTRA_ROUTE_FILE_SOURCES,
  type ExtraRouteFileSource,
} from './route-files';
import type { RouteExport } from './models';

declare const ANALOG_API_PREFIX: string;

export function provideFileRouterWithRoutes(
  ...features: RouterFeatures[]
): EnvironmentProviders {
  const extraRoutesFeature = features.filter((feat) => feat.ɵkind >= 100);
  const routerFeatures = features.filter((feat) => feat.ɵkind < 100);

  return makeEnvironmentProviders([
    extraRoutesFeature.map((erf) => erf.ɵproviders),
    provideRouter([], ...routerFeatures),
    {
      provide: ROUTES,
      multi: true,
      useFactory: () => {
        const extraSources =
          inject(ANALOG_EXTRA_ROUTE_FILE_SOURCES, { optional: true }) ?? [];

        if (extraSources.length === 0) {
          return createBaseRoutes(
            ANALOG_ROUTE_FILES as Record<string, () => Promise<RouteExport>>,
            (_filename, fileLoader) => fileLoader as () => Promise<RouteExport>,
          );
        }

        const allFiles: Record<string, () => Promise<unknown>> = {
          ...(ANALOG_ROUTE_FILES as Record<string, () => Promise<unknown>>),
        };
        const resolverMap = new Map<
          string,
          ExtraRouteFileSource['resolveModule']
        >();

        if (import.meta.env.DEV) {
          const pageKeys = new Set(Object.keys(ANALOG_ROUTE_FILES));
          for (const source of extraSources) {
            for (const key of Object.keys(source.files)) {
              if (pageKeys.has(key)) {
                console.warn(
                  `[Analog] Route file "${key}" is registered by both page ` +
                    `routes and content routes. The content route resolver ` +
                    `will be used for this file.`,
                );
              }
            }
          }
        }

        for (const source of extraSources) {
          for (const [key, loader] of Object.entries(source.files)) {
            allFiles[key] = loader;
            resolverMap.set(key, source.resolveModule);
          }
        }

        return createBaseRoutes(allFiles, (filename, fileLoader) => {
          const resolver = resolverMap.get(filename);
          return resolver
            ? resolver(filename, fileLoader)
            : (fileLoader as () => Promise<RouteExport>);
        });
      },
    },
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

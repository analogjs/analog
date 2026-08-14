import {
  DOCUMENT,
  EnvironmentProviders,
  inject,
  makeEnvironmentProviders,
  provideAppInitializer,
} from '@angular/core';
import { ɵHTTP_ROOT_INTERCEPTOR_FNS as HTTP_ROOT_INTERCEPTOR_FNS } from '@angular/common/http';
import { Meta } from '@angular/platform-browser';
import { provideRouter, RouterFeatures, ROUTES, Routes } from '@angular/router';
import { Router } from '@angular/router';
import { API_PREFIX } from '../../tokens/src/index.js';

import { cookieInterceptor } from './cookie-interceptor';
import { updateJsonLdOnRouteChange } from './json-ld';
import { updateMetaTagsOnRouteChange } from './meta-tags';
import { createRoutes as createBaseRoutes } from './route-builder';
import {
  ANALOG_ROUTE_FILES,
  ANALOG_EXTRA_ROUTE_FILE_SOURCES,
  ANALOG_CONTENT_FILE_COUNT,
  type ExtraRouteFileSource,
} from './route-files';
import type { RouteExport } from './models';

declare const ANALOG_API_PREFIX: string;

export function provideFileRouterWithRoutes(
  ...features: RouterFeatures[]
): EnvironmentProviders {
  const extraRoutesFeature = features.filter((feat) => feat.ɵkind >= 100);
  const routerFeatures = features.filter((feat) => feat.ɵkind < 100);

  // Automatically register the debug route viewer during development.
  // Navigating to /__analog/routes shows all registered page and content
  // routes.  The import.meta.env.DEV guard ensures the debug page and its
  // component are tree-shaken from production builds.
  //
  // The debug route is passed directly to provideRouter() so it takes
  // priority over file-based catch-all routes like [...slug].  ROUTES
  // multi-providers are concatenated after provideRouter's initial routes,
  // so a catch-all in file routes would shadow an __analog/* ROUTES entry.
  const debugRoutes: Routes = import.meta.env.DEV
    ? [
        {
          path: '__analog/routes',
          loadComponent: () => import('./debug/debug.page'),
        },
      ]
    : [];

  return makeEnvironmentProviders([
    extraRoutesFeature.map((erf) => erf.ɵproviders),
    provideRouter(debugRoutes, ...routerFeatures),
    {
      provide: ROUTES,
      multi: true,
      useFactory: () => {
        const extraSources =
          inject(ANALOG_EXTRA_ROUTE_FILE_SOURCES, { optional: true }) ?? [];

        if (
          import.meta.env.DEV &&
          extraSources.length === 0 &&
          ANALOG_CONTENT_FILE_COUNT > 0
        ) {
          console.warn(
            `[Analog] ${ANALOG_CONTENT_FILE_COUNT} content route file(s) ` +
              `discovered but withContentRoutes() is not configured. ` +
              `Content routes will not be registered.\n\n` +
              `  import { withContentRoutes } from '@analogjs/router/content';\n` +
              `  provideFileRouter(withContentRoutes())\n`,
          );
        }

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
            allFiles[key] = loader as () => Promise<unknown>;
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
    provideAppInitializer(() => {
      const router = inject(Router);
      const meta = inject(Meta);
      const document = inject(DOCUMENT, { optional: true });

      updateMetaTagsOnRouteChange(router, meta);
      updateJsonLdOnRouteChange(router, document);
    }),
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

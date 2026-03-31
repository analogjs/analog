import { inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import type { Route } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import {
  injectInternalServerFetch,
  type ServerInternalFetch,
} from '@analogjs/router/tokens';

import {
  DefaultRouteMeta,
  RedirectRouteMeta,
  RouteConfig,
  RouteMeta,
} from './models';
import { ROUTE_JSON_LD_KEY, isJsonLdObject } from './json-ld';
import { ROUTE_META_TAGS_KEY } from './meta-tags';
import { ANALOG_PAGE_ENDPOINTS, ANALOG_META_KEY } from './endpoints';
import { injectRouteEndpointURL } from './inject-route-endpoint-url';

export function toRouteConfig(routeMeta: RouteMeta | undefined): RouteConfig {
  if (routeMeta && isRedirectRouteMeta(routeMeta)) {
    return routeMeta;
  }

  const defaultMeta: DefaultRouteMeta = (routeMeta ?? {}) as DefaultRouteMeta;
  const { meta, jsonLd, ...routeConfig } = defaultMeta;

  if (Array.isArray(meta)) {
    routeConfig.data = { ...routeConfig.data, [ROUTE_META_TAGS_KEY]: meta };
  } else if (typeof meta === 'function') {
    routeConfig.resolve = {
      ...routeConfig.resolve,
      [ROUTE_META_TAGS_KEY]: meta,
    };
  }

  if (Array.isArray(jsonLd) || isJsonLdObject(jsonLd)) {
    routeConfig.data = { ...routeConfig.data, [ROUTE_JSON_LD_KEY]: jsonLd };
  } else if (typeof jsonLd === 'function') {
    routeConfig.resolve = {
      ...routeConfig.resolve,
      [ROUTE_JSON_LD_KEY]: jsonLd,
    };
  }

  routeConfig.runGuardsAndResolvers =
    routeConfig.runGuardsAndResolvers ?? 'paramsOrQueryParamsChange';
  routeConfig.resolve = {
    ...routeConfig.resolve,
    load: async (route) => {
      const routeConfig = route.routeConfig as Route & {
        [ANALOG_META_KEY]: { endpoint: string; endpointKey: string };
      };

      if (ANALOG_PAGE_ENDPOINTS[routeConfig[ANALOG_META_KEY]?.endpointKey]) {
        const http = inject(HttpClient);
        const url = injectRouteEndpointURL(route);
        const internalFetch = injectInternalServerFetch();

        if (internalFetch) {
          return internalFetch(url.pathname);
        }

        const globalFetch = (
          globalThis as unknown as { $fetch?: ServerInternalFetch }
        ).$fetch;
        if (!!import.meta.env['VITE_ANALOG_PUBLIC_BASE_URL'] && globalFetch) {
          return globalFetch(url.pathname);
        }

        return firstValueFrom(http.get(`${url.href}`));
      }

      return {};
    },
  };

  return routeConfig;
}

function isRedirectRouteMeta(
  routeMeta: RouteMeta,
): routeMeta is RedirectRouteMeta {
  return !!routeMeta.redirectTo;
}

import { inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import type { Route } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { RedirectRouteMeta, RouteConfig, RouteMeta } from './models';
import { ROUTE_META_TAGS_KEY } from './meta-tags';
import { ANALOG_PAGE_ENDPOINTS, ANALOG_META_KEY } from './endpoints';
import { injectRouteEndpointURL } from './inject-route-endpoint-url';

export function toRouteConfig(routeMeta: RouteMeta | undefined): RouteConfig {
  if (routeMeta && isRedirectRouteMeta(routeMeta)) {
    return routeMeta;
  }

  const { meta, ...rest } = routeMeta ?? {};
  let routeConfig = { ...rest };

  if (Array.isArray(meta)) {
    routeConfig.data = { ...routeConfig.data, [ROUTE_META_TAGS_KEY]: meta };
  } else if (typeof meta === 'function') {
    routeConfig.resolve = {
      ...routeConfig.resolve,
      [ROUTE_META_TAGS_KEY]: meta,
    };
  }

  if (!routeConfig) {
    routeConfig = {};
  }

  routeConfig.runGuardsAndResolvers =
    routeConfig.runGuardsAndResolvers ?? 'paramsOrQueryParamsChange';
  routeConfig.resolve = {
    ...routeConfig.resolve,
    load: async (route) => {
      const routeConfig = route.routeConfig as Route & {
        [ANALOG_META_KEY]: { endpoint: string; endpointKey: string };
      };

      if (ANALOG_PAGE_ENDPOINTS[routeConfig[ANALOG_META_KEY].endpointKey]) {
        const http = inject(HttpClient);
        const url = injectRouteEndpointURL(route);

        if (
          !!import.meta.env['VITE_ANALOG_PUBLIC_BASE_URL'] &&
          (globalThis as any).$fetch
        ) {
          return (globalThis as any).$fetch(url.pathname);
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

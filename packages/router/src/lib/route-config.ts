import { inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import type { Route } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { RedirectRouteMeta, RouteConfig, RouteMeta } from './models';
import { ROUTE_META_TAGS_KEY } from './meta-tags';
import { PAGE_ENDPOINTS } from './endpoints';

export function toRouteConfig(routeMeta: RouteMeta | undefined): RouteConfig {
  if (routeMeta && isRedirectRouteMeta(routeMeta)) {
    return routeMeta;
  }

  let { meta, ...routeConfig } = routeMeta ?? {};

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

  routeConfig.resolve = {
    ...routeConfig.resolve,
    load: async (route) => {
      const http = inject(HttpClient);
      const { queryParams, fragment: hash, params } = route;
      const routeConfig = route.routeConfig as Route & {
        meta: { endpoint: string; endpointKey: string };
      };

      if (PAGE_ENDPOINTS[routeConfig.meta.endpointKey]) {
        const url = new URL('', import.meta.env['VITE_ANALOG_PUBLIC_BASE_URL']);
        url.pathname = `/api/_analog${routeConfig.meta.endpoint.replace(
          /\./g,
          '/'
        )}`;
        url.search = `${new URLSearchParams(queryParams).toString()}`;
        url.hash = hash ?? '';

        Object.keys(params).forEach((param) => {
          url.pathname = url.pathname.replace(`[${param}]`, params[param]);
        });

        return firstValueFrom(http.get(`${url.href}`));
      }

      return {};
    },
  };

  return routeConfig;
}

function isRedirectRouteMeta(
  routeMeta: RouteMeta
): routeMeta is RedirectRouteMeta {
  return !!routeMeta.redirectTo;
}

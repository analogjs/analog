import { inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import type { Route } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { RedirectRouteMeta, RouteConfig, RouteMeta } from './models';
import { ROUTE_META_TAGS_KEY } from './meta-tags';
import { PAGE_ENDPOINTS, ANALOG_META_KEY } from './endpoints';

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
      const routeConfig = route.routeConfig as Route & {
        [ANALOG_META_KEY]: { endpoint: string; endpointKey: string };
      };

      if (PAGE_ENDPOINTS[routeConfig[ANALOG_META_KEY].endpointKey]) {
        const { queryParams, fragment: hash, params, parent } = route;
        const segment =
          parent?.url.map((segment) => segment.path).join('/') || '';
        const url = new URL('', 'http://localhost:3000');
        url.pathname = `/api/_analog${routeConfig[ANALOG_META_KEY].endpoint}`;
        url.search = `${new URLSearchParams(queryParams).toString()}`;
        url.hash = hash ?? '';

        Object.keys(params).forEach((param) => {
          url.pathname = url.pathname.replace(`[${param}]`, params[param]);
        });
        url.pathname = url.pathname.replace('**', segment);

        if ((globalThis as any).$fetch) {
          return (globalThis as any).$fetch(url.pathname);
        }

        const http = inject(HttpClient);
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

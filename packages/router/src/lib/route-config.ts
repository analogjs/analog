import { inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import type { ActivatedRouteSnapshot, Route } from '@angular/router';
import { firstValueFrom } from 'rxjs';

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

const loadRequests = new WeakMap<ActivatedRouteSnapshot, Promise<unknown>>();

async function loadRouteData(route: ActivatedRouteSnapshot): Promise<unknown> {
  const routeConfig = route.routeConfig as Route & {
    [ANALOG_META_KEY]: { endpoint: string; endpointKey: string };
  };

  // Content routes (from .md files in the pages directory) do not have
  // ANALOG_META_KEY — it is only set on page routes (.page.ts) in
  // route-builder.ts.  The optional chain avoids a runtime crash when
  // the router resolves a content route during SSR / prerendering.
  if (ANALOG_PAGE_ENDPOINTS[routeConfig[ANALOG_META_KEY]?.endpointKey]) {
    const http = inject(HttpClient);
    const url = injectRouteEndpointURL(route);

    // On the server, requestContextInterceptor sends this through the
    // internal fetch when one is provided and records the response in
    // TransferState, so the client reuses it after hydration.
    return firstValueFrom(http.get(`${url.href}`));
  }

  return {};
}

export function toRouteConfig(
  routeMeta: RouteMeta<never> | undefined,
): RouteConfig {
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
    load: (route) => {
      let request = loadRequests.get(route);

      if (!request) {
        request = loadRouteData(route);
        loadRequests.set(route, request);
      }

      return request;
    },
  };

  return routeConfig as RouteConfig;
}

function isRedirectRouteMeta(
  routeMeta: RouteMeta<never>,
): routeMeta is RedirectRouteMeta {
  return routeMeta.redirectTo != null;
}

import {
  PLATFORM_ID,
  TransferState,
  inject,
  makeStateKey,
} from '@angular/core';
import { isPlatformServer } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import type { Route } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import {
  injectInternalServerFetch,
  type ServerInternalFetch,
} from '../../tokens/src/index.js';

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

      // Content routes (from .md files in the pages directory) do not have
      // ANALOG_META_KEY — it is only set on page routes (.page.ts) in
      // route-builder.ts.  The optional chain avoids a runtime crash when
      // the router resolves a content route during SSR / prerendering.
      if (ANALOG_PAGE_ENDPOINTS[routeConfig[ANALOG_META_KEY]?.endpointKey]) {
        const http = inject(HttpClient);
        const url = injectRouteEndpointURL(route);
        const transferState = inject(TransferState);
        const isServer = isPlatformServer(inject(PLATFORM_ID));
        const stateKey = makeStateKey<unknown>(
          `analog-load:${url.pathname}${url.search}`,
        );
        if (!isServer && transferState.hasKey(stateKey)) {
          const data = transferState.get(stateKey, null);
          transferState.remove(stateKey);
          return data;
        }

        const internalFetch = injectInternalServerFetch();
        const globalFetch = (
          globalThis as unknown as { $fetch?: ServerInternalFetch }
        ).$fetch;
        const serverFetch =
          internalFetch ??
          (import.meta.env['VITE_ANALOG_PUBLIC_BASE_URL']
            ? globalFetch
            : undefined);
        const data = serverFetch
          ? await serverFetch(`${url.pathname}${url.search}`)
          : await firstValueFrom(
              http.get(`${url.href}`, { transferCache: false }),
            );

        if (isServer) {
          transferState.set(stateKey, data);
        }
        return data;
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

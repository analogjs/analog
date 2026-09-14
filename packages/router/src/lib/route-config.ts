import {
  PLATFORM_ID,
  TransferState,
  inject,
  makeStateKey,
} from '@angular/core';
import { isPlatformServer } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import {
  Router,
  type Route,
  type ActivatedRouteSnapshot,
} from '@angular/router';
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
    load: reusePageLoad(async (route) => {
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
        const internalFetch = injectInternalServerFetch();
        const transferState = inject(TransferState);
        const server = isPlatformServer(inject(PLATFORM_ID));
        // An exact endpoint/query identity avoids origin differences between
        // prerender and the browser, and does not truncate identity to a hash.
        const key = makeStateKey<{ value: unknown }>(
          `analog:page-load:${url.pathname}${url.search}`,
        );
        if (!server && transferState.hasKey(key)) {
          const seed = transferState.get(key, { value: undefined });
          transferState.remove(key);
          if (!inject(Router).navigated) return seed.value;
        }
        const globalFetch = (
          globalThis as unknown as { $fetch?: ServerInternalFetch }
        ).$fetch;
        const serverFetch = server
          ? (internalFetch ??
            (import.meta.env?.['VITE_ANALOG_PUBLIC_BASE_URL']
              ? globalFetch
              : undefined))
          : undefined;
        const value = serverFetch
          ? await serverFetch(`${url.pathname}${url.search}`)
          : await firstValueFrom(http.get(url.href, { transferCache: false }));
        // Keep an envelope so an undefined result survives JSON serialization.
        if (server) transferState.set(key, { value });
        return value;
      }

      return {};
    }),
  };

  return routeConfig;
}

function reusePageLoad(
  load: (route: ActivatedRouteSnapshot) => Promise<unknown>,
): (route: ActivatedRouteSnapshot) => Promise<unknown> {
  const pending = new WeakMap<ActivatedRouteSnapshot, Promise<unknown>>();
  return (route) => {
    const existing = pending.get(route);
    if (existing) return existing;
    const value = load(route);
    pending.set(route, value);
    return value;
  };
}

function isRedirectRouteMeta(
  routeMeta: RouteMeta,
): routeMeta is RedirectRouteMeta {
  return !!routeMeta.redirectTo;
}

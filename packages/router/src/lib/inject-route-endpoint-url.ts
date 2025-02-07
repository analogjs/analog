import type { ActivatedRouteSnapshot, Route } from '@angular/router';
import { injectBaseURL, injectAPIPrefix } from '@analogjs/router/tokens';

import { ANALOG_META_KEY } from './endpoints';

export function injectRouteEndpointURL(route: ActivatedRouteSnapshot) {
  const routeConfig = route.routeConfig as Route & {
    [ANALOG_META_KEY]: { endpoint: string; endpointKey: string };
  };

  const apiPrefix = injectAPIPrefix();
  const baseUrl = injectBaseURL();
  const { queryParams, fragment: hash, params, parent } = route;
  const segment = parent?.url.map((segment) => segment.path).join('/') || '';
  const url = new URL(
    '',
    import.meta.env['VITE_ANALOG_PUBLIC_BASE_URL'] ||
      baseUrl ||
      (typeof window !== 'undefined' && window.location.origin
        ? window.location.origin
        : ''),
  );
  url.pathname = `${
    url.pathname.endsWith('/') ? url.pathname : url.pathname + '/'
  }${apiPrefix}/_analog${routeConfig[ANALOG_META_KEY].endpoint}`;
  url.search = `${new URLSearchParams(queryParams).toString()}`;
  url.hash = hash ?? '';

  Object.keys(params).forEach((param) => {
    url.pathname = url.pathname.replace(`[${param}]`, params[param]);
  });
  url.pathname = url.pathname.replace('**', segment);

  return url;
}

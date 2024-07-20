import { TransferState, inject, makeStateKey } from '@angular/core';
import { HttpHandlerFn, HttpRequest, HttpResponse } from '@angular/common/http';

import { from, of } from 'rxjs';

import { injectBaseURL } from '@analogjs/router/tokens';

/**
 * Interceptor that is server-aware when making HttpClient requests.
 * Server-side requests use the full URL
 * Prerendering uses the internal Nitro $fetch function, along with state transfer
 * Client-side requests use the window.location.origin
 *
 * @param req HttpRequest<unknown>
 * @param next HttpHandlerFn
 * @returns
 */
export function requestContextInterceptor(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
) {
  const baseUrl = injectBaseURL();
  const transferState = inject(TransferState);
  const storeKey = makeStateKey<unknown>(`analog_${req.urlWithParams}`);

  // during prerendering with Nitro
  if (
    typeof global !== 'undefined' &&
    global.$fetch &&
    baseUrl &&
    (req.url.startsWith('/') || req.url.startsWith(baseUrl))
  ) {
    const requestUrl = new URL(req.url, baseUrl);

    return from(
      global
        .$fetch(requestUrl.pathname, {
          method: req.method as any,
          params: requestUrl.searchParams,
        })
        .then((res) => {
          const transferResponse = new HttpResponse({
            body: res,
            status: 200,
            statusText: 'OK',
            url: req.urlWithParams,
          });

          transferState.set(storeKey, transferResponse);
          return transferResponse;
        })
    );
  }

  // on the client
  if (!import.meta.env.SSR && req.url.startsWith('/')) {
    const cacheResponse = transferState.get(storeKey, null);

    if (cacheResponse) {
      transferState.remove(storeKey);
      return of(new HttpResponse(cacheResponse));
    }

    return next(
      req.clone({
        url: `${window.location.origin}${req.url}`,
      })
    );
  }

  // on the server
  if (baseUrl && (req.url.startsWith('/') || req.url.startsWith(baseUrl))) {
    const requestUrl =
      req.url.startsWith(baseUrl) && !req.url.startsWith('/')
        ? req.url
        : `${baseUrl}${req.url}`;

    return next(
      req.clone({
        url: requestUrl,
      })
    );
  }

  return next(req);
}

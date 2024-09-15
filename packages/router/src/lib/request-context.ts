import { TransferState, inject, makeStateKey } from '@angular/core';
import {
  HttpHandlerFn,
  HttpHeaders,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';

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
  next: HttpHandlerFn,
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
    const fetchUrl = req.url.includes('/api/')
      ? requestUrl.pathname
      : requestUrl.href;
    const responseType =
      req.responseType === 'arraybuffer' ? 'arrayBuffer' : req.responseType;

    return from(
      global.$fetch
        .raw(fetchUrl, {
          method: req.method as any,
          params: requestUrl.searchParams,
          responseType,
          headers: req.headers.keys().reduce((hdrs, current) => {
            return {
              ...hdrs,
              [current]: req.headers.get(current),
            };
          }, {}),
        })
        .then((res) => {
          const cacheResponse = {
            body: res._data,
            headers: new HttpHeaders(res.headers),
            status: 200,
            statusText: 'OK',
            url: fetchUrl,
          };
          const transferResponse = new HttpResponse(cacheResponse);

          transferState.set(storeKey, cacheResponse);
          return transferResponse;
        }),
    );
  }

  // on the client
  if (!import.meta.env.SSR && req.url.startsWith('/')) {
    const cacheRestoreResponse = transferState.get(storeKey, null);

    if (cacheRestoreResponse) {
      transferState.remove(storeKey);
      return of(new HttpResponse(cacheRestoreResponse));
    }

    return next(
      req.clone({
        url: `${window.location.origin}${req.url}`,
      }),
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
      }),
    );
  }

  return next(req);
}

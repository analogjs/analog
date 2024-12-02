import { StateKey, TransferState, inject, makeStateKey } from '@angular/core';
import {
  HttpHandlerFn,
  HttpHeaders,
  HttpParams,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';

import { from, of } from 'rxjs';

import { injectBaseURL, injectAPIPrefix } from '@analogjs/router/tokens';

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
  const apiPrefix = injectAPIPrefix();
  const baseUrl = injectBaseURL();
  const transferState = inject(TransferState);

  // during prerendering with Nitro
  if (
    typeof global !== 'undefined' &&
    global.$fetch &&
    baseUrl &&
    (req.url.startsWith('/') ||
      req.url.startsWith(baseUrl) ||
      req.url.startsWith(`/${apiPrefix}`))
  ) {
    const requestUrl = new URL(req.url, baseUrl);
    const cacheKey = makeCacheKey(req, new URL(requestUrl).pathname);
    const storeKey = makeStateKey<unknown>(`analog_${cacheKey}`);
    const fetchUrl = requestUrl.pathname;

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
        })
    );
  }

  // on the client
  if (
    !import.meta.env.SSR &&
    (req.url.startsWith('/') || req.url.includes('/_analog/'))
  ) {
    // /_analog/ requests are full URLs
    const requestUrl = req.url.includes('/_analog/')
      ? req.url
      : `${window.location.origin}${req.url}`;
    const cacheKey = makeCacheKey(req, new URL(requestUrl).pathname);
    const storeKey = makeStateKey<unknown>(`analog_${cacheKey}`);
    const cacheRestoreResponse = transferState.get(storeKey, null);

    if (cacheRestoreResponse) {
      transferState.remove(storeKey);
      return of(new HttpResponse(cacheRestoreResponse));
    }

    return next(
      req.clone({
        url: requestUrl,
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

function sortAndConcatParams(params: HttpParams | URLSearchParams): string {
  return [...params.keys()]
    .sort()
    .map((k) => `${k}=${params.getAll(k)}`)
    .join('&');
}

function makeCacheKey(
  request: HttpRequest<any>,
  mappedRequestUrl: string
): StateKey<unknown> {
  // make the params encoded same as a url so it's easy to identify
  const { params, method, responseType } = request;
  const encodedParams = sortAndConcatParams(params);

  let serializedBody = request.serializeBody();
  if (serializedBody instanceof URLSearchParams) {
    serializedBody = sortAndConcatParams(serializedBody);
  } else if (typeof serializedBody !== 'string') {
    serializedBody = '';
  }

  const key = [
    method,
    responseType,
    mappedRequestUrl,
    serializedBody,
    encodedParams,
  ].join('|');

  const hash = generateHash(key);

  return makeStateKey(hash);
}

function generateHash(str: string) {
  let hash = 0;
  for (let i = 0, len = str.length; i < len; i++) {
    let chr = str.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0; // Convert to 32bit integer
  }
  return `${hash}`;
}

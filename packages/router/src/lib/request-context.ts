import { TransferState, inject, makeStateKey } from '@angular/core';
import {
  HttpHandlerFn,
  HttpHeaders,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';

import { from, of } from 'rxjs';

import {
  injectBaseURL,
  injectAPIPrefix,
  injectInternalServerFetch,
} from '@analogjs/router/tokens';

import { makeCacheKey } from './cache-key';

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
  const apiPrefix = injectAPIPrefix();
  const baseUrl = injectBaseURL();
  const transferState = inject(TransferState);
  const nitroGlobal = globalThis as typeof globalThis & { $fetch?: any };
  const internalFetch = injectInternalServerFetch();
  const serverFetch = internalFetch ?? nitroGlobal.$fetch;

  // during prerendering with Nitro
  if (
    serverFetch &&
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

    return from<Promise<HttpResponse<unknown>>>(
      serverFetch
        .raw(fetchUrl, {
          method: req.method as any,
          body: req.body ? req.body : undefined,
          params: requestUrl.searchParams,
          responseType,
          headers: req.headers
            .keys()
            .reduce((hdrs: Record<string, string | null>, current: string) => {
              return {
                ...hdrs,
                [current]: req.headers.get(current),
              };
            }, {}),
        })
        .then((res: any) => {
          const cacheResponse = {
            body: res._data,
            headers: new HttpHeaders(res.headers),
            status: res.status ?? 200,
            statusText: res.statusText ?? 'OK',
            url: fetchUrl,
          };
          const transferResponse = new HttpResponse(cacheResponse);

          transferState.set(storeKey, cacheResponse);
          return transferResponse;
        }),
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

import { TransferState, inject, makeStateKey } from '@angular/core';
import {
  HttpEvent,
  HttpHandlerFn,
  HttpHeaders,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';

import { from, Observable, of } from 'rxjs';

import type { HTTPMethod } from 'nitro/h3';

import {
  injectBaseURL,
  injectAPIPrefix,
  injectInternalServerFetch,
  type ServerInternalFetch,
} from '@analogjs/router/tokens';

import { makeCacheKey } from './cache-key';

function mergeFetchParams(
  requestUrl: URL,
  request: HttpRequest<unknown>,
): Record<string, string | string[]> | undefined {
  const merged = new Map<string, string[]>();

  for (const key of requestUrl.searchParams.keys()) {
    const values = requestUrl.searchParams.getAll(key);

    if (values.length > 0) {
      merged.set(key, values);
    }
  }

  for (const key of request.params.keys()) {
    const values = request.params.getAll(key);

    if (values?.length) {
      merged.set(key, values);
    }
  }

  if (merged.size === 0) {
    return undefined;
  }

  return [...merged.entries()].reduce<Record<string, string | string[]>>(
    (params, [key, values]) => {
      params[key] = values.length === 1 ? values[0] : values;
      return params;
    },
    {},
  );
}

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
): Observable<HttpEvent<unknown>> {
  const apiPrefix = injectAPIPrefix();
  const baseUrl = injectBaseURL();
  const transferState = inject(TransferState);
  const nitroGlobal = globalThis as typeof globalThis & {
    $fetch?: ServerInternalFetch;
  };
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
    const fetchParams = mergeFetchParams(requestUrl, req);

    const responseType =
      req.responseType === 'arraybuffer' ? 'arrayBuffer' : req.responseType;

    return from<Promise<HttpResponse<unknown>>>(
      serverFetch
        .raw(fetchUrl, {
          method: req.method as HTTPMethod,
          body: req.body ? req.body : undefined,
          params: fetchParams,
          responseType,
          headers: req.headers
            .keys()
            .reduce((hdrs: Record<string, string>, current: string) => {
              const value = req.headers.get(current);
              return value != null ? { ...hdrs, [current]: value } : hdrs;
            }, {}),
        })
        .then((res) => {
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

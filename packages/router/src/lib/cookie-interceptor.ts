import { isPlatformServer } from '@angular/common';
import { HttpHandlerFn, HttpRequest, HttpEvent } from '@angular/common/http';
import { PLATFORM_ID, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { injectRequest, type ServerRequest } from '../../tokens/src/index.js';

export function cookieInterceptor(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
  location: string | object = inject(PLATFORM_ID),
  serverRequest: ServerRequest | null = injectRequest(),
): Observable<HttpEvent<unknown>> {
  const cookies = serverRequest?.headers.cookie;
  if (
    !isPlatformServer(location) ||
    !cookies ||
    req.headers.has('cookie') ||
    !isLocalPageEndpoint(req.url, serverRequest)
  )
    return next(req);
  return next(req.clone({ setHeaders: { cookie: cookies } }));
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return (Array.isArray(value) ? value[0] : value)?.split(',')[0]?.trim();
}

function isLocalPageEndpoint(
  url: string,
  request: ServerRequest | null,
): boolean {
  if (url.startsWith('/') && !url.startsWith('//')) {
    const target = new URL(url, 'http://relative.invalid');
    return (
      target.origin === 'http://relative.invalid' &&
      target.pathname.includes('/_analog/')
    );
  }
  const host = firstHeader(
    request?.headers['x-forwarded-host'] ?? request?.headers.host,
  );
  if (!host) return false;
  const secure =
    firstHeader(request?.headers['x-forwarded-proto']) === 'https' ||
    (request?.connection as { encrypted?: boolean } | undefined)?.encrypted;
  try {
    const origin = new URL(`${secure ? 'https' : 'http'}://${host}`);
    const target = new URL(url, origin);
    return (
      target.origin === origin.origin && target.pathname.includes('/_analog/')
    );
  } catch {
    return false;
  }
}

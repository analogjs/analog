import { isPlatformServer } from '@angular/common';
import {
  HttpHandlerFn,
  HttpHeaders,
  HttpRequest,
  HttpEvent,
} from '@angular/common/http';
import { PLATFORM_ID, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { injectRequest, ServerRequest } from '@analogjs/router/tokens';

export function cookieInterceptor(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
  location: Object = inject(PLATFORM_ID),
  serverRequest: ServerRequest | null = injectRequest(),
): Observable<HttpEvent<unknown>> {
  if (isPlatformServer(location) && req.url.includes('/_analog/')) {
    let headers = new HttpHeaders();
    const cookies = serverRequest?.headers.cookie;
    headers = headers.set('cookie', cookies ?? '');

    const cookiedRequest = req.clone({
      headers,
    });

    return next(cookiedRequest);
  } else {
    return next(req);
  }
}

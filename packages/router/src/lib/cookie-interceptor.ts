import { isPlatformServer } from '@angular/common';
import { HttpHandlerFn, HttpHeaders, HttpRequest } from '@angular/common/http';
import { PLATFORM_ID, inject } from '@angular/core';
import { injectRequest } from '@analogjs/router/tokens';

export function cookieInterceptor(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
  location = inject(PLATFORM_ID),
  serverRequest = injectRequest()
) {
  if (isPlatformServer(location)) {
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

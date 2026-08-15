import { StaticProvider, ɵresetCompiledComponents } from '@angular/core';
import { ɵSERVER_CONTEXT as SERVER_CONTEXT } from '@angular/platform-server';

import {
  BASE_URL,
  LOCALE,
  REQUEST,
  RESPONSE,
  ServerRequest,
  ServerResponse,
  detectLocale,
} from '@analogjs/router/tokens';
import { SERVER_FN_DISPATCHER } from '@analogjs/router';

import { createServerFnDispatcher } from './server-fn/ssr-dispatcher';

export function provideServerContext({
  req,
  res,
}: {
  req: ServerRequest;
  res: ServerResponse;
}): StaticProvider[] {
  const baseUrl = getBaseUrl(req);
  const locale = detectLocale(req);

  // Optional chaining: a Nitro-bundled caller has no `import.meta.env` at all.
  if (import.meta.env?.DEV) {
    ɵresetCompiledComponents();
  }

  return [
    { provide: SERVER_CONTEXT, useValue: 'ssr-analog' },
    { provide: REQUEST, useValue: req },
    { provide: RESPONSE, useValue: res },
    { provide: BASE_URL, useValue: baseUrl },
    // Server functions called while rendering run in-process, in this injector.
    {
      provide: SERVER_FN_DISPATCHER,
      useValue: createServerFnDispatcher(req, res),
    },
    ...(locale ? [{ provide: LOCALE, useValue: locale }] : []),
  ];
}

export {
  detectLocale,
  extractLocaleFromUrl,
  parseAcceptLanguage,
} from '@analogjs/router/tokens';

export function getBaseUrl(req: ServerRequest) {
  const protocol = getRequestProtocol(req);
  const { headers } = req;
  // Node's `IncomingMessage` has no `originalUrl`, and a server function
  // endpoint is reached with a plain request, so fall back before dereferencing.
  const originalUrl = req.originalUrl || req.url || '/';
  const parsedUrl = new URL(
    '',
    `${protocol}://${headers.host}${
      originalUrl.endsWith('/')
        ? originalUrl.substring(0, originalUrl.length - 1)
        : originalUrl
    }`,
  );
  const baseUrl = parsedUrl.origin;

  return baseUrl;
}

export function getRequestProtocol(
  req: ServerRequest,
  opts: { xForwardedProto?: boolean } = {},
) {
  if (
    opts.xForwardedProto !== false &&
    req.headers['x-forwarded-proto'] === 'https'
  ) {
    return 'https';
  }

  return (req.connection as any)?.encrypted ? 'https' : 'http';
}

import { StaticProvider, ɵresetCompiledComponents } from '@angular/core';
import { ɵSERVER_CONTEXT as SERVER_CONTEXT } from '@angular/platform-server';

import {
  BASE_URL,
  REQUEST,
  RESPONSE,
  ServerRequest,
  ServerResponse,
} from '@analogjs/router/tokens';

export function providerServerContext({
  req,
  res,
}: {
  req: ServerRequest;
  res: ServerResponse;
}): StaticProvider[] {
  const baseUrl = getBaseUrl(req);

  if (import.meta.env.DEV) {
    ɵresetCompiledComponents();
  }

  return [
    { provide: SERVER_CONTEXT, useValue: 'ssr-analog' },
    { provide: REQUEST, useValue: req },
    { provide: RESPONSE, useValue: res },
    { provide: BASE_URL, useValue: baseUrl },
  ];
}

export function getBaseUrl(req: ServerRequest) {
  const protocol = getRequestProtocol(req);
  const { originalUrl, headers } = req;
  const parsedUrl = new URL(
    '',
    `${protocol}://${headers.host}${
      originalUrl.endsWith('/')
        ? originalUrl.substring(0, originalUrl.length - 1)
        : originalUrl
    }`
  );
  const baseUrl = parsedUrl.origin;

  return baseUrl;
}

export function getRequestProtocol(
  req: ServerRequest,
  opts: { xForwardedProto?: boolean } = {}
) {
  if (
    opts.xForwardedProto !== false &&
    req.headers['x-forwarded-proto'] === 'https'
  ) {
    return 'https';
  }

  return (req.connection as any)?.encrypted ? 'https' : 'http';
}

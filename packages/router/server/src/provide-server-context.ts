import { StaticProvider, ɵresetCompiledComponents } from '@angular/core';
import { ɵSERVER_CONTEXT as SERVER_CONTEXT } from '@angular/platform-server';

import {
  BASE_URL,
  INTERNAL_FETCH,
  REQUEST,
  RESPONSE,
  ServerInternalFetch,
  ServerRequest,
  ServerResponse,
} from '@analogjs/router/tokens';

function getHeaderValue(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function getRequestHeader(
  req: ServerRequest,
  name: string,
): string | undefined {
  const headers = (req as { headers?: unknown }).headers;

  if (!headers) {
    return undefined;
  }

  if (
    typeof headers === 'object' &&
    headers !== null &&
    'get' in headers &&
    typeof headers.get === 'function'
  ) {
    return headers.get(name) ?? undefined;
  }

  return getHeaderValue(
    (headers as Record<string, string | string[] | undefined>)[name],
  );
}

export function provideServerContext({
  req,
  res,
  fetch,
}: {
  req: ServerRequest;
  res: ServerResponse;
  fetch?: ServerInternalFetch;
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
    { provide: INTERNAL_FETCH, useValue: fetch },
  ];
}

export function getBaseUrl(req: ServerRequest): string {
  const protocol = getRequestProtocol(req);
  const host =
    getRequestHeader(req, 'x-forwarded-host') ??
    getRequestHeader(req, 'host') ??
    'localhost';
  const originalUrl = req.originalUrl || req.url || '/';
  const parsedUrl = new URL(
    '',
    `${protocol}://${host}${
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
): string {
  const forwardedProto = getRequestHeader(req, 'x-forwarded-proto')
    ?.split(',')[0]
    ?.trim();

  if (opts.xForwardedProto !== false && forwardedProto === 'https') {
    return 'https';
  }

  return (req.connection as any)?.encrypted ? 'https' : 'http';
}

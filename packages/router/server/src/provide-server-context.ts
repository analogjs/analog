import { StaticProvider, ɵresetCompiledComponents } from '@angular/core';
import { ɵSERVER_CONTEXT as SERVER_CONTEXT } from '@angular/platform-server';

import {
  BASE_URL,
  INTERNAL_FETCH,
  LOCALE,
  REQUEST,
  RESPONSE,
  ServerInternalFetch,
  ServerRequest,
  ServerResponse,
} from '../../tokens/src/index.js';

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
  const locale = detectLocale(req);

  if (import.meta.env.DEV) {
    ɵresetCompiledComponents();
  }

  return [
    { provide: SERVER_CONTEXT, useValue: 'ssr-analog' },
    { provide: REQUEST, useValue: req },
    { provide: RESPONSE, useValue: res },
    { provide: BASE_URL, useValue: baseUrl },
    { provide: INTERNAL_FETCH, useValue: fetch },
    ...(locale ? [{ provide: LOCALE, useValue: locale }] : []),
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

  return (req.connection as { encrypted?: boolean })?.encrypted
    ? 'https'
    : 'http';
}

/**
 * Detects the locale from the request URL path prefix or Accept-Language header.
 * URL prefix takes priority (e.g. /fr/about -> 'fr').
 */
export function detectLocale(req: ServerRequest): string | undefined {
  const url = req.originalUrl || req.url || '';
  const localeFromUrl = extractLocaleFromUrl(url);
  if (localeFromUrl) {
    return localeFromUrl;
  }

  return parseAcceptLanguage(req.headers['accept-language']);
}

/**
 * Extracts a locale from the first URL path segment if it matches
 * a BCP 47-like pattern (e.g. 'en', 'en-US', 'zh-Hans-CN').
 */
export function extractLocaleFromUrl(url: string): string | undefined {
  const pathname = url.split('?')[0];
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) {
    return undefined;
  }

  const firstSegment = segments[0];
  // Match BCP 47 language tags: 2-letter language code with optional region/script
  if (/^[a-z]{2}(-[a-zA-Z]{2,4})?(-[a-zA-Z]{2}|\d{3})?$/.test(firstSegment)) {
    return firstSegment;
  }

  return undefined;
}

/**
 * Parses the Accept-Language header and returns the most preferred language.
 */
export function parseAcceptLanguage(
  header: string | undefined,
): string | undefined {
  if (!header) {
    return undefined;
  }

  const locales = header
    .split(',')
    .map((part) => {
      const [locale, qPart] = part.trim().split(';');
      const q = qPart ? parseFloat(qPart.replace('q=', '')) : 1;
      return { locale: locale.trim(), q };
    })
    .sort((a, b) => b.q - a.q);

  return locales[0]?.locale || undefined;
}

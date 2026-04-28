import { StaticProvider, ɵresetCompiledComponents } from '@angular/core';
import { ɵSERVER_CONTEXT as SERVER_CONTEXT } from '@angular/platform-server';

import {
  BASE_URL,
  LOCALE,
  REQUEST,
  RESPONSE,
  ServerRequest,
  ServerResponse,
} from '@analogjs/router/tokens';

export function provideServerContext({
  req,
  res,
}: {
  req: ServerRequest;
  res: ServerResponse;
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
    ...(locale ? [{ provide: LOCALE, useValue: locale }] : []),
  ];
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
  // e.g. 'en', 'en-US', 'zh-Hans', 'zh-Hans-CN'
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

export function getBaseUrl(req: ServerRequest) {
  const protocol = getRequestProtocol(req);
  const { originalUrl, headers } = req;
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

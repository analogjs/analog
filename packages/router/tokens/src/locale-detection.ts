import type { ServerRequest } from './index';

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

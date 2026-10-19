import type { PrerenderRoute } from 'nitro/types';
import type { I18nPrerenderOptions } from './types.js';

/**
 * Expands a list of routes to include locale-prefixed variants.
 *
 * For each route and each locale, generates a prefixed route:
 *   '/' + locale + route
 *
 * The default locale's routes are included both with and without the prefix
 * so that `/about` and `/en/about` both render.
 */
export function expandRoutesWithLocales(
  routes: string[],
  i18n: I18nPrerenderOptions,
): string[] {
  const expanded: string[] = [];

  for (const route of routes) {
    // Skip locale expansion for internal analog endpoints and API routes.
    // `startsWith('/api/')` alone misses the bare `/api` path, which
    // would otherwise get locale-prefixed and produce phantom routes like
    // `/en/api`.
    if (
      route.includes('/_analog/') ||
      route === '/api' ||
      route.startsWith('/api/')
    ) {
      expanded.push(route);
      continue;
    }

    for (const locale of i18n.locales) {
      const prefix = `/${locale}`;
      const localizedRoute = route === '/' ? prefix : `${prefix}${route}`;
      expanded.push(localizedRoute);
    }

    if (!expanded.includes(route)) {
      expanded.push(route);
    }
  }

  return expanded;
}

/**
 * Creates a post-rendering hook that injects the `lang` attribute
 * into the `<html>` tag of prerendered pages based on the route's
 * locale prefix.
 */
export function createI18nPostRenderingHook(
  i18n: I18nPrerenderOptions,
): (route: PrerenderRoute) => Promise<void> {
  return async (route: PrerenderRoute) => {
    if (!route.contents || typeof route.contents !== 'string') {
      return;
    }

    const locale = detectLocaleFromRoute(route.route, i18n);
    if (!locale) {
      return;
    }

    route.contents = setHtmlLang(route.contents, locale);
  };
}

/**
 * Detects the locale from a prerendered route path by checking
 * the first path segment against the configured locales.
 */
export function detectLocaleFromRoute(
  route: string,
  i18n: I18nPrerenderOptions,
): string {
  const segments = route.split('/').filter(Boolean);
  const firstSegment = segments[0];

  if (firstSegment && i18n.locales.includes(firstSegment)) {
    return firstSegment;
  }

  return i18n.defaultLocale;
}

/**
 * Sets the `lang` attribute on the `<html>` tag in an HTML string.
 * If a `lang` attribute already exists, it is replaced.
 * If no `lang` attribute exists, it is added.
 */
export function setHtmlLang(html: string, locale: string): string {
  if (/<html[^>]*\slang\s*=\s*["'][^"']*["']/i.test(html)) {
    return html.replace(
      /(<html[^>]*\s)lang\s*=\s*["'][^"']*["']/i,
      `$1lang="${locale}"`,
    );
  }

  return html.replace(/<html/i, `<html lang="${locale}"`);
}

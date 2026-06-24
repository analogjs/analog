import { injectRequest } from '@analogjs/router/tokens';

/**
 * Locales served under a `/<code>/` prefix. English is the unprefixed
 * default and is intentionally NOT listed here. Used by the route
 * matcher in app.config.ts (which runs pre-bootstrap, before any
 * provider is available to inject).
 */
export const SUPPORTED_LOCALES = ['de', 'es', 'pt-br', 'zh-hans'] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

const SUPPORTED = new Set<string>(SUPPORTED_LOCALES);

function extractLocale(path: string): SupportedLocale | null {
  const first = path.split('?')[0].split('/').filter(Boolean)[0];
  return first && SUPPORTED.has(first) ? (first as SupportedLocale) : null;
}

/**
 * Resolve the active locale from the request (server) or window
 * pathname (browser). Returns null when on the default-locale
 * (unprefixed) path. Call in an injection context.
 */
export function resolveActiveLocale(): SupportedLocale | null {
  const req = injectRequest();
  if (req) {
    return extractLocale(req.originalUrl ?? req.url ?? '/');
  }
  if (typeof window !== 'undefined') {
    return extractLocale(window.location.pathname);
  }
  return null;
}

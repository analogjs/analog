import { inject } from '@angular/core';
import { injectRequest } from '@analogjs/router/tokens';

export const SUPPORTED_LOCALES = [
  'de',
  'es',
  'fr',
  'ko',
  'pt-br',
  'tr',
  'zh-hans',
] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

const SUPPORTED = new Set<string>(SUPPORTED_LOCALES);

function extractLocale(path: string): SupportedLocale | null {
  const first = path.split('?')[0].split('/').filter(Boolean)[0];
  return first && SUPPORTED.has(first) ? (first as SupportedLocale) : null;
}

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

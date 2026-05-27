import { inject, type Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map, startWith } from 'rxjs/operators';
import { injectRequest } from '@analogjs/router/tokens';

export const SUPPORTED_LOCALES = ['de', 'es', 'pt-br', 'zh-hans'] as const;

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

/**
 * Router-reactive locale. Components that build hrefs from the locale
 * (sidebar, prev/next, etc.) should call this in field initializers so
 * the hrefs re-evaluate when the user navigates between locales.
 */
export function useLocaleSignal(): Signal<SupportedLocale | null> {
  const router = inject(Router);
  const initial = extractLocale(router.url);
  return toSignal(
    router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(() => extractLocale(router.url)),
      startWith(initial),
    ),
    { initialValue: initial },
  );
}

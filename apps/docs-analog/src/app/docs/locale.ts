import { inject, type Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map, startWith } from 'rxjs/operators';
import { injectDocsConfig } from './config';

function extractLocale(path: string, codes: Set<string>): string | null {
  const first = path.split('?')[0].split('/').filter(Boolean)[0];
  return first && codes.has(first) ? first : null;
}

function nonDefaultLocaleCodes(): Set<string> {
  const config = injectDocsConfig();
  const defaultCode = config.locales?.default;
  const list = config.locales?.list ?? [];
  return new Set(
    list.map((l) => l.code).filter((code) => code !== defaultCode),
  );
}

/**
 * Router-reactive locale signal. Components that build hrefs from the
 * active locale (sidebar, prev/next, etc.) call this in a field
 * initializer so hrefs re-evaluate when the user navigates between
 * locales.
 */
export function useLocaleSignal(): Signal<string | null> {
  const codes = nonDefaultLocaleCodes();
  const router = inject(Router);
  const initial = extractLocale(router.url, codes);
  return toSignal(
    router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(() => extractLocale(router.url, codes)),
      startWith(initial),
    ),
    { initialValue: initial },
  );
}

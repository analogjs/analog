import { isPlatformBrowser } from '@angular/common';
import { AfterViewInit, Component, inject, PLATFORM_ID } from '@angular/core';
import { injectDocsConfig } from '../config';

declare const docsearch: ((opts: Record<string, unknown>) => void) | undefined;

const DOCSEARCH_SCRIPT = 'https://cdn.jsdelivr.net/npm/@docsearch/js@3';

@Component({
  selector: 'docs-search',
  template: ` @if (config.search) {
    <div class="docsearch-trigger min-h-9 min-w-9 sm:min-w-[11rem]"></div>
  }`,
})
export class Search implements AfterViewInit {
  private readonly platformId = inject(PLATFORM_ID);
  protected readonly config = injectDocsConfig();

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (!this.config.search) return;
    this.loadAndInit();
  }

  private loadAndInit(): void {
    const search = this.config.search;
    if (!search) return;
    const defaultLocale = this.config.locales?.default ?? 'en';
    const indexedSet = new Set<string>(
      this.config.locales?.indexed ??
        this.config.locales?.list?.map((l) => l.code) ??
        [],
    );
    indexedSet.delete(defaultLocale);

    const init = () => {
      if (typeof docsearch === 'undefined') return;
      docsearch({
        container: '.docsearch-trigger',
        appId: search.appId,
        apiKey: search.apiKey,
        indexName: search.indexName,
        transformItems: (items: { url: string }[]) => {
          const current = currentLocaleFromPath(
            window.location.pathname,
            indexedSet,
            defaultLocale,
          );
          return items.map((item) => ({
            ...item,
            url: localizeHitUrl(item.url, current, indexedSet, defaultLocale),
          }));
        },
      });
    };

    if (typeof docsearch !== 'undefined') {
      init();
      return;
    }
    const script = document.createElement('script');
    script.src = DOCSEARCH_SCRIPT;
    script.async = true;
    script.onload = init;
    document.head.appendChild(script);
  }
}

export function currentLocaleFromPath(
  pathname: string,
  indexedLocales: ReadonlySet<string>,
  defaultLocale: string,
): string {
  const first = pathname.split('?')[0].split('/').filter(Boolean)[0];
  return first && indexedLocales.has(first) ? first : defaultLocale;
}

/**
 * Algolia indexes the production URLs with per-locale prefixes. Strip
 * any origin so clicks stay on this host, then swap the indexed locale
 * prefix for the reader's current one.
 */
export function localizeHitUrl(
  url: string,
  currentLocale: string,
  indexedLocales: ReadonlySet<string>,
  defaultLocale: string,
): string {
  let path: string;
  let suffix = '';
  try {
    const parsed = new URL(url);
    path = parsed.pathname;
    suffix = parsed.search + parsed.hash;
  } catch {
    path = url;
  }
  const re = new RegExp(`^/(${[...indexedLocales].join('|')})(/|$)`);
  const stripped = path.replace(re, '/');
  const prefixed =
    currentLocale === defaultLocale ? stripped : `/${currentLocale}${stripped}`;
  return prefixed + suffix;
}

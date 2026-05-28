import { isPlatformBrowser } from '@angular/common';
import { AfterViewInit, Component, inject, PLATFORM_ID } from '@angular/core';

declare const docsearch: ((opts: Record<string, unknown>) => void) | undefined;

const DOCSEARCH_SCRIPT = 'https://cdn.jsdelivr.net/npm/@docsearch/js@3';

@Component({
  selector: 'docs-search',
  template: ` <div
    class="docsearch-trigger min-h-9 min-w-9 sm:min-w-[11rem]"
  ></div>`,
})
export class Search implements AfterViewInit {
  private readonly platformId = inject(PLATFORM_ID);

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.loadAndInit();
  }

  private loadAndInit(): void {
    const init = () => {
      if (typeof docsearch === 'undefined') return;
      docsearch({
        container: '.docsearch-trigger',
        appId: '8W3CAMYOQF',
        apiKey: '650d723674c8cd38658add35fb9433e3',
        indexName: 'analogjs',
        transformItems: (items: { url: string }[]) => {
          const current = currentLocaleFromPath(window.location.pathname);
          return items.map((item) => ({
            ...item,
            url: localizeHitUrl(item.url, current),
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

// Strip any indexed locale prefix and re-prepend the active one so a
// hit indexed for /tr/docs/... doesn't bounce a Spanish reader to
// Turkish. Includes legacy locale codes (fr/ko/tr) that the index still
// holds even though we no longer ship those translations.
const INDEXED_LOCALES = /^\/(de|es|fr|ko|pt-br|tr|zh-hans)(\/|$)/;
const ACTIVE_LOCALES = new Set(['de', 'es', 'pt-br', 'zh-hans']);

export function currentLocaleFromPath(pathname: string): string {
  const first = pathname.split('?')[0].split('/').filter(Boolean)[0];
  return first && ACTIVE_LOCALES.has(first) ? first : 'en';
}

/**
 * Algolia indexes the production https://analogjs.org/... URLs with
 * per-locale prefixes. Strip the origin so clicks stay on this host,
 * then swap the indexed locale prefix for the reader's current one.
 */
export function localizeHitUrl(url: string, currentLocale: string): string {
  let path: string;
  let suffix = '';
  try {
    const parsed = new URL(url);
    path = parsed.pathname;
    suffix = parsed.search + parsed.hash;
  } catch {
    path = url;
  }
  const stripped = path.replace(INDEXED_LOCALES, '/');
  const prefixed =
    currentLocale === 'en' ? stripped : `/${currentLocale}${stripped}`;
  return prefixed + suffix;
}

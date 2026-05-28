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
        transformItems: (items: { url: string }[]) =>
          items.map((item) => ({ ...item, url: localizeHitUrl(item.url) })),
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

/**
 * Algolia indexes the production https://analogjs.org/... URLs, so the
 * raw hit.url would yank a local-dev visitor over to production. Strip
 * the origin so clicks stay on whatever host the page is served from.
 */
function localizeHitUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    return url;
  }
}

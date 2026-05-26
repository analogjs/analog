import { isPlatformBrowser } from '@angular/common';
import { AfterViewInit, Component, inject, PLATFORM_ID } from '@angular/core';

declare const docsearch: ((opts: Record<string, unknown>) => void) | undefined;

const DOCSEARCH_SCRIPT = 'https://cdn.jsdelivr.net/npm/@docsearch/js@3';

@Component({
  selector: 'docs-search',
  template: `
    <button
      type="button"
      class="docsearch-trigger flex items-center gap-2 rounded border px-3 py-1 text-sm text-gray-500 hover:bg-gray-50"
      aria-label="Search docs"
    >
      <span>Search…</span>
      <kbd
        class="hidden rounded border bg-gray-50 px-1.5 py-0.5 text-xs sm:inline"
        >⌘K</kbd
      >
    </button>
  `,
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

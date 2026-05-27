import { isPlatformBrowser } from '@angular/common';
import { AfterViewInit, Component, inject, PLATFORM_ID } from '@angular/core';

declare const docsearch: ((opts: Record<string, unknown>) => void) | undefined;

const DOCSEARCH_SCRIPT = 'https://cdn.jsdelivr.net/npm/@docsearch/js@3';

@Component({
  selector: 'docs-search',
  template: ` <div class="docsearch-trigger min-h-9 min-w-[11rem]"></div> `,
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

import { inject, Injectable, PLATFORM_ID, Provider } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { marked } from 'marked';

import 'prismjs';
import 'prismjs/plugins/toolbar/prism-toolbar';
import 'prismjs/plugins/copy-to-clipboard/prism-copy-to-clipboard';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-typescript';

import { ContentRenderer } from './content-renderer';

declare var Prism: typeof import('prismjs');

@Injectable()
export class MarkdownContentRendererService implements ContentRenderer {
  platformId = inject(PLATFORM_ID);

  async render(content: string) {
    const rendered = marked.parse(content);

    return rendered;
  }

  enhance() {
    if (isPlatformBrowser(this.platformId)) {
      Prism.highlightAll();
    }
  }
}

export function withMarkdownRenderer(): Provider {
  return { provide: ContentRenderer, useClass: MarkdownContentRendererService };
}

export function provideContent(...features: typeof withMarkdownRenderer[]) {
  return [...features];
}

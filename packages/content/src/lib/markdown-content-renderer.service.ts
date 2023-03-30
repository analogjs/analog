/**
 * Credit goes to Scully for original implementation
 * https://github.com/scullyio/scully/blob/main/libs/scully/src/lib/fileHanderPlugins/markdown.ts
 */
import { inject, Injectable, PLATFORM_ID, Provider } from '@angular/core';
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

declare const Prism: typeof import('prismjs');

const renderer = new marked.Renderer();
// wrap code block the way Prism.js expects it
renderer.code = function (this: any, code, lang) {
  // eslint-disable-next-line
  code = this.options.highlight(code, lang);
  if (!lang) {
    return '<pre><code>' + code + '</code></pre>';
  }
  // e.g. "language-js"
  const langClass = 'language-' + lang;
  return (
    '<pre class="' +
    langClass +
    '"><code class="' +
    langClass +
    '">' +
    code +
    '</code></pre>'
  );
};
// ------------------------------

@Injectable()
export class MarkdownContentRendererService implements ContentRenderer {
  platformId = inject(PLATFORM_ID);

  async render(content: string) {
    marked.setOptions({
      renderer,
      highlight: (code, lang) => {
        lang = lang || 'typescript';
        if (!Prism.languages[lang]) {
          console.warn(`Notice:
    ---------------------------------------------------------------------------------------
      The requested language '${lang}' is not available with the provided setup.
      To enable, import your main.ts as:
        import  'prismjs/components/prism-${lang}';
    ---------------------------------------------------------------------------------------
          `);
          return code;
        }
        return Prism.highlight(code, Prism.languages[lang], lang);
      },
      pedantic: false,
      gfm: true,
      breaks: false,
      sanitize: false,
      smartLists: true,
      smartypants: false,
      xhtml: false,
    });

    return marked(content);
  }

  // eslint-disable-next-line
  enhance() {}
}

export function withMarkdownRenderer(): Provider {
  return { provide: ContentRenderer, useClass: MarkdownContentRendererService };
}

export function provideContent(...features: Provider[]) {
  return [...features];
}

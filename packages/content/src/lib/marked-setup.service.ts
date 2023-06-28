import { Injectable } from '@angular/core';
import { marked } from 'marked';
import { gfmHeadingId } from 'marked-gfm-heading-id';
import { markedHighlight } from 'marked-highlight';

import 'prismjs';
import 'prismjs/plugins/toolbar/prism-toolbar';
import 'prismjs/plugins/copy-to-clipboard/prism-copy-to-clipboard';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-typescript';

declare const Prism: typeof import('prismjs');

@Injectable({ providedIn: 'root' })
export class MarkedSetupService {
  private readonly marked: typeof marked;

  constructor() {
    const renderer = new marked.Renderer();
    renderer.code = (code, lang) => {
      if (!lang) {
        return '<pre><code>' + code + '</code></pre>';
      }
      const langClass = 'language-' + lang;
      const html =
        '<pre class="' +
        langClass +
        '"><code class="' +
        langClass +
        '">' +
        code +
        '</code></pre>';
      return html;
    };

    marked.use(
      gfmHeadingId(),
      markedHighlight({
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
      }),
      {
        renderer,
        pedantic: false,
        gfm: true,
        breaks: false,
        sanitize: false,
        smartypants: false,
        xhtml: false,
        mangle: false,
      }
    );

    this.marked = marked;
  }

  getMarkedInstance(): typeof marked {
    return this.marked;
  }
}

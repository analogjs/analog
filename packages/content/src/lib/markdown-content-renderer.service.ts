/**
 * Credit goes to Scully for original implementation
 * https://github.com/scullyio/scully/blob/main/libs/scully/src/lib/fileHanderPlugins/markdown.ts
 */
import { inject, Injectable, PLATFORM_ID, Provider } from '@angular/core';
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

import { ContentRenderer } from './content-renderer';

declare const Prism: typeof import('prismjs');

/**
 * Generating a unique instance of Marked to avoid re-generation after each "use"
 * Until the new marked types are released this was the best solution to avoid regenerating marked
 * */
const Marked = {
  instantiated: false,

  setup: () => {
    const renderer = new marked.Renderer();
    // wrap code block the way Prism.js expects it
    renderer.code = (code, lang) => {
      if (!lang) {
        return '<pre><code>' + code + '</code></pre>';
      }
      // e.g. "language-js"
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
    // ------------------------------

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

    Marked.instantiated = true;
  },

  instance: () => {
    if (!Marked.instantiated) Marked.setup();

    return marked;
  },
};

@Injectable()
export class MarkdownContentRendererService implements ContentRenderer {
  platformId = inject(PLATFORM_ID);

  async render(content: string) {
    return Marked.instance().parse(content);
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

/**
 * Credit goes to Scully for original implementation
 * https://github.com/scullyio/scully/blob/main/libs/scully/src/lib/fileHanderPlugins/markdown.ts
 */
import { marked } from 'marked';
import { gfmHeadingId } from 'marked-gfm-heading-id';
import { markedHighlight } from 'marked-highlight';

import 'prismjs';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-typescript';
import 'prismjs/plugins/copy-to-clipboard/prism-copy-to-clipboard';
import 'prismjs/plugins/toolbar/prism-toolbar';
// import './prism/angular';

declare const Prism: typeof import('prismjs');

export class MarkedSetupService {
  private readonly marked: typeof marked;

  constructor() {
    const renderer = new marked.Renderer();
    renderer.code = (code: string, lang: string) => {
      // Escape commonly used HTML characters
      // in Angular templates that cause template parse errors
      // such as @, {, and ,}.
      code = code.replace(/@/g, '&#64;');

      if (code.includes('>{<') || code.includes('>}<')) {
        code = code
          .replace(/>\{</g, '>&#x2774;<')
          .replace(/>\}</g, '>&#x2775;<');
      }

      // Let's do a language based detection like on GitHub
      // So we can still have non-interpreted mermaid code
      if (lang === 'mermaid') {
        return '<pre class="mermaid">' + code + '</pre>';
      }

      if (!lang) {
        return '<pre><code>' + code + '</code></pre>';
      }

      const classes =
        lang.startsWith('diff') && Prism.languages['diff']
          ? `language-${lang} diff-highlight`
          : `language-${lang.replace('diff-', '')}`;
      return `<pre class="${classes}"><code class="${classes}">${code}</code></pre>`;
    };

    marked.use(
      gfmHeadingId(),
      markedHighlight({
        async: true,
        highlight: (code: string, lang: string) => {
          let diff = lang?.startsWith('diff-');
          lang = diff ? lang.replace('diff-', '') : lang || 'typescript';

          if (diff && !Prism.languages['diff']) {
            diff = false;
            console.warn(`Notice:
    ---------------------------------------------------------------------------------------
    The \`diff\` language and plugin are not available in the provided setup.
    To enable it, add the following imports your \`main.ts\`:
      import 'prismjs/components/prism-diff';
      import 'prismjs/plugins/diff-highlight/prism-diff-highlight';
    ---------------------------------------------------------------------------------------
            `);
          }

          if (!Prism.languages[lang]) {
            if (lang !== 'mermaid') {
              console.warn(`Notice:
    ---------------------------------------------------------------------------------------
    The requested language '${lang}' is not available in the provided setup.
    To enable it, add the following import your \`main.ts\`:
      import 'prismjs/components/prism-${lang}';
    ---------------------------------------------------------------------------------------
              `);
            }
            return code;
          }
          return Prism.highlight(
            code,
            diff ? Prism.languages['diff'] : Prism.languages[lang],
            lang
          );
        },
      }),
      {
        async: false,
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

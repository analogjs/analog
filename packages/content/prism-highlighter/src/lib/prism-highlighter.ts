import { MarkedContentHighlighter } from '@analogjs/content';
import { Injectable } from '@angular/core';
import { markedHighlight } from 'marked-highlight';

declare const Prism: typeof import('prismjs');

@Injectable()
export class PrismHighlighter extends MarkedContentHighlighter {
  override augmentCodeBlock(code: string, lang: string): string {
    const classes =
      lang.startsWith('diff') && Prism.languages['diff']
        ? `language-${lang} diff-highlight`
        : `language-${lang.replace('diff-', '')}`;
    return `<pre class="${classes}"><code class="${classes}">${code}</code></pre>`;
  }

  override getHighlightExtension() {
    return markedHighlight({
      async: true,
      highlight: (code: string, lang: string) => {
        let diff = lang?.startsWith('diff-');
        lang = diff ? lang.replace('diff-', '') : lang || 'typescript';

        if (diff && !Prism.languages['diff']) {
          diff = false;
          console.warn(`Notice:
    ---------------------------------------------------------------------------------------
    The \`diff\` language and plugin are not available in the provided setup.
    To enable it, add the following imports your \`app.config.ts\`:
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
    To enable it, add the following import your \`app.config.ts\`:
      import 'prismjs/components/prism-${lang}';
    ---------------------------------------------------------------------------------------
              `);
          }
          return code;
        }
        return Prism.highlight(
          code,
          diff ? Prism.languages['diff'] : Prism.languages[lang],
          lang,
        );
      },
    });
  }
}

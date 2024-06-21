import { markedHighlight } from 'marked-highlight';

import 'prismjs';
import 'prismjs/components/prism-bash.js';
import 'prismjs/components/prism-css.js';
import 'prismjs/components/prism-javascript.js';
import 'prismjs/components/prism-json.js';
import 'prismjs/components/prism-markup.js';
import 'prismjs/components/prism-typescript.js';
import 'prismjs/plugins/toolbar/prism-toolbar.js';
import 'prismjs/plugins/copy-to-clipboard/prism-copy-to-clipboard.js';
import './angular.js';

import { MarkedContentHighlighter } from '../marked-content-highlighter.js';

declare const Prism: typeof import('prismjs');

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
    To enable it, add the following imports your \`main.ts\`:
      import 'prismjs/components/prism-diff.js';
      import 'prismjs/plugins/diff-highlight/prism-diff-highlight.js';
    ---------------------------------------------------------------------------------------
            `);
        }

        if (!Prism.languages[lang]) {
          if (lang !== 'mermaid') {
            console.warn(`Notice:
    ---------------------------------------------------------------------------------------
    The requested language '${lang}' is not available in the provided setup.
    To enable it, add the following import your \`main.ts\`:
      import 'prismjs/components/prism-${lang}.js';
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
    });
  }
}

import { marked } from 'marked';
import { gfmHeadingId } from 'marked-gfm-heading-id';
import { mangle } from 'marked-mangle';

import { MarkedContentHighlighter } from './marked-content-highlighter.js';

export class MarkedSetupService {
  private readonly marked: typeof marked;

  constructor(private readonly highlighter?: MarkedContentHighlighter) {
    const renderer = new marked.Renderer();
    renderer.code = (code: string, lang: string) => {
      // Let's do a language based detection like on GitHub
      // So we can still have non-interpreted mermaid code
      if (lang === 'mermaid') {
        return '<pre class="mermaid">' + code + '</pre>';
      }

      if (!lang) {
        return '<pre><code>' + code + '</code></pre>';
      }

      if (this.highlighter?.augmentCodeBlock) {
        return this.highlighter?.augmentCodeBlock(code, lang);
      }

      return `<pre class="language-${lang}"><code class="language-${lang}">${code}</code></pre>`;
    };

    const extensions = [gfmHeadingId(), mangle()];

    if (this.highlighter) {
      extensions.push(this.highlighter.getHighlightExtension());
    }

    marked.use(...extensions, {
      renderer,
      pedantic: false,
      gfm: true,
      breaks: false,
    });

    this.marked = marked;
  }

  getMarkedInstance(): typeof marked {
    return this.marked;
  }
}

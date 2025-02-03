import { marked } from 'marked';
import { gfmHeadingId } from 'marked-gfm-heading-id';
import { mangle } from 'marked-mangle';

import { MarkedContentHighlighter } from './marked-content-highlighter.js';
import { WithMarkedOptions } from './index.js';

export class MarkedSetupService {
  private readonly marked: typeof marked;

  constructor(
    private readonly options?: WithMarkedOptions,
    private readonly highlighter?: MarkedContentHighlighter
  ) {
    const renderer = new marked.Renderer();
    renderer.code = ({ text, lang }) => {
      // Let's do a language based detection like on GitHub
      // So we can still have non-interpreted mermaid code
      if (lang === 'mermaid') {
        return '<pre class="mermaid">' + text + '</pre>';
      }

      if (!lang) {
        return '<pre><code>' + text + '</code></pre>';
      }

      if (this.highlighter?.augmentCodeBlock) {
        return this.highlighter?.augmentCodeBlock(text, lang);
      }

      return `<pre class="language-${lang}"><code class="language-${lang}">${text}</code></pre>`;
    };

    const extensions = [gfmHeadingId()];

    if (this.options?.mangle) {
      extensions.push(mangle());
    }

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

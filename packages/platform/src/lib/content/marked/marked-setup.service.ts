import { marked, Parser, MarkedExtension } from 'marked';
import { gfmHeadingId } from 'marked-gfm-heading-id';
import { mangle } from 'marked-mangle';

import { MarkedContentHighlighter } from './marked-content-highlighter.js';
import { WithMarkedOptions } from './index.js';
import { escapeHtml, sanitizeLanguage } from '../utils/escape-html.js';

export class MarkedSetupService {
  private readonly marked: typeof marked;

  constructor(
    private readonly options?: WithMarkedOptions,
    private readonly highlighter?: MarkedContentHighlighter,
  ) {
    const analogMarkedExtension: MarkedExtension = {
      pedantic: false,
      gfm: true,
      breaks: false,
      renderer: {
        code({ text, lang }) {
          // Let's do a language based detection like on GitHub
          // So we can still have non-interpreted mermaid code
          const language = sanitizeLanguage(lang);
          if (language === 'mermaid') {
            return '<pre class="mermaid">' + escapeHtml(text) + '</pre>';
          }

          if (!language) {
            return '<pre><code>' + escapeHtml(text) + '</code></pre>';
          }

          if (highlighter?.augmentCodeBlock) {
            return highlighter?.augmentCodeBlock(text, language);
          }

          return `<pre class="language-${language}"><code class="language-${language}">${escapeHtml(text)}</code></pre>`;
        },
        codespan({ text }) {
          return `<code>${escapeHtml(text)}</code>`;
        },
        paragraph({ tokens }) {
          const text = this.parser.parseInline(tokens);
          return `<p>${text}</p>`;
        },
      },
    };

    const extensions = [
      analogMarkedExtension,
      gfmHeadingId(),
      ...(options?.extensions || []),
    ];

    if (this.options?.mangle) {
      extensions.push(mangle());
    }

    if (this.highlighter) {
      extensions.push(this.highlighter.getHighlightExtension());
    }

    marked.use(...extensions);

    this.marked = marked;
  }

  getMarkedInstance(): typeof marked {
    return this.marked;
  }
}

/**
 * Credit goes to Scully for original implementation
 * https://github.com/scullyio/scully/blob/main/libs/scully/src/lib/fileHanderPlugins/markdown.ts
 */
import { inject, Injectable } from '@angular/core';
import { marked } from 'marked';
import { gfmHeadingId } from 'marked-gfm-heading-id';
import { mangle } from 'marked-mangle';
import { MarkedContentHighlighter } from './marked-content-highlighter';
import { escapeHtml, sanitizeLanguage } from './utils/escape-html';

@Injectable()
export class MarkedSetupService {
  private readonly marked: typeof marked;
  private readonly highlighter = inject(MarkedContentHighlighter, {
    optional: true,
  });

  constructor() {
    const renderer = new marked.Renderer();
    renderer.code = ({ text, lang }) => {
      // Let's do a language based detection like on GitHub
      // So we can still have non-interpreted mermaid code
      const language = sanitizeLanguage(lang);
      if (language === 'mermaid') {
        return '<pre class="mermaid">' + escapeHtml(text) + '</pre>';
      }

      if (!language) {
        return '<pre><code>' + escapeHtml(text) + '</code></pre>';
      }

      if (this.highlighter?.augmentCodeBlock) {
        return this.highlighter?.augmentCodeBlock(text, language);
      }

      return `<pre class="language-${language}"><code class="language-${language}">${escapeHtml(text)}</code></pre>`;
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

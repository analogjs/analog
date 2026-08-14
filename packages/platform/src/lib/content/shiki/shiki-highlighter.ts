import markedShiki from 'marked-shiki';
import {
  type BundledLanguage,
  type BundledTheme,
  type CodeOptionsMeta,
  type CodeOptionsMultipleThemes,
  type CodeOptionsSingleTheme,
  type CodeToHastOptionsCommon,
  createHighlighter,
} from 'shiki';

import { MarkedContentHighlighter } from '../marked/marked-content-highlighter.js';

export type ShikiHighlighterOptions = Parameters<typeof createHighlighter>[0];
export type ShikiHighlightOptions = Partial<
  Omit<CodeToHastOptionsCommon<BundledLanguage>, 'lang'>
> &
  CodeOptionsMeta &
  Partial<CodeOptionsSingleTheme<BundledTheme>> &
  Partial<CodeOptionsMultipleThemes<BundledTheme>>;

export const defaultHighlighterOptions: {
  langs: string[];
  themes: string[];
} = {
  langs: [
    'json',
    'ts',
    'tsx',
    'js',
    'jsx',
    'html',
    'css',
    'angular-html',
    'angular-ts',
  ],
  themes: ['github-dark', 'github-light'],
};

function escapeHtml(code: string): string {
  return code
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export class ShikiHighlighter extends MarkedContentHighlighter {
  private readonly highlighter: ReturnType<typeof createHighlighter>;

  constructor(
    private highlighterOptions: ShikiHighlighterOptions,
    private highlightOptions: ShikiHighlightOptions,
    private container: string,
    private hasLoadMermaid = false,
    private skipLangs: string[] = [],
  ) {
    super();
    this.highlighter = createHighlighter(this.highlighterOptions);
  }
  getHighlightExtension(): import('marked').MarkedExtension {
    return markedShiki({
      container: this.container,
      highlight: async (code, lang, props) => {
        if (this.hasLoadMermaid && lang === 'mermaid') {
          return `<pre class="mermaid">${code}</pre>`;
        }

        if (this.skipLangs.includes(lang as string)) {
          const escapedCode = escapeHtml(code);

          return `<pre class="language-${lang}"><code class="language-${lang}">${escapedCode}</code></pre>`;
        }

        const { codeToHtml } = await this.highlighter;
        return codeToHtml(
          code,
          Object.assign(
            {
              lang,
              // required by `transformerMeta*`
              meta: { __raw: props.join(' ') },
              theme: 'github-dark',
            },
            this.highlightOptions,
          ),
        );
      },
    });
  }
}

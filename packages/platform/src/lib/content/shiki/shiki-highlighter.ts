import markedShiki from 'marked-shiki';
import {
  type BundledLanguage,
  type BundledTheme,
  type CodeOptionsMeta,
  type CodeOptionsMultipleThemes,
  type CodeOptionsSingleTheme,
  type CodeToHastOptionsCommon,
  getHighlighter,
} from 'shiki';

import { MarkedContentHighlighter } from '../marked-content-highlighter.js';

export type ShikiHighlighterOptions = Parameters<typeof getHighlighter>[0];
export type ShikiHighlightOptions = Partial<
  Omit<CodeToHastOptionsCommon<BundledLanguage>, 'lang'>
> &
  CodeOptionsMeta &
  Partial<CodeOptionsSingleTheme<BundledTheme>> &
  Partial<CodeOptionsMultipleThemes<BundledTheme>>;

export const defaultHighlighterOptions = {
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

export class ShikiHighlighter extends MarkedContentHighlighter {
  private readonly highlighter = getHighlighter(this.highlighterOptions);

  constructor(
    private highlighterOptions: ShikiHighlighterOptions,
    private highlightOptions: ShikiHighlightOptions,
    private container: string,
    private hasLoadMermaid = false
  ) {
    super();
  }
  getHighlightExtension() {
    return markedShiki({
      container: this.container,
      highlight: async (code, lang, props) => {
        if (this.hasLoadMermaid && lang === 'mermaid') {
          return `<pre class="mermaid">${code}</pre>`;
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
            this.highlightOptions
          )
        );
      },
    });
  }
}

import { MarkedContentHighlighter } from '@analogjs/content';
import { inject, Injectable, InjectionToken } from '@angular/core';
import { Param } from '@swc/core';
import markedShiki from 'marked-shiki';
import {
  type BundledLanguage,
  type BundledTheme,
  type CodeOptionsMeta,
  type CodeOptionsMultipleThemes,
  type CodeOptionsSingleTheme,
  type CodeToHastOptions,
  CodeToHastOptionsCommon,
  codeToHtml,
  getHighlighter,
} from 'shiki';

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

export const [
  SHIKI_HIGHLIGHTER_OPTIONS,
  SHIKI_HIGHLIGHT_OPTIONS,
  SHIKI_CONTAINER_OPTION,
] = [
  new InjectionToken<ShikiHighlighterOptions>('SHIKI_HIGHLIGHTER_OPTIONS'),
  new InjectionToken<ShikiHighlightOptions>('SHIKI_HIGHLIGHT_OPTIONS'),
  new InjectionToken<string>('SHIKI_CONTAINER_OPTION'),
];

@Injectable()
export class ShikiHighlighter extends MarkedContentHighlighter {
  private readonly highlighterOptions = inject(SHIKI_HIGHLIGHTER_OPTIONS);
  private readonly highlightOptions = inject(SHIKI_HIGHLIGHT_OPTIONS);
  private readonly highlighterContainer = inject(SHIKI_CONTAINER_OPTION);
  private readonly highlighter = getHighlighter(this.highlighterOptions);

  override getHighlightExtension() {
    return markedShiki({
      container: this.highlighterContainer,
      highlight: async (code, lang, props) => {
        const { codeToHtml } = await this.highlighter;
        return codeToHtml(
          code,
          Object.assign(
            {
              lang,
              // required by `transformerMeta*`
              meta: { __raw: props.join(' ') },
              themes: { dark: 'github-dark', light: 'github-light' },
            },
            this.highlightOptions
          )
        );
      },
    });
  }
}

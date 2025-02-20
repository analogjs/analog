import { ContentRenderer, NoopContentRenderer } from '@analogjs/content';
import { Provider } from '@angular/core';
import type {
  BundledLanguage,
  BundledTheme,
  CodeOptionsMeta,
  CodeOptionsMultipleThemes,
  CodeOptionsSingleTheme,
  CodeToHastOptionsCommon,
} from 'shiki';

export type ShikiHighlightOptions = Partial<
  Omit<CodeToHastOptionsCommon<BundledLanguage>, 'lang'>
> &
  CodeOptionsMeta &
  Partial<CodeOptionsSingleTheme<BundledTheme>> &
  Partial<CodeOptionsMultipleThemes<BundledTheme>>;

export type WithShikiHighlighterOptions = ShikiHighlightOptions & {
  container?: string;
};

export function withShikiHighlighter(
  _opts: WithShikiHighlighterOptions = {},
): Provider[] {
  return [
    {
      provide: ContentRenderer,
      useClass: NoopContentRenderer,
    },
  ];
}

import { withHighlighter } from '@analogjs/content';
import { Provider } from '@angular/core';
import type { BundledLanguage } from 'shiki';
import {
  defaultHighlighterOptions,
  SHIKI_CONTAINER_OPTION,
  SHIKI_HIGHLIGHT_OPTIONS,
  SHIKI_HIGHLIGHTER_OPTIONS,
  ShikiHighlighter,
  type ShikiHighlighterOptions,
  type ShikiHighlightOptions,
} from './lib/shiki-highlighter';

export { ShikiHighlighter };

export interface WithShikiHighlighterOptions {
  highlighter?: Partial<ShikiHighlighterOptions> & {
    additionalLangs?: BundledLanguage[];
  };
  highlight?: ShikiHighlightOptions;
  container?: string;
}

export function withShikiHighlighter({
  highlighter = {},
  highlight = {},
  container = '%s',
}: WithShikiHighlighterOptions = {}): Provider {
  if (!highlighter.themes) {
    if (highlight.theme) {
      highlighter.themes = [highlight.theme];
    } else if (highlight.themes && typeof highlight.themes === 'object') {
      highlighter.themes = Object.values(highlight.themes) as string[];
    } else {
      highlighter.themes = defaultHighlighterOptions.themes;
    }
  }

  if (!highlighter.langs) {
    highlighter.langs = defaultHighlighterOptions.langs;
  }

  if (highlighter.additionalLangs) {
    highlighter.langs.push(...highlighter.additionalLangs);
    delete highlighter.additionalLangs;
  }

  return [
    { provide: SHIKI_HIGHLIGHTER_OPTIONS, useValue: highlighter },
    { provide: SHIKI_HIGHLIGHT_OPTIONS, useValue: highlight },
    { provide: SHIKI_CONTAINER_OPTION, useValue: container },
    withHighlighter({ useClass: ShikiHighlighter }),
  ];
}

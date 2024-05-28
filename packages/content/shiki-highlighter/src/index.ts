import { MarkedContentHighlighter } from '@analogjs/content';
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
  highlighter?: Partial<ShikiHighlighterOptions>;
  highlight?: ShikiHighlightOptions;
  container?: string;
}

export function withShikiHighlighter({
  highlighter = {},
  highlight = {},
  container = '%s',
}: WithShikiHighlighterOptions = {}) {
  return [
    {
      provide: SHIKI_HIGHLIGHTER_OPTIONS,
      useValue: Object.assign(defaultHighlighterOptions, highlighter),
    },
    { provide: SHIKI_HIGHLIGHT_OPTIONS, useValue: highlight },
    { provide: SHIKI_CONTAINER_OPTION, useValue: container },
    { provide: MarkedContentHighlighter, useClass: ShikiHighlighter },
  ];
}

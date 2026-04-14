import {
  ShikiHighlighterOptions,
  ShikiHighlightOptions,
} from './shiki-highlighter.js';

import { BundledLanguage } from 'shiki/langs';

export interface WithShikiHighlighterOptions {
  highlighter?: Partial<ShikiHighlighterOptions> & {
    additionalLangs?: BundledLanguage[];
    skipLangs?: BundledLanguage[];
  };
  highlight?: ShikiHighlightOptions;
  container?: string;
}

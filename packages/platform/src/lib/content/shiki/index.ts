import { WithShikiHighlighterOptions } from './options.js';
import {
  defaultHighlighterOptions,
  ShikiHighlighter,
  ShikiHighlighterOptions,
} from './shiki-highlighter.js';

export { ShikiHighlighter };

export function getShikiHighlighter({
  highlighter = {},
  highlight = {},
  container = '%s',
}: WithShikiHighlighterOptions = {}): ShikiHighlighter {
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

  return new ShikiHighlighter(
    highlighter as ShikiHighlighterOptions,
    highlight,
    container,
    !!highlighter.langs.includes('mermaid')
  );
}

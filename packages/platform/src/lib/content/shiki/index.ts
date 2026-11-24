import { WithShikiHighlighterOptions } from './options.js';
import {
  defaultHighlighterOptions,
  ShikiHighlighter,
  ShikiHighlighterOptions,
} from './shiki-highlighter.js';

export { ShikiHighlighter };

let highlighterInstance: ShikiHighlighter;

export function getShikiHighlighter({
  highlighter = {},
  highlight = {},
  container = '%s',
}: WithShikiHighlighterOptions = {}): ShikiHighlighter {
  if (highlighterInstance) {
    return highlighterInstance;
  }

  const additionalLangs = highlighter.additionalLangs ?? [];
  const skipLangs = highlighter.skipLangs ?? [];
  const hasMermaidSupport =
    highlighter.langs?.includes('mermaid') ||
    additionalLangs.includes('mermaid');

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
    highlighter.langs = [...defaultHighlighterOptions.langs];
  }

  if (additionalLangs.length > 0) {
    highlighter.langs.push(...additionalLangs);
  }

  if (skipLangs.length > 0) {
    highlighter.langs = highlighter.langs.filter(
      (lang) => !skipLangs.includes(lang),
    );
  }

  delete highlighter.additionalLangs;
  delete highlighter.skipLangs;

  highlighterInstance = new ShikiHighlighter(
    highlighter as ShikiHighlighterOptions,
    highlight,
    container,
    hasMermaidSupport,
    skipLangs,
  );

  return highlighterInstance;
}

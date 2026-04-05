import { PrismHighlighter } from './prism-highlighter.js';

export { PrismHighlighter };

let highlighterInstance: PrismHighlighter;

export function getPrismHighlighter(): PrismHighlighter {
  highlighterInstance ??= new PrismHighlighter();
  return highlighterInstance;
}

import { PrismHighlighter } from './prism-highlighter.js';

export { PrismHighlighter };

let highlighterInstance: PrismHighlighter;

export function getPrismHighlighter() {
  highlighterInstance ??= new PrismHighlighter();
  return highlighterInstance;
}

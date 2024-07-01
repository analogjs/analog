import { PrismHighlighter } from './prism-highlighter.js';

export { PrismHighlighter };

export type WithPrismHighlighterOptions = {
  additionalLangs?: string[];
};

export function getPrismHighlighter() {
  return new PrismHighlighter();
}

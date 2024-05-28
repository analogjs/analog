import { MarkedContentHighlighter } from '@analogjs/content';
import { PrismHighlighter } from './lib/prism-highlighter';

export { PrismHighlighter };
export function withPrismHighlighter() {
  return { provide: MarkedContentHighlighter, useClass: PrismHighlighter };
}

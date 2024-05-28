import { withHighlighter } from '@analogjs/content';
import { Provider } from '@angular/core';
import { PrismHighlighter } from './lib/prism-highlighter';

export { PrismHighlighter };

export function withPrismHighlighter(): Provider {
  return withHighlighter({ useClass: PrismHighlighter });
}

import { ContentRenderer, NoopContentRenderer } from '@analogjs/content';
import { Provider } from '@angular/core';
import { PrismHighlighter } from './lib/prism-highlighter';

import 'prismjs';
import 'prismjs/plugins/toolbar/prism-toolbar';
import 'prismjs/plugins/copy-to-clipboard/prism-copy-to-clipboard';
import './lib/prism/angular';

export { PrismHighlighter };

export function withPrismHighlighter(): Provider[] {
  return [{ provide: ContentRenderer, useClass: NoopContentRenderer }];
}

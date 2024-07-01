import { ContentRenderer, NoopContentRenderer } from '@analogjs/content';
import { Provider } from '@angular/core';
import 'prismjs';
import 'prismjs/plugins/toolbar/prism-toolbar.js';
import 'prismjs/plugins/copy-to-clipboard/prism-copy-to-clipboard.js';

export function withPrismHighlighter(): Provider[] {
  return [{ provide: ContentRenderer, useClass: NoopContentRenderer }];
}

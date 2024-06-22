import { ContentRenderer, NoopContentRenderer } from '@analogjs/content';
import { Provider } from '@angular/core';
import 'prismjs';

export function withPrismHighlighter(): Provider[] {
  return [{ provide: ContentRenderer, useClass: NoopContentRenderer }];
}

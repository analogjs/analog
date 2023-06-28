/**
 * Credit goes to Scully for original implementation
 * https://github.com/scullyio/scully/blob/main/libs/scully/src/lib/fileHanderPlugins/markdown.ts
 */
import { inject, Injectable, PLATFORM_ID, Provider } from '@angular/core';

import { ContentRenderer } from './content-renderer';
import { MarkedSetupService } from './marked-setup.service';

@Injectable()
export class MarkdownContentRendererService implements ContentRenderer {
  platformId = inject(PLATFORM_ID);
  #marked = inject(MarkedSetupService);

  async render(content: string) {
    return this.#marked.getMarkedInstance().parse(content);
  }

  // eslint-disable-next-line
  enhance() {}
}

export function withMarkdownRenderer(): Provider {
  return { provide: ContentRenderer, useClass: MarkdownContentRendererService };
}

export function provideContent(...features: Provider[]) {
  return [...features];
}

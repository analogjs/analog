import { inject, Injectable, PLATFORM_ID, Provider } from '@angular/core';

import { ContentRenderer } from './content-renderer';
import { MarkedSetupService } from './marked-setup.service';

@Injectable()
export class MarkdownContentRendererService implements ContentRenderer {
  platformId = inject(PLATFORM_ID);
  #marked = inject(MarkedSetupService, { self: true });

  async render(content: string) {
    return this.#marked.getMarkedInstance().parse(content);
  }

  // eslint-disable-next-line
  enhance() {}
}

export function withMarkdownRenderer(): Provider {
  return {
    provide: ContentRenderer,
    useClass: MarkdownContentRendererService,
    deps: [MarkedSetupService],
  };
}

export function provideContent(...features: Provider[]) {
  return [...features, MarkedSetupService];
}

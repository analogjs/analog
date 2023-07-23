import {
  inject,
  Injectable,
  InjectionToken,
  PLATFORM_ID,
  Provider,
} from '@angular/core';

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
    useFactory: () => new MarkdownContentRendererService(),
    deps: [MarkedSetupService],
  };
}

export function withMermaid(): Provider {
  return {
    provide: MERMAID_IMPORT_TOKEN,
    useValue: import('mermaid'),
  };
}

export function provideContent(...features: Provider[]) {
  return [...features, MarkedSetupService];
}

export const MERMAID_IMPORT_TOKEN = new InjectionToken<
  Promise<typeof import('mermaid')>
>('mermaid_import');

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

export interface MarkdownRendererOptions {
  enableMermaid: boolean;
}

export function withMarkdownRenderer(
  options?: MarkdownRendererOptions
): Provider[] {
  return [
    {
      provide: ContentRenderer,
      useFactory: () => new MarkdownContentRendererService(),
      deps: [MarkedSetupService],
    },
    ...(options?.enableMermaid
      ? [
          {
            provide: USE_MERMAID_TOKEN,
            useValue: true,
          },
        ]
      : []),
  ];
}

export function provideContent(...features: Provider[]) {
  return [...features, MarkedSetupService];
}

export const USE_MERMAID_TOKEN = new InjectionToken<boolean>('use_mermaid');

import {
  inject,
  Injectable,
  InjectionToken,
  PLATFORM_ID,
  Provider,
} from '@angular/core';
import { getHeadingList } from 'marked-gfm-heading-id';

import { ContentRenderer, TableOfContentItem } from './content-renderer';
import { MarkedSetupService } from './marked-setup.service';

@Injectable()
export class MarkdownContentRendererService implements ContentRenderer {
  platformId = inject(PLATFORM_ID);
  #marked = inject(MarkedSetupService, { self: true });

  async render(content: string): Promise<string> {
    return this.#marked.getMarkedInstance().parse(content);
  }

  /**
   * The method is meant to be called after `render()`
   */
  async getContentHeadings(): Promise<TableOfContentItem[]> {
    return getHeadingList();
  }

  // eslint-disable-next-line
  enhance() {}
}

export interface MarkdownRendererOptions {
  loadMermaid?: () => Promise<typeof import('mermaid')>;
}

export function withMarkdownRenderer(
  options?: MarkdownRendererOptions
): Provider {
  return [
    {
      provide: ContentRenderer,
      useFactory: () => new MarkdownContentRendererService(),
      deps: [MarkedSetupService],
    },
    options?.loadMermaid
      ? [
          {
            provide: MERMAID_IMPORT_TOKEN,
            useFactory: options.loadMermaid,
          },
        ]
      : [],
  ];
}

export function provideContent(...features: Provider[]) {
  return [...features, MarkedSetupService];
}

export const MERMAID_IMPORT_TOKEN = new InjectionToken<
  Promise<typeof import('mermaid')>
>('mermaid_import');

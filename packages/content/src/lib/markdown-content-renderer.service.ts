import { inject, Injectable, InjectionToken, Provider } from '@angular/core';
import { getHeadingList } from 'marked-gfm-heading-id';

import { ContentRenderer, TableOfContentItem } from './content-renderer';
import { MarkedSetupService } from './marked-setup.service';
import { RenderTaskService } from './render-task.service';

@Injectable()
export class MarkdownContentRendererService implements ContentRenderer {
  #marked = inject(MarkedSetupService, { self: true });

  async render(content: string): Promise<string> {
    return this.#marked.getMarkedInstance().parse(content);
  }

  /**
   * The method is meant to be called after `render()`
   */
  getContentHeadings(): TableOfContentItem[] {
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
    MarkedSetupService,
    RenderTaskService,
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
  return [...features];
}

export const MERMAID_IMPORT_TOKEN = new InjectionToken<
  Promise<typeof import('mermaid')>
>('mermaid_import');

import { inject, Injectable } from '@angular/core';
import { getHeadingList } from 'marked-gfm-heading-id';

import {
  ContentRenderer,
  RenderedContent,
  TableOfContentItem,
} from './content-renderer';
import { MarkedSetupService } from './marked-setup.service';

@Injectable()
export class MarkdownContentRendererService implements ContentRenderer {
  #marked = inject(MarkedSetupService, { self: true });

  async render(content: string): Promise<RenderedContent> {
    const renderedContent = await this.#marked
      .getMarkedInstance()
      .parse(content);
    return {
      content: renderedContent,
      toc: getHeadingList(),
    };
  }

  getContentHeadings(content: string): TableOfContentItem[] {
    return [...content.matchAll(/^(#{1,6})\s+(.+?)\s*$/gm)].map((match) => ({
      id: match[2]
        .trim()
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-'),
      level: match[1].length,
      text: match[2].trim(),
    }));
  }

  // eslint-disable-next-line
  enhance(): void {}
}

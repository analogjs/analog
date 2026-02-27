import { inject, Injectable } from '@angular/core';
import { getHeadingList } from 'marked-gfm-heading-id';

import { ContentRenderer, RenderedContent } from './content-renderer';
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

  // eslint-disable-next-line
  enhance() {}
}

import { inject, Injectable } from '@angular/core';
import { getHeadingList } from 'marked-gfm-heading-id';

import { ContentRenderer, TableOfContentItem } from './content-renderer';
import { MarkedSetupService } from './marked-setup.service';

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

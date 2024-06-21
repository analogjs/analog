/// <reference types="vite/client" />

import { Injectable, TransferState, inject, makeStateKey } from '@angular/core';
import { getHeadingList } from 'marked-gfm-heading-id';

export type TableOfContentItem = {
  id: string;
  level: number; // starts at 1
  text: string;
};

@Injectable()
export abstract class ContentRenderer {
  async render(content: string): Promise<string> {
    return content;
  }

  getContentHeadings(): Array<TableOfContentItem> {
    return [];
  }

  // eslint-disable-next-line
  enhance() {}
}

export class NoopContentRenderer implements ContentRenderer {
  private readonly transferState = inject(TransferState);
  private contentId = 0;

  /**
   * Generates a hash from the content string
   * to be used with the transfer state
   */
  private generateHash(str: string) {
    let hash = 0;
    for (let i = 0, len = str.length; i < len; i++) {
      let chr = str.charCodeAt(i);
      hash = (hash << 5) - hash + chr;
      hash |= 0; // Convert to 32bit integer
    }
    return hash;
  }

  async render(content: string) {
    this.contentId = this.generateHash(content);
    return content;
  }
  enhance() {}

  getContentHeadings(): Array<TableOfContentItem> {
    const key = makeStateKey<TableOfContentItem[]>(
      `content-headings-${this.contentId}`
    );

    if (import.meta.env.SSR === true) {
      const headings = getHeadingList();
      this.transferState.set(key, headings);
      return headings;
    }

    return this.transferState.get(key, []);
  }
}

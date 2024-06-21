import { Injectable } from '@angular/core';

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
  async render(val: string) {
    return val;
  }
  enhance() {}
  getContentHeadings() {
    return [];
  }
}

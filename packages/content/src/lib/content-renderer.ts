/// <reference types="vite/client" />

import { Injectable, TransferState, inject, makeStateKey } from '@angular/core';

export type TableOfContentItem = {
  id: string;
  level: number; // starts at 1
  text: string;
};

export type RenderedContent = {
  content: string;
  toc: TableOfContentItem[];
};

@Injectable()
export abstract class ContentRenderer {
  async render(content: string): Promise<RenderedContent> {
    return { content, toc: [] };
  }

  // Backward-compatible API for consumers that read headings directly.
  getContentHeadings(_content: string): TableOfContentItem[] {
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
      const chr = str.charCodeAt(i);
      hash = (hash << 5) - hash + chr;
      hash |= 0; // Convert to 32bit integer
    }
    return hash;
  }

  async render(content: string): Promise<RenderedContent> {
    this.contentId = this.generateHash(content);
    const toc = this.getContentHeadings(content);
    const key = makeStateKey<TableOfContentItem[]>(
      `content-headings-${this.contentId}`,
    );

    if (import.meta.env.SSR === true) {
      this.transferState.set(key, toc);
      return { content, toc };
    }

    return {
      content,
      toc: this.transferState.get(key, toc),
    };
  }
  enhance() {
    /* noop */
  }

  getContentHeadings(content: string): TableOfContentItem[] {
    return this.extractHeadings(content);
  }

  private extractHeadings(content: string): TableOfContentItem[] {
    const markdownHeadings = this.extractHeadingsFromMarkdown(content);
    if (markdownHeadings.length > 0) {
      return markdownHeadings;
    }

    const htmlHeadings = this.extractHeadingsFromHtml(content);
    return htmlHeadings;
  }

  private extractHeadingsFromMarkdown(content: string): TableOfContentItem[] {
    const lines = content.split('\n');
    const toc: TableOfContentItem[] = [];
    const slugCounts = new Map<string, number>();

    for (const line of lines) {
      const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
      if (!match) {
        continue;
      }

      const level = match[1].length;
      const text = match[2].trim();
      if (!text) {
        continue;
      }

      const baseSlug = text
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-');
      const count = slugCounts.get(baseSlug) ?? 0;
      slugCounts.set(baseSlug, count + 1);
      const id = count === 0 ? baseSlug : `${baseSlug}-${count}`;

      toc.push({ id, level, text });
    }

    return toc;
  }

  private extractHeadingsFromHtml(content: string): TableOfContentItem[] {
    const toc: TableOfContentItem[] = [];
    const slugCounts = new Map<string, number>();
    const headingRegex = /<h([1-6])([^>]*)>([\s\S]*?)<\/h\1>/gi;

    for (const match of content.matchAll(headingRegex)) {
      const level = Number(match[1]);
      const attrs = match[2] ?? '';
      const rawInner = match[3] ?? '';
      const text = rawInner.replace(/<[^>]+>/g, '').trim();
      if (!text) {
        continue;
      }

      const idMatch =
        /\sid=(['"])(.*?)\1/i.exec(attrs) ?? /\sid=([^\s>]+)/i.exec(attrs);
      let id = idMatch?.[2] ?? idMatch?.[1] ?? '';
      if (!id) {
        id = this.makeSlug(text, slugCounts);
      }

      toc.push({ id, level, text });
    }

    return toc;
  }

  private makeSlug(text: string, slugCounts: Map<string, number>): string {
    const baseSlug = text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-');
    const count = slugCounts.get(baseSlug) ?? 0;
    slugCounts.set(baseSlug, count + 1);
    return count === 0 ? baseSlug : `${baseSlug}-${count}`;
  }
}

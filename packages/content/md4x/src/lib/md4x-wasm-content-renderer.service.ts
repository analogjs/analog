import { Injectable, inject } from '@angular/core';

import {
  ContentRenderer,
  RenderedContent,
  TableOfContentItem,
} from '@analogjs/content';
import {
  MD4X_RENDERER_OPTIONS,
  Md4xRendererOptions,
} from './md4x-content-renderer.service';

function makeSlug(text: string, slugCounts: Map<string, number>): string {
  const baseSlug = text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  const count = slugCounts.get(baseSlug) ?? 0;
  slugCounts.set(baseSlug, count + 1);
  return count === 0 ? baseSlug : `${baseSlug}-${count}`;
}

function headingsToToc(
  headings: Array<{ level: number; text: string }>,
): TableOfContentItem[] {
  const slugCounts = new Map<string, number>();
  return headings.map((h) => ({
    id: makeSlug(h.text, slugCounts),
    level: h.level,
    text: h.text,
  }));
}

function injectHeadingIds(html: string, toc: TableOfContentItem[]): string {
  let tocIndex = 0;
  return html.replace(/<h([1-6])>/g, (match, level) => {
    const item = toc[tocIndex++];
    return item ? `<h${level} id="${item.id}">` : match;
  });
}

/**
 * Content renderer backed by md4x/wasm for client-side (browser) rendering.
 * ~100KB gzip, 3-6x faster than marked in the browser.
 *
 * @experimental md4x integration is experimental and may change in future releases.
 */
@Injectable()
export class Md4xWasmContentRendererService extends ContentRenderer {
  private options = inject(MD4X_RENDERER_OPTIONS, { optional: true });
  private initPromise: Promise<void> | null = null;

  override async render(content: string): Promise<RenderedContent> {
    const wasm = await import('md4x/wasm');
    if (!this.initPromise) {
      this.initPromise = wasm.init();
    }
    await this.initPromise;

    const html = wasm.renderToHtml(content, {
      heal: this.options?.heal,
      highlighter: this.options?.highlighter,
    });
    const meta = wasm.parseMeta(content);
    const toc = headingsToToc(meta.headings);
    return {
      content: injectHeadingIds(html, toc),
      toc,
    };
  }

  override getContentHeadings(content: string): TableOfContentItem[] {
    const lines = content.split('\n');
    const toc: TableOfContentItem[] = [];
    const slugCounts = new Map<string, number>();

    for (const line of lines) {
      const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
      if (!match) continue;
      const level = match[1].length;
      const text = match[2].trim();
      if (!text) continue;
      toc.push({ id: makeSlug(text, slugCounts), level, text });
    }

    return toc;
  }
}

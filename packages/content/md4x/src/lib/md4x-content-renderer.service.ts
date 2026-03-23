import { Injectable, inject, InjectionToken } from '@angular/core';

import {
  ContentRenderer,
  RenderedContent,
  TableOfContentItem,
} from '@analogjs/content';

/**
 * Options for the experimental md4x-based content renderer.
 *
 * @experimental md4x integration is experimental and may change in future releases.
 */
export interface Md4xRendererOptions {
  /** Heal incomplete markdown (useful for streaming/LLM content). */
  heal?: boolean;
  /** Custom code block highlighter. Receives raw code and block metadata,
   *  returns highlighted HTML or undefined to keep default rendering. */
  highlighter?: (
    code: string,
    block: { lang: string; filename?: string; highlights?: number[] },
  ) => string | undefined;
}

export const MD4X_RENDERER_OPTIONS: InjectionToken<Md4xRendererOptions> =
  new InjectionToken<Md4xRendererOptions>('md4x_renderer_options');

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
 * Content renderer backed by md4x (C-based CommonMark parser compiled with Zig).
 * 50-70x faster than marked for complex documents.
 *
 * @experimental md4x integration is experimental and may change in future releases.
 */
@Injectable()
export class Md4xContentRendererService extends ContentRenderer {
  private options = inject(MD4X_RENDERER_OPTIONS, { optional: true });

  override async render(content: string): Promise<RenderedContent> {
    const { renderToHtml, parseMeta } = await import('md4x/napi');
    const html = renderToHtml(content, {
      heal: this.options?.heal,
      highlighter: this.options?.highlighter,
    });
    const meta = parseMeta(content);
    const toc = headingsToToc(meta.headings);
    return {
      content: injectHeadingIds(html, toc),
      toc,
    };
  }

  override getContentHeadings(content: string): TableOfContentItem[] {
    // Synchronous fallback — md4x is async-imported so we use regex extraction
    // matching NoopContentRenderer's algorithm for consistency.
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

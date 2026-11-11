import { Injectable, inject, InjectionToken } from '@angular/core';

import {
  ContentRenderer,
  RenderedContent,
} from '../../../src/lib/content-renderer';

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
      headingIds: true,
    });
    return { content: html, toc: parseMeta(content).headings };
  }
}

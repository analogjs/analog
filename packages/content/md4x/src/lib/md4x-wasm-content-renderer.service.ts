import { Injectable, inject } from '@angular/core';

import {
  ContentRenderer,
  RenderedContent,
} from '../../../src/lib/content-renderer';
import {
  MD4X_RENDERER_OPTIONS,
  Md4xRendererOptions,
} from './md4x-content-renderer.service';

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
      headingIds: true,
    });
    return { content: html, toc: wasm.parseMeta(content).headings };
  }
}

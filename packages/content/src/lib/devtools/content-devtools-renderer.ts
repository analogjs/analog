import { Injectable, Inject, InjectionToken } from '@angular/core';

import {
  ContentRenderer,
  RenderedContent,
  TableOfContentItem,
} from '../content-renderer';

/**
 * Token for the wrapped renderer that DevTools delegates to.
 * @internal
 */
export const DEVTOOLS_INNER_RENDERER: InjectionToken<ContentRenderer> =
  new InjectionToken<ContentRenderer>('devtools_inner_renderer');

/**
 * Wraps an existing ContentRenderer to collect timing and metadata for the
 * Content DevTools panel. Dispatches a custom event on the window after
 * each render so the devtools client can update.
 *
 * @experimental Content DevTools is experimental and may change in future releases.
 */
@Injectable()
export class DevToolsContentRenderer extends ContentRenderer {
  constructor(@Inject(DEVTOOLS_INNER_RENDERER) private inner: ContentRenderer) {
    super();
  }

  override async render(content: string): Promise<RenderedContent> {
    const start = performance.now();
    const result = await this.inner.render(content);
    const elapsed = performance.now() - start;

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('analog-content-devtools-data', {
          detail: {
            renderer: this.inner.constructor.name,
            parseTimeMs: elapsed,
            toc: result.toc,
            contentLength: content.length,
            headingCount: result.toc.length,
          },
        }),
      );
    }

    return result;
  }

  override getContentHeadings(content: string): TableOfContentItem[] {
    return this.inner.getContentHeadings(content);
  }

  override enhance(): void {
    this.inner.enhance();
  }
}

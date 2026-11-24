import { Provider } from '@angular/core';

import { ContentRenderer } from '../../../src/lib/content-renderer';
import { withContentFileLoader } from '../../../src/lib/content-file-loader';
import { withContentListLoader } from '../../../src/lib/content-list-loader';
import {
  Md4xContentRendererService,
  MD4X_RENDERER_OPTIONS,
} from './md4x-content-renderer.service';
import { Md4xWasmContentRendererService } from './md4x-wasm-content-renderer.service';
import type { Md4xRendererOptions } from './md4x-content-renderer.service';

/**
 * Provides the experimental md4x-based content renderer (NAPI, server/build-time).
 *
 * @experimental md4x integration is experimental and may change in future releases.
 *
 * @example
 * ```typescript
 * provideContent(withMd4xRenderer());
 * provideContent(withMd4xRenderer({ heal: true }));
 * ```
 */
export function withMd4xRenderer(options?: Md4xRendererOptions): Provider {
  return [
    { provide: ContentRenderer, useClass: Md4xContentRendererService },
    options ? { provide: MD4X_RENDERER_OPTIONS, useValue: options } : [],
    withContentFileLoader(),
    withContentListLoader(),
  ];
}

/**
 * Provides the experimental md4x WASM content renderer (browser/CSR).
 * ~100KB gzip, 3-6x faster than marked in the browser.
 *
 * @experimental md4x integration is experimental and may change in future releases.
 *
 * @example
 * ```typescript
 * provideContent(withMd4xWasmRenderer());
 * ```
 */
export function withMd4xWasmRenderer(options?: Md4xRendererOptions): Provider {
  return [
    { provide: ContentRenderer, useClass: Md4xWasmContentRendererService },
    options ? { provide: MD4X_RENDERER_OPTIONS, useValue: options } : [],
    withContentFileLoader(),
    withContentListLoader(),
  ];
}

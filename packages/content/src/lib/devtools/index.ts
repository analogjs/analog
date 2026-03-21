import { Provider } from '@angular/core';
import { ContentRenderer } from '../content-renderer';
import {
  DevToolsContentRenderer,
  DEVTOOLS_INNER_RENDERER,
} from './content-devtools-renderer';

export { contentDevToolsPlugin } from './content-devtools-plugin';
export {
  DevToolsContentRenderer,
  DEVTOOLS_INNER_RENDERER,
} from './content-devtools-renderer';

/**
 * Wraps the active ContentRenderer with DevTools instrumentation.
 * Add this after your renderer provider to enable the devtools panel.
 *
 * The existing renderer is moved to DEVTOOLS_INNER_RENDERER and
 * DevToolsContentRenderer becomes the new ContentRenderer, delegating
 * all calls and collecting timing data.
 *
 * @experimental Content DevTools is experimental and may change in future releases.
 *
 * @example
 * ```typescript
 * provideContent(
 *   withMd4xRenderer(),
 *   withContentDevTools(), // wraps md4x renderer with timing + metadata
 * );
 * ```
 */
export function withContentDevTools(): Provider {
  return [
    {
      provide: DEVTOOLS_INNER_RENDERER,
      useExisting: ContentRenderer,
    },
    {
      provide: ContentRenderer,
      useClass: DevToolsContentRenderer,
    },
  ];
}

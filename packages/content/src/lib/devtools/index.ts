import { Provider, Type } from '@angular/core';
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
 * Wraps the given ContentRenderer with DevTools instrumentation.
 *
 * The supplied renderer class is provided under DEVTOOLS_INNER_RENDERER and
 * DevToolsContentRenderer becomes the new ContentRenderer, delegating
 * all calls and collecting timing data.
 *
 * @param innerRenderer The renderer class to wrap with devtools instrumentation.
 *
 * @experimental Content DevTools is experimental and may change in future releases.
 *
 * @example
 * ```typescript
 * provideContent(
 *   withContentDevTools(NoopContentRenderer),
 * );
 * ```
 */
export function withContentDevTools(
  innerRenderer: Type<ContentRenderer>,
): Provider {
  return [
    {
      provide: DEVTOOLS_INNER_RENDERER,
      useClass: innerRenderer,
    },
    {
      provide: ContentRenderer,
      useClass: DevToolsContentRenderer,
    },
  ];
}

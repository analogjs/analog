import type { AnalogIntegrationPlugin } from '@analogjs/vite-plugin-angular';

import { pageGlobs } from './discover-library-routes.js';
import type { Options } from './options.js';

/**
 * Registers `additionalPagesDirs` with Angular compilation through
 * `analog.setup()`, so workspace library pages compile without a matching
 * `include` on `angular()`.
 */
export function libraryPagesPlugin(
  options?: Options,
): AnalogIntegrationPlugin[] {
  const dirs = options?.additionalPagesDirs ?? [];
  if (!dirs.length) {
    return [];
  }

  return [
    {
      name: 'analogjs-platform-library-pages',
      analog: {
        setup(ctx) {
          ctx.addInclude(pageGlobs(dirs));
        },
      },
    },
  ];
}

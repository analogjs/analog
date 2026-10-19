import type { AnalogIntegrationPlugin } from '@analogjs/vite-plugin-angular';

import { pageGlobs } from './discover-library-routes.js';
import type { Options } from './options.js';

/**
 * The platform's `analog.setup()` hook into `@analogjs/vite-plugin-angular`.
 * Keeps Angular away from the platform's content modules and registers
 * `additionalPagesDirs` so workspace library pages compile without a matching
 * `include` on `angular()`.
 */
export function analogIntegrationPlugin(
  options?: Options,
): AnalogIntegrationPlugin {
  const pagesDirs = options?.additionalPagesDirs ?? [];

  return {
    name: 'analogjs-platform-angular-integration',
    analog: {
      setup(ctx) {
        // Content files are imported with `?analog-content-*` markers and
        // served by the content plugin, never compiled by Angular.
        ctx.registerTransformFilter(
          (_code, id) => !(id.includes('?') && id.includes('analog-content-')),
        );
        if (pagesDirs.length) {
          ctx.addInclude(pageGlobs(pagesDirs));
        }
      },
    },
  };
}

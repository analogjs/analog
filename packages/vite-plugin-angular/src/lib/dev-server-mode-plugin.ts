import type { Plugin } from 'vite';
import { isServerEnvironment } from './utils/plugin-config.js';

/**
 * Defines `ngServerMode: 'true'` for server environments during `vite serve`.
 * Runs after other plugins' `configEnvironment` hooks so an explicit
 * `consumer` configured by a downstream plugin is respected.
 */
export function devServerModePlugin(): Plugin {
  return {
    name: '@analogjs/vite-plugin-angular-dev-server-mode',
    apply: 'serve',
    configEnvironment: {
      order: 'post',
      handler(name, config) {
        if (isServerEnvironment(name, config)) {
          return { define: { ngServerMode: 'true' } };
        }
        return undefined;
      },
    },
  };
}

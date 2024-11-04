import { Plugin } from 'vite';

/**
 * This plugin ensures the ngServerMode flag is set
 * during SSR. This should be revisited when Vite 6 lands
 * with the new Environment API.
 */
export function serverModePlugin(): Plugin {
  return {
    name: 'analogjs-server-mode-plugin',
    transform(code, id, options) {
      if (
        options?.ssr &&
        (id.endsWith('platform-server.mjs') || id.endsWith('core.mjs'))
      ) {
        return {
          code: code.replaceAll('ngServerMode', 'true'),
        };
      }

      return;
    },
  };
}

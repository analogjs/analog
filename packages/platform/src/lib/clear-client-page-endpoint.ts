import { Plugin, normalizePath } from 'vite';

export function clearClientPageEndpointsPlugin(): Plugin {
  return {
    name: 'analogjs-platform-clear-client-page-endpoint',
    transform(_code, id, options) {
      if (
        !options?.ssr &&
        id.includes(normalizePath('src/app/pages')) &&
        id.endsWith('.server.ts')
      ) {
        return {
          code: 'export default undefined;',
          map: null,
        };
      }

      return;
    },
  };
}

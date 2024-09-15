import { normalizePath, Plugin } from 'vite';

export function ssrBuildPlugin(): Plugin {
  return {
    name: 'analogjs-ssr-build-plugin',
    transform(code, id) {
      if (
        id.includes('zone-node') &&
        code.includes('const global = globalThis;')
      ) {
        return {
          code: code.replace('const global = globalThis;', ''),
        };
      }

      if (id.includes('platform-server')) {
        return {
          code: code
            .replace(
              'new xhr2.XMLHttpRequest',
              'new (xhr2.default.XMLHttpRequest || xhr2.default)',
            )
            .replaceAll('global.', 'globalThis.')
            .replaceAll('global,', 'globalThis,')
            .replaceAll(' global[', ' globalThis['),
        };
      }

      // Remove usage of `with()` in sloppy.js file
      if (id.includes(normalizePath('domino/lib/sloppy.js'))) {
        return {
          code: code.replace(/with\(/gi, 'if('),
        };
      }

      return;
    },
  };
}

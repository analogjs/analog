import { normalizePath, Plugin } from 'vite';

export function ssrBuildPlugin(): Plugin {
  return {
    name: 'analogjs-ssr-build-plugin',
    config(_config) {
      return {
        resolve: {
          alias: {
            'zone.js/node': 'zone.js/bundles/zone-node.umd.js',
          },
        },
      };
    },
    transform(code, id) {
      if (id.includes('platform-server')) {
        code = code.replace(/global\./g, 'globalThis.');

        return {
          code: code.replace(
            'new xhr2.XMLHttpRequest',
            'new (xhr2.default.XMLHttpRequest || xhr2.default)'
          ),
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

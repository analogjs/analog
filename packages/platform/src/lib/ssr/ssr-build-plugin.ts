import { normalizePath, Plugin } from 'vite';

export function ssrBuildPlugin(): Plugin {
  return {
    name: 'analogjs-ssr-build-plugin',
    config() {
      return {
        define: {
          global: 'globalThis',
        },
      };
    },
    transform(code, id) {
      if (id.includes('platform-server')) {
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

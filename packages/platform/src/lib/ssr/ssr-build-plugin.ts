import { Plugin } from 'vite';

export function ssrBuildPlugin(): Plugin {
  return {
    apply: 'build',
    name: 'analogjs-ssr-build-plugin',
    config(_config) {
      return {
        resolve: {
          alias: {
            'zone.js/node': 'zone.js/bundles/zone-node.umd.js',
          },
        },
        ssr: {
          noExternal: ['@analogjs/router', '@angular/**'],
        },
      };
    },
    transform(code, id) {
      // Remove usage of `with()` in sloppy.js file
      if (id.includes('domino/lib/sloppy.js')) {
        return {
          code: code.replace(/with\(/gi, 'if('),
        };
      }

      // Convert usage of xhr2 default import
      if (code.includes('new xhr2.')) {
        return {
          code: code.replace('new xhr2.', 'new xhr2.default.'),
        };
      }

      return;
    },
  };
}

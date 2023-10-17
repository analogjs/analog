import { normalizePath, Plugin } from 'vite';

export function ssrXhrBuildPlugin(): Plugin {
  return {
    name: 'analogjs-xhr2-build-plugin',
    apply: 'build',
    config() {
      return {
        resolve: {
          alias: {
            // 'zone.js/node': 'zone.js/plugins/zone-node',
          },
        },
        ssr: {
          noExternal: ['xhr2'],
        },
      };
    },
    transform(code, id) {
      // Remove usage of process.node in xhr2.js file
      if (id.includes(normalizePath('xhr2.js'))) {
        return {
          code: code
            .replace('os.type()', `''`)
            .replace('os.arch()', `''`)
            .replace('process.versions.node', `'node'`)
            .replace('process.versions.v8', `'v8'`),
        };
      }

      return;
    },
  };
}

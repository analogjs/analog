import { build, mergeConfig, Plugin, UserConfig } from 'vite';
import { Options } from '../options';

export function ssrBuildPlugin(options?: Options): Plugin {
  let config: UserConfig;
  let ssrBuildConfig: UserConfig;

  return {
    apply: 'build',
    name: 'analogjs-ssr-build-plugin',
    config(_config) {
      config = _config;

      ssrBuildConfig = mergeConfig(config, {
        build: {
          ssr: true,
          rollupOptions: {
            input: options?.entryServer || './src/main.server.ts',
          },
          outDir: options?.ssrBuildDir || './dist/ssr',
        },
      });

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
    async closeBundle() {
      if (config?.build!.ssr) {
        return;
      }

      console.log('Building SSR build');
      await build(ssrBuildConfig);
    },
  };
}

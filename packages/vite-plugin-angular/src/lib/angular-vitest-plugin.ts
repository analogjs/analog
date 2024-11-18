import { Plugin, transformWithEsbuild, UserConfig } from 'vite';

export function angularVitestPlugin(): Plugin {
  return {
    name: '@analogjs/vitest-angular-esm-plugin',
    apply: 'serve',
    enforce: 'post',
    config(userConfig) {
      return {
        optimizeDeps: {
          include: ['tslib', '@angular/cdk/testing/testbed'],
          exclude: ['@angular/cdk/testing'],
        },
        ssr: {
          noExternal: [/cdk\/fesm2022/],
        },
        test: {
          pool: userConfig.test?.pool ?? 'vmThreads',
          server: {
            deps: {
              inline: [
                '@angular/material',
                '@analogjs/router',
                '@analogjs/vitest-angular/setup-zone',
              ],
            },
          },
        },
      };
    },
    async transform(_code, id) {
      if (
        (/fesm2022/.test(id) && _code.includes('async (')) ||
        _code.includes('@angular/cdk')
      ) {
        const { code, map } = await transformWithEsbuild(_code, id, {
          loader: 'js',
          format: 'esm',
          target: 'es2016',
          sourcemap: true,
          sourcefile: id,
        });

        return {
          code,
          map,
        };
      }

      return undefined;
    },
  };
}

/**
 * This eagerly disables esbuild so Vitest
 * disables it when its internal plugin
 * is configured.
 */
export function angularVitestEsbuildPlugin(): Plugin {
  return {
    name: '@analogjs/vitest-angular-esbuild-plugin',
    enforce: 'pre',
    config(userConfig: UserConfig) {
      return {
        esbuild: userConfig.esbuild ?? false,
      };
    },
  };
}

/**
 * This plugin does post-processing with esbuild
 * instead of preprocessing to re-align
 * the sourcemaps so breakpoints and coverage reports
 * work correctly.
 */
export function angularVitestSourcemapPlugin(): Plugin {
  return {
    name: '@analogjs/vitest-angular-sourcemap-plugin',
    async transform(code: string, id: string) {
      const [, query] = id.split('?');

      if (query && query.includes('inline')) {
        return;
      }

      const result = await transformWithEsbuild(code, id, {
        loader: 'js',
      });

      return result;
    },
  };
}

export function angularVitestPlugins() {
  return [
    angularVitestPlugin(),
    angularVitestEsbuildPlugin(),
    angularVitestSourcemapPlugin(),
  ];
}

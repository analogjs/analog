import { Plugin, UserConfig, transformWithEsbuild } from 'vite';

export function angularVitestPlugin(): Plugin {
  return {
    name: '@analogjs/vitest-angular-esm-plugin',
    apply: 'serve',
    enforce: 'post',
    config(userConfig) {
      return {
        ssr: {
          noExternal: [/cdk\/fesm2022/],
        },
        test: {
          pool: userConfig.test?.pool ?? 'vmThreads',
          server: {
            deps: {
              inline: ['@analogjs/router'],
            },
          },
        },
      };
    },
    async transform(_code, id) {
      if (/fesm2022/.test(id) && _code.includes('async (')) {
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

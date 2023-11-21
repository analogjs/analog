import { Plugin, transformWithEsbuild } from 'vite';

export function angularVitestPlugin(): Plugin {
  return {
    name: '@analogjs/vitest-angular-esm-plugin',
    enforce: 'post',
    apply: 'serve',
    config() {
      return {
        ssr: {
          noExternal: [/fesm2022/],
        },
      };
    },
    async transform(_code, id) {
      if (/fesm2022/.test(id)) {
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

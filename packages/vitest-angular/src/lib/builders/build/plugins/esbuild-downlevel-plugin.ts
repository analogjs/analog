import { Plugin, transformWithEsbuild } from 'vite';

export function esbuildDownlevelPlugin(): Plugin {
  return {
    name: 'analogs-vitest-esbuild-downlevel-plugin',
    async transform(_code, id) {
      if (_code.includes('async (')) {
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

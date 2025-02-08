export async function esbuildDownlevelPlugin() {
  const { transformWithEsbuild } = await (Function(
    'return import("vite")',
  )() as Promise<typeof import('vite')>);
  return {
    name: 'analogs-vitest-esbuild-downlevel-plugin',
    async transform(_code: string, id: string) {
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

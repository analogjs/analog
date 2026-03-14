import { transformSync } from 'oxc-transform';

export function downlevelPlugin() {
  return {
    name: 'analogjs-vitest-oxc-downlevel-plugin',
    transform(_code: string, id: string) {
      if (_code.includes('async (')) {
        const { code, map } = transformSync(id, _code, {
          lang: 'js',
          target: 'es2016',
          sourcemap: true,
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

/** @deprecated Use {@link downlevelPlugin} instead. */
export const esbuildDownlevelPlugin = downlevelPlugin;

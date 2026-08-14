import { type SourceMap, transformSync } from 'oxc-transform';

export function downlevelPlugin(): {
  name: string;
  transform(
    _code: string,
    id: string,
  ): { code: string; map: SourceMap | undefined } | undefined;
} {
  return {
    name: 'analogjs-vitest-oxc-downlevel-plugin',
    transform(
      _code: string,
      id: string,
    ): { code: string; map: SourceMap | undefined } | undefined {
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
export const esbuildDownlevelPlugin: typeof downlevelPlugin = downlevelPlugin;

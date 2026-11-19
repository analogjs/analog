import type {
  FastCompileSourceFormat,
  SourceMapInput,
} from './fast-compile-api.js';

/**
 * The NGP compile plugin's API (`compilation: 'ngp'`), for Vite plugins that
 * compile other source formats into Angular components.
 *
 * NGP analyzes the whole program when the build starts, so a format's modules
 * are lowered to TypeScript up front and NGP reads each one as a TypeScript
 * file named after it (`counter.tsrx` as `counter.tsrx.ts`). Imports of the
 * module resolve to that file, and the lowered code is type-checked with it.
 */
export interface NgpCompileApi {
  registerSourceFormat(format: NgpSourceFormat): void;
}

export interface NgpSourceFormat extends FastCompileSourceFormat {
  /** Glob of the format's modules, relative to the tsconfig's directory. */
  include: string;
  /** Lowers a module to the TypeScript NGP compiles in its place. */
  lower(
    code: string,
    path: string,
    context: NgpLowerContext,
  ): Promise<NgpLoweredModule>;
}

export interface NgpLowerContext {
  /**
   * Scans the modules behind `specifiers`, imported by the module being
   * lowered, so `resolveSelector` knows their selectors.
   */
  scanImports(specifiers: string[]): Promise<void>;
  /** The element selector of a component or directive class, if known. */
  resolveSelector(className: string): string | null;
}

export interface NgpLoweredModule {
  code: string;
  /** Why the module couldn't be lowered, reported when it's transformed. */
  error?: { message: string; loc?: { line: number; column: number } };
  /** Maps a source map of `code` back to the module's source. */
  mapToSource(map: SourceMapInput): { [key: string]: unknown };
  /**
   * Maps a zero-based line and column in `code` to the module's source, or
   * `null` for generated code.
   */
  toSourceLocation(
    line: number,
    column: number,
  ): { line: number; column: number } | null;
}

/** Finds the NGP compile plugin's API among resolved Vite plugins. */
export function findNgpCompileApi(
  plugins: readonly { api?: unknown }[],
): NgpCompileApi | undefined {
  for (const plugin of plugins) {
    const api = plugin.api as { ngp?: NgpCompileApi } | undefined;
    if (api?.ngp) {
      return api.ngp;
    }
  }
  return undefined;
}

/**
 * The fast compile path's plugin API, for Vite plugins that compile other
 * source formats into Angular components (for example `.tsrx` modules).
 *
 * Such a plugin finds the fast compile plugin by its `api.fastCompile`
 * property, lowers its modules to TypeScript, and hands the result to
 * `compile()`.
 */

/** Resolves an import the way Vite's `this.resolve` does. */
export type FastCompileResolve = (
  specifier: string,
  importer: string,
) => Promise<{
  id: string;
  external?: boolean | 'absolute' | 'relative';
} | null>;

/** A source format whose modules compile to Angular components. */
export interface FastCompileSourceFormat {
  /** Short name used in diagnostics, for example `'tsrx'`. */
  name: string;
  /** Whether a module path (without query) belongs to this format. */
  test(path: string): boolean;
  /**
   * TypeScript for registry scanning. It must declare the same Angular
   * classes, selectors, inputs and outputs as the compiled module; template
   * details may be placeholders.
   */
  toScanSource(code: string, path: string): Promise<string> | string;
}

/** A source map, as a JSON string or an object. */
export type SourceMapInput = string | { [key: string]: unknown };

export interface FastCompileOptions {
  /** Resolves the module's imports, usually the calling plugin's `this.resolve`. */
  resolve: FastCompileResolve;
  /**
   * Maps the compiled output's source map (which points at `code`) back to
   * the module's original source.
   */
  mapToSource?(map: SourceMapInput): { [key: string]: unknown };
}

export interface FastCompileApi {
  /** Registers a source format so registry scans and HMR understand its modules. */
  registerSourceFormat(format: FastCompileSourceFormat): void;
  /**
   * Scans the modules behind `specifiers`, imported by `importer`, into the
   * component registry so `resolveSelector` knows their selectors. Relative
   * imports are scanned from source; packages from their `.d.ts` declarations.
   */
  scanImports(
    specifiers: string[],
    importer: string,
    resolve: FastCompileResolve,
  ): Promise<void>;
  /** The element selector of a component or directive class, if known. */
  resolveSelector(className: string): string | null;
  /** Compiles TypeScript produced for module `id`. */
  compile(
    code: string,
    id: string,
    options: FastCompileOptions,
  ): Promise<{ code: string; map: SourceMapInput | null } | undefined>;
}

/** Finds the fast compile plugin's API among resolved Vite plugins. */
export function findFastCompileApi(
  plugins: readonly { api?: unknown }[],
): FastCompileApi | undefined {
  for (const plugin of plugins) {
    const api = plugin.api as { fastCompile?: FastCompileApi } | undefined;
    if (api?.fastCompile) {
      return api.fastCompile;
    }
  }
  return undefined;
}

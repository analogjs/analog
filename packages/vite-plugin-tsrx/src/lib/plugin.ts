import {
  findFastCompileApi,
  type FastCompileApi,
  type FastCompileResolve,
} from '@analogjs/vite-plugin-angular';
import type { Plugin, Rollup } from 'vite';

import {
  firstDiagnosticLoc,
  formatTsrxDiagnostics,
  isTsrxFile,
  lowerTsrxForScan,
  lowerTsrxModule,
  remapTsrxSourceMap,
  TSRX_GLOB,
  tsrxImportSpecifiers,
} from './cache.js';

/**
 * Experimental: compiles `.tsrx` modules (TypeScript Render Extensions) as
 * Angular components.
 *
 * Each `function Name() @{ … }` is lowered to an ordinary `@Component` class
 * and compiled by `@analogjs/vite-plugin-angular`'s fast compile path, which
 * must be enabled:
 *
 * ```ts
 * plugins: [tsrx(), angular({ fastCompile: true })]
 * ```
 */
export function tsrx(): Plugin {
  let fastCompile: FastCompileApi | undefined;

  return {
    name: '@analogjs/vite-plugin-tsrx',
    enforce: 'pre',
    configResolved(config) {
      fastCompile = findFastCompileApi(config.plugins);
      if (!fastCompile) {
        throw new Error(
          '[@analogjs/vite-plugin-tsrx]: TSRX components compile through the fast compile path of ' +
            '@analogjs/vite-plugin-angular. Add `angular({ fastCompile: true })` to your Vite plugins.',
        );
      }
      fastCompile.registerSourceFormat({
        name: 'tsrx',
        test: isTsrxFile,
        toScanSource: async (code, path) =>
          (await lowerTsrxForScan(code, path)).code,
      });
    },
    transform: {
      filter: {
        id: {
          include: [TSRX_GLOB],
          exclude: [/node_modules/, /[?&]raw\b/],
        },
      },
      async handler(code, id) {
        const compiler = fastCompile!;
        const path = id.split('?')[0];
        const resolve: FastCompileResolve = (specifier, importer) =>
          this.resolve(specifier, importer, { skipSelf: true });

        // Scan what the module imports into the component registry, read
        // straight from its (cached) TSRX parse, then lower it once with
        // those selectors known.
        await compiler.scanImports(
          await tsrxImportSpecifiers(code, path),
          path,
          resolve,
        );
        const lowered = await lowerTsrxModule(code, path, {
          resolveSelector: (className) => compiler.resolveSelector(className),
        });
        if (lowered.diagnostics.length > 0) {
          this.error({
            message: formatTsrxDiagnostics(lowered, code, path),
            id: path,
            loc: firstDiagnosticLoc(lowered, code, path),
          });
        }

        const compiled = await compiler.compile(lowered.code, path, {
          resolve,
          mapToSource: (map) => remapTsrxSourceMap(map, lowered.sourceMap),
        });
        if (!compiled) {
          return undefined;
        }
        // The fast compiler returns a standard source map object or string.
        return {
          code: compiled.code,
          map: compiled.map as Rollup.SourceMapInput,
        };
      },
    },
  };
}

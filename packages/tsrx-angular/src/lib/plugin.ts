import {
  findFastCompileApi,
  findNgpCompileApi,
  type FastCompileApi,
  type FastCompileResolve,
  type FastCompileSourceFormat,
  type NgpLowerContext,
  type NgpLoweredModule,
} from '@analogjs/vite-plugin-angular';
import { existsSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import type { Plugin, ResolvedConfig, Rollup, ViteDevServer } from 'vite';

import {
  clearTsrxCache,
  evictTsrxCache,
  firstDiagnosticLoc,
  formatTsrxDiagnostics,
  isTsrxFile,
  lowerTsrxForScan,
  lowerTsrxModule,
  remapTsrxSourceMap,
  TSRX_GLOB,
  tsrxImportSpecifiers,
} from './cache.js';
import type { TsrxTypesResult } from './types.js';

export interface TsrxPluginOptions {
  /**
   * Writes TypeScript declarations for `.tsrx` files, so `tsc` and editors
   * type-check imports of them: once on `vite build`, and on the dev server at
   * startup and after every change.
   *
   * Default: on, with the Vite root's `tsconfig.app.json` (or `tsconfig.json`)
   * and `node_modules/.analog/tsrx-types` next to it. See the README for the
   * tsconfig options that read them.
   */
  types?: boolean | TsrxTypesPluginOptions;
}

export interface TsrxTypesPluginOptions {
  /** Default: `tsconfig.app.json`, else `tsconfig.json`, in the Vite root. */
  tsconfig?: string;
  /** Relative to the tsconfig. Default: `node_modules/.analog/tsrx-types`. */
  outDir?: string;
}

/**
 * Experimental: compiles `.tsrx` modules (TypeScript Render Extensions) as
 * Angular components.
 *
 * Each `function Name() @{ … }` is lowered to an ordinary `@Component` class
 * and compiled by `@analogjs/vite-plugin-angular`'s fast compile path or its
 * NGP compilation, one of which must be enabled:
 *
 * ```ts
 * plugins: [tsrxAngular(), angular({ fastCompile: true })]
 * plugins: [tsrxAngular(), angular({ compilation: 'ngp' })]
 * ```
 */
export function tsrxAngular(options: TsrxPluginOptions = {}): Plugin {
  let fastCompile: FastCompileApi | undefined;
  let config: ResolvedConfig;
  let typesWritten: Promise<void> | undefined;
  let cleanupServer: (() => void) | undefined;
  const typesOptions =
    options.types === false
      ? undefined
      : options.types === true
        ? {}
        : (options.types ?? {});

  return {
    name: '@analogjs/tsrx-angular',
    enforce: 'pre',
    configureServer(server) {
      cleanupServer?.();
      const stopTypes = typesOptions
        ? keepTypesUpToDate(server, typesOptions)
        : undefined;
      const cleanup = () => {
        if (cleanupServer !== cleanup) {
          return;
        }
        cleanupServer = undefined;
        server.httpServer?.off?.('close', cleanup);
        stopTypes?.();
        clearTsrxCache();
      };
      cleanupServer = cleanup;
      server.httpServer?.once('close', cleanup);
    },
    closeBundle() {
      cleanupServer?.();
    },
    async buildStart() {
      // Once per build, which can run several environments (client, SSR).
      if (typesOptions && config.command === 'build') {
        typesWritten ??= writeTypes(config, typesOptions);
        await typesWritten;
      }
    },
    watchChange(id, { event }) {
      if (event === 'delete' && isTsrxFile(id)) {
        evictTsrxCache(id);
      }
      // `vite build --watch`: a change starts a new build, which writes them again.
      typesWritten = undefined;
    },
    configResolved(resolvedConfig) {
      config = resolvedConfig;
      fastCompile = findFastCompileApi(config.plugins);
      const ngp = fastCompile ? undefined : findNgpCompileApi(config.plugins);
      const format: FastCompileSourceFormat = {
        name: 'tsrx',
        test: isTsrxFile,
        toScanSource: async (code, path) =>
          (await lowerTsrxForScan(code, path)).code,
      };
      if (fastCompile) {
        fastCompile.registerSourceFormat(format);
      } else if (ngp) {
        ngp.registerSourceFormat({
          ...format,
          include: TSRX_GLOB,
          lower: lowerForNgp,
        });
      } else {
        throw new Error(
          '[@analogjs/tsrx-angular]: TSRX components compile through @analogjs/vite-plugin-angular. ' +
            "Add `angular({ fastCompile: true })` or `angular({ compilation: 'ngp' })` to your Vite plugins.",
        );
      }
    },
    transform: {
      filter: {
        id: {
          include: [TSRX_GLOB],
          exclude: [/node_modules/, /[?&]raw\b/],
        },
      },
      async handler(code, id) {
        // NGP compiles `.tsrx` modules itself, from `lowerForNgp`.
        if (!fastCompile) {
          return undefined;
        }
        const compiler = fastCompile;
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
          resolveSelector: (className, moduleSpecifier, containingFile) =>
            compiler.resolveSelector(
              className,
              moduleSpecifier,
              containingFile,
            ),
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

/** Lowers a `.tsrx` module to the TypeScript NGP compiles in its place. */
async function lowerForNgp(
  code: string,
  path: string,
  { scanImports, resolveSelector }: NgpLowerContext,
): Promise<NgpLoweredModule> {
  await scanImports(await tsrxImportSpecifiers(code, path));
  const lowered = await lowerTsrxModule(code, path, {
    resolveSelector: (className, moduleSpecifier, containingFile) =>
      resolveSelector(className, moduleSpecifier, containingFile),
  });
  return {
    code: lowered.code,
    error:
      lowered.diagnostics.length > 0
        ? {
            message: formatTsrxDiagnostics(lowered, code, path),
            loc: firstDiagnosticLoc(lowered, code, path),
          }
        : undefined,
    mapToSource: (map) => remapTsrxSourceMap(map, lowered.sourceMap),
    toSourceLocation: (line, column) =>
      lowered.sourceMap.toOriginalLineAndColumn(line, column),
  };
}

/** A declaration generator for the Vite root's tsconfig, if it has one. */
async function typeGenerator(root: string, options: TsrxTypesPluginOptions) {
  const tsconfig =
    options.tsconfig !== undefined
      ? resolvePath(root, options.tsconfig)
      : ['tsconfig.app.json', 'tsconfig.json']
          .map((name) => resolvePath(root, name))
          .find((path) => existsSync(path));
  if (tsconfig === undefined) {
    return undefined;
  }
  // Loaded only here, so the plugin doesn't pull in TypeScript otherwise.
  const { TsrxTypeGenerator, formatTsrxTypeDiagnostics } =
    await import('./types.js');
  const generator = new TsrxTypeGenerator({ tsconfig, outDir: options.outDir });
  return {
    generate: () => generator.generate(),
    format: (result: TsrxTypesResult) =>
      formatTsrxTypeDiagnostics(result.diagnostics, root),
  };
}

/** Generates `.tsrx` declarations once, for `vite build`. */
async function writeTypes(
  config: ResolvedConfig,
  options: TsrxTypesPluginOptions,
): Promise<void> {
  try {
    const types = await typeGenerator(config.root, options);
    if (types === undefined) {
      return;
    }
    const report = types.format(await types.generate());
    if (report !== '') {
      config.logger.warn(`[tsrx types]\n${report}`);
    }
  } catch (e) {
    config.logger.error(`[tsrx types] ${e instanceof Error ? e.message : e}`);
  }
}

/**
 * Generates `.tsrx` declarations at startup and again after source changes,
 * in the background so the dev server never waits for TypeScript.
 *
 * Returns a cleanup function that unregisters watcher listeners, clears any
 * pending debounce timer, and suppresses further runs.
 */
function keepTypesUpToDate(
  server: ViteDevServer,
  options: TsrxTypesPluginOptions,
): () => void {
  const root = server.config.root;
  const logger = server.config.logger;
  let closed = false;
  let running = false;
  let again = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastReport = '';
  let schedule: ((file: string) => void) | undefined;

  const stop = (): void => {
    if (closed) {
      return;
    }
    closed = true;
    again = false;
    clearTimeout(timer);
    timer = undefined;
    if (schedule && typeof server.watcher?.off === 'function') {
      server.watcher.off('add', schedule);
      server.watcher.off('change', schedule);
      server.watcher.off('unlink', schedule);
    }
  };

  void (async () => {
    // Started without awaiting, so a failure to load the generator is logged
    // here instead of becoming an unhandled rejection.
    const types = await typeGenerator(root, options).catch((e: unknown) => {
      if (!closed) {
        logger.error(`[tsrx types] ${e instanceof Error ? e.message : e}`, {
          timestamp: true,
        });
      }
      return undefined;
    });
    if (closed || types === undefined) {
      return;
    }

    const run = async (): Promise<void> => {
      if (closed) {
        return;
      }
      if (running) {
        again = true;
        return;
      }
      running = true;
      try {
        // Lowering errors also fail the module's transform, so only report
        // diagnostics when they change.
        const result = await types.generate();
        if (closed) {
          return;
        }
        const report = types.format(result);
        if (report !== lastReport && report !== '') {
          logger.warn(`[tsrx types]\n${report}`, { timestamp: true });
        }
        lastReport = report;
      } catch (e) {
        if (!closed) {
          logger.error(`[tsrx types] ${e instanceof Error ? e.message : e}`, {
            timestamp: true,
          });
        }
      } finally {
        running = false;
        const rerun = again && !closed;
        again = false;
        if (rerun) {
          void run();
        }
      }
    };

    schedule = (file: string): void => {
      if (closed || (!file.endsWith('.tsrx') && !file.endsWith('.ts'))) {
        return;
      }
      clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        void run();
      }, 100);
    };

    if (typeof server.watcher?.on === 'function') {
      server.watcher.on('add', schedule);
      server.watcher.on('change', schedule);
      server.watcher.on('unlink', schedule);
    }
    await run();
  })();

  return stop;
}

import * as compilerCli from '@angular/compiler-cli';
import { existsSync, promises as fsPromises, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type MagicString from 'magic-string';
import { glob } from 'tinyglobby';
import * as vite from 'vite';
import {
  discoverAnalogIntegrations,
  type ComponentRegistryEntries,
  type TransformFilter,
} from './analog-plugin-interop.js';
import {
  createAngularBuildContext,
  isAngularBuildContext,
  type AngularBuildContext,
  type AngularBuildContextOptions,
} from './angular-build-context.js';
import { ComponentScanner } from './component-scanner.js';
import type { FastCompileResolve } from './fast-compile-api.js';
import type { FastCompilePluginOptions } from './fast-compile-plugin.js';
import type {
  NgpCompileApi,
  NgpLoweredModule,
  NgpSourceFormat,
} from './ngp-compile-api.js';
import type { StylePreprocessor } from './style-preprocessor.js';
import { preprocessStylesheet } from './stylesheet-registry.js';
import { isIgnoredHmrFile } from './utils/compilation-shared.js';
import {
  createDepOptimizerConfig,
  getTsConfigPath,
  isProdMode,
  TS_EXT_REGEX,
  type TsConfigResolutionContext,
} from './utils/plugin-config.js';
import { releaseCssPreprocessorWorkers } from './utils/css-preprocessor-workers.js';
import { angularFullVersion } from './utils/devkit.js';
import { findHmrComponentUpdates } from './utils/hmr-component-updates.js';
import {
  LspTypeChecker,
  type FileChangeType,
  type SourceLocation,
} from './utils/lsp-type-checker.js';
import {
  canonicalPath,
  createNgpHostFs,
  fromWasmPath,
  toWasmPath,
  type NgpHostFs,
} from './utils/ngp-host-fs.js';
import { isRolldown } from './utils/rolldown.js';
import type { ComponentUpdates } from './live-reload-plugin.js';
import {
  loadAngularVirtualModule,
  resolveAngularVirtualId,
} from './virtual-modules-plugin.js';

// The unpublished NGP API is loaded at runtime. Model only the surface we use.
interface NgpDiagnostic {
  category: number;
  messageText: string;
}

interface NgpFile {
  filePath: string;
  diagnostics?: NgpDiagnostic[];
  classes: {
    className?: string;
    component?: {
      templateUrl?: { resolvedPath: string };
      styleUrls?: { resolvedPath: string }[];
      stylesFromUrls?: string[];
      styles?: string[];
    };
  }[];
}

interface NgpChunk {
  files: NgpFile[];
  removedFiles?: string[];
}

interface NgpResult {
  magicString: MagicString;
  diagnostics?: NgpDiagnostic[];
  tcb?: { code: string } | null;
  hmrUpdateModule?: string | null;
}

interface NgpAnalyzer {
  getFileContent(path: string): Promise<string>;
  updateFileContent(
    updates: { filePath: string; content: string }[],
  ): Promise<string[]>;
  invalidateFiles(
    updates: { filePath: string; updateType: number }[],
  ): Promise<string[]>;
  close(): void;
}

interface NgpCompiler {
  // Parsed templates by file, cleared by NGP's own update methods
  fileCache: Map<string, unknown>;
  analyzeOptimized(): AsyncIterable<NgpChunk>;
  analyzeOptimizedDelta(): AsyncIterable<NgpChunk>;
  prepareChunk(chunk: NgpChunk): Promise<unknown>;
  processFile(
    path: string,
    content: string,
    ...args: [undefined, NgpFile, unknown] | [NgpFile, unknown]
  ): Promise<NgpResult>;
}

interface ComponentUpdate {
  file: string;
  className: string;
}

interface NgpAnalyzerOptions {
  nativeBinding?: string;
  backend?: 'wasm';
  wasmBinding?: string;
  enableHmr?: boolean;
  hostFs?: NgpHostFs;
}

/** NGP's `FileUpdateType`. */
const FILE_CREATED = 0;
const FILE_DELETED = 1;
const FILE_CHANGED = 2;

/** A module of a registered source format, lowered to its program file. */
interface SourceModule {
  sourceFile: string;
  /** The source it was lowered from. */
  source: string;
  format: NgpSourceFormat;
  lowered: NgpLoweredModule;
}

interface NgpApi {
  createAnalyzer(
    tsconfig: string,
    options: NgpAnalyzerOptions,
  ): Promise<NgpAnalyzer>;
  HybridCompiler: new (
    analyzer: NgpAnalyzer,
    options: Record<string, unknown> & {
      optimize: boolean;
      enableHmr: boolean;
    },
  ) => NgpCompiler;
  buildTypeCheckingConfig(options: Record<string, unknown>): unknown;
}

function isFastCompileOptions(
  value: unknown,
): value is FastCompilePluginOptions {
  return (
    typeof value === 'object' &&
    value !== null &&
    !isAngularBuildContext(value) &&
    'tsconfigGetter' in value &&
    typeof (value as FastCompilePluginOptions).tsconfigGetter === 'function'
  );
}

// Interim NGP build bundled with this package until @angular/ngp is published
const BUNDLED_NGP = new URL('../../ngp/', import.meta.url);

/**
 * @param needsHostFs Whether source formats are registered, which only the
 *   WebAssembly backend can read through `hostFs`.
 */
async function loadNgp(
  tsconfig: string,
  needsHostFs: boolean,
): Promise<{ api: NgpApi; analyzerOptions: NgpAnalyzerOptions }> {
  const nativeBinding = process.env['ANALOG_NGP_NATIVE_BINDING'];
  if (nativeBinding && needsHostFs) {
    throw new Error(
      "[@analogjs/vite-plugin-angular]: Source formats such as TSRX can't be compiled with a native NGP analyzer build. Unset ANALOG_NGP_NATIVE_BINDING to use NGP's default WebAssembly analyzer.",
    );
  }
  let modulePath = process.env['ANALOG_NGP_COMPILER'];
  if (!modulePath) {
    try {
      modulePath = createRequire(tsconfig).resolve('@angular/ngp');
    } catch {
      if (angularFullVersion < 220200) {
        throw new Error(
          "[@analogjs/vite-plugin-angular]: compilation: 'ngp' requires Angular v22.2 or later.",
        );
      }
      return {
        api: await import(new URL('api.mjs', BUNDLED_NGP).href),
        analyzerOptions: nativeBinding
          ? { nativeBinding }
          : {
              backend: 'wasm',
              wasmBinding: fileURLToPath(
                new URL('ng_analyze.cjs', BUNDLED_NGP),
              ),
            },
      };
    }
  }
  return {
    api: await import(pathToFileURL(resolve(modulePath)).href),
    analyzerOptions: nativeBinding
      ? { nativeBinding }
      : needsHostFs
        ? { backend: 'wasm' }
        : {},
  };
}

function transpile(
  source: string,
  filePath: string,
  map?: Parameters<typeof vite.transformWithEsbuild>[3],
) {
  return vite.transformWithOxc
    ? vite.transformWithOxc(
        source,
        filePath,
        { lang: 'ts', sourcemap: true },
        map,
      )
    : vite.transformWithEsbuild(
        source,
        filePath,
        { loader: 'ts', sourcemap: true },
        map,
      );
}

export function ngpCompilePlugin(
  optionsOrCtx?:
    | AngularBuildContext
    | FastCompilePluginOptions
    | AngularBuildContextOptions,
): vite.Plugin {
  const sharedCtx = isAngularBuildContext(optionsOrCtx)
    ? optionsOrCtx
    : isFastCompileOptions(optionsOrCtx)
      ? undefined
      : createAngularBuildContext({
          jit: false,
          ...optionsOrCtx,
          compilationBackend: 'ngp',
        });

  const options: FastCompilePluginOptions = sharedCtx
    ? sharedCtx.options
    : (optionsOrCtx as FastCompilePluginOptions);

  if (options.jit || options.fastCompileMode === 'partial') {
    throw new Error(
      "compilation: 'ngp' requires jit: false and fastCompileMode: 'full'.",
    );
  }

  let configContext: TsConfigResolutionContext | undefined;
  let resolvedConfig: vite.ResolvedConfig;
  let transformFilter: TransformFilter | undefined;
  let componentRegistries: ComponentRegistryEntries[] = [];
  let stylePreprocessor: StylePreprocessor | undefined;
  let watchMode = false;
  let hmr = false;
  let activeBuilds = 0;
  let analyzer: NgpAnalyzer | undefined;
  let compiler: NgpCompiler | undefined;
  let typeChecker: LspTypeChecker | undefined;
  let api: NgpApi;
  let toAnalyzerPath = (path: string) => path;
  let fromAnalyzerPath = vite.normalizePath;
  const filesByPath = new Map<string, { file: NgpFile; chunk: NgpChunk }>();
  const chunkContexts = new Map<NgpChunk, Promise<unknown>>();
  const output = new Map<string, Promise<NgpResult>>();
  const emittedMaps = new Map<string, string>();
  // Last compiled source of each file, compared on edits for HMR
  const sources = new Map<string, string>();
  // Watched files mapped to the source files that depend on them
  const dependents = new Map<string, Set<string>>();
  const hmrUpdateCode = new Map<string, string>();
  const classNames = sharedCtx
    ? sharedCtx.hmr.classNames
    : new Map<string, string>();
  const fileEmitter = (file: string, className: string) => ({
    hmrUpdateCode: hmrUpdateCode.get(`${file}@${className}`),
  });
  sharedCtx?.hmr.setFileEmitter(fileEmitter);

  const componentUpdates: ComponentUpdates = {
    classNames,
    fileEmitter,
  };
  let pending = Promise.resolve();
  const excluded = [
    /node_modules/,
    /[?&]raw\b/,
    /type=script/,
    /@ng\/component/,
  ];
  const filter = vite.createFilter(TS_EXT_REGEX, excluded);
  const sourceFilter = vite.createFilter(null, excluded);

  // Source formats registered through `api.ngp`, the component registry their
  // lowering looks selectors up in, and their modules by program file
  // (`x.tsrx` → `x.tsrx.ts`)
  const sourceFormats: NgpSourceFormat[] = [];
  const scanner = new ComponentScanner();
  const sourceModules = new Map<string, SourceModule>();
  // Per program file: how often it was removed, which cancels a lowering in
  // progress, and the lowered code the analyzer has
  const removals = new Map<string, number>();
  const analyzed = new Map<string, string>();
  // Which modules of each format NGP compiles: its `include` under the tsconfig's directory
  const includes = new Map<NgpSourceFormat, (file: string) => boolean>();
  const moduleFormatOf = (file: string): NgpSourceFormat | undefined =>
    sourceFormats.find(
      (format) => format.test(file) && includes.get(format)?.(file),
    );
  let devServer: vite.ViteDevServer | undefined;
  // The program files a file change lowered again, for the hot update after it
  const reloweredByChange = new Map<string, string[]>();
  const programFileOf = (file: string): string | undefined => {
    const programFile = `${file}.ts`;
    return sourceModules.has(programFile) ? programFile : undefined;
  };
  const sourceFileOf = (file: string): string =>
    sourceModules.get(file)?.sourceFile ?? file;

  function resolveTsConfigPath(): string {
    if (sharedCtx) {
      return sharedCtx.resolveTsConfigPath();
    }
    const ctx = configContext ?? {
      root: resolvedConfig?.root || '.',
      isProd: isProdMode(resolvedConfig?.mode),
      isLib: !!resolvedConfig?.build?.lib,
    };
    return getTsConfigPath(
      ctx.root,
      options.tsconfigGetter(),
      ctx.isProd,
      options.isTest,
      ctx.isLib,
      options.workspaceRoot,
    );
  }

  const ngp: NgpCompileApi = {
    registerSourceFormat(format) {
      if (!sourceFormats.includes(format)) {
        sourceFormats.push(format);
        scanner.registerSourceFormat(format);
      }
    },
  };

  const compilerApi = {
    angularCompiler: true as const,
    getTsConfigPath: resolveTsConfigPath,
    getSourceMap: (id: string): string | undefined =>
      emittedMaps.get(vite.normalizePath(id)),
    hasEmitted: (id: string): boolean =>
      filesByPath.has(vite.normalizePath(id)),
    output,
    ready: (): Promise<void> => pending,
    componentUpdates,
    ngp,
  };

  /** Lowers a module of a source format. Returns whether its TypeScript changed. */
  async function lowerSourceModule(
    sourceFile: string,
    source: string,
    format: NgpSourceFormat,
    resolve: FastCompileResolve,
  ): Promise<boolean> {
    const programFile = `${sourceFile}.ts`;
    if (existsSync(programFile)) {
      throw new Error(
        `[@analogjs/vite-plugin-angular]: ${programFile} has the name NGP compiles ${sourceFile} as. Rename one of them.`,
      );
    }
    const removed = removals.get(programFile);
    const lowered = await format.lower(source, sourceFile, {
      scanImports: (specifiers) =>
        scanner.scanImports(specifiers, sourceFile, resolve),
      resolveSelector: (className) =>
        scanner.lookupSelector(
          className,
          sharedCtx?.componentRegistries ?? componentRegistries,
        ),
    });
    // Removed while it was lowered
    if (removals.get(programFile) !== removed) return false;
    const changed =
      sourceModules.get(programFile)?.lowered.code !== lowered.code;
    sourceModules.set(programFile, { sourceFile, source, format, lowered });
    return changed;
  }

  /** Lowers every module of the registered source formats under `root`. */
  async function lowerSourceModules(
    root: string,
    resolve: FastCompileResolve,
  ): Promise<void> {
    scanner.reset(root);
    sourceModules.clear();
    const sourceRoot = vite.normalizePath(realpathSync(root));
    await Promise.all(
      sourceFormats.map(async (format) => {
        includes.set(
          format,
          vite.createFilter(format.include, '**/node_modules/**', {
            resolve: sourceRoot,
          }),
        );
        const files = await glob(format.include, {
          cwd: sourceRoot,
          absolute: true,
          ignore: ['**/node_modules/**'],
        });
        await Promise.all(
          files.map(async (file) => {
            const sourceFile = canonicalPath(file);
            const source = await fsPromises.readFile(sourceFile, 'utf-8');
            await lowerSourceModule(sourceFile, source, format, resolve);
          }),
        );
      }),
    );
    // The analyzer reads them through `hostFs` when it's created
    analyzed.clear();
    for (const [programFile, { lowered }] of sourceModules) {
      analyzed.set(programFile, lowered.code);
    }
  }

  /**
   * Lowers the source modules a change to `file` affects again: the module
   * itself, and those that looked up selectors in it. Returns the program
   * files whose TypeScript changed.
   */
  async function relowerSourceModules(
    file: string,
    resolve: FastCompileResolve,
  ): Promise<string[]> {
    const affected = [file, ...(scanner.importersByFile.get(file) ?? [])]
      .map(programFileOf)
      .filter((programFile) => programFile !== undefined);
    scanner.invalidate(file);
    const changed = await Promise.all(
      affected.map(async (programFile) => {
        const sourceModule = sourceModules.get(programFile);
        if (!sourceModule) return [];
        const { sourceFile, format } = sourceModule;
        const source = await readSource(sourceFile);
        if (source === undefined) return [];
        const relowered = await lowerSourceModule(
          sourceFile,
          source,
          format,
          resolve,
        );
        return relowered ? [programFile] : [];
      }),
    );
    return changed.flat();
  }

  // Lowering and the analyzer updates that follow it, one change at a time, so
  // the modules a change lowers again reach the analyzer together
  let sourceWork: Promise<unknown> = Promise.resolve();
  function withSourceLock<T>(work: () => Promise<T>): Promise<T> {
    const run = sourceWork.catch(() => undefined).then(work);
    sourceWork = run;
    return run;
  }

  /** Sends the analyzer the lowered modules it doesn't have yet. */
  async function syncProgramFiles(): Promise<void> {
    const updates = [...sourceModules]
      .filter(
        ([filePath, { lowered }]) => analyzed.get(filePath) !== lowered.code,
      )
      .map(([filePath, { lowered }]) => ({ filePath, content: lowered.code }));
    if (updates.length === 0) return;
    for (const { filePath, content } of updates)
      analyzed.set(filePath, content);
    await enqueueIndex(() =>
      analyzer!.updateFileContent(
        updates.map(({ filePath, content }) => ({
          filePath: toAnalyzerPath(filePath),
          content,
        })),
      ),
    );
  }

  /** Reads a source file, or `undefined` if it was removed. */
  function readSource(file: string): Promise<string | undefined> {
    return fsPromises
      .readFile(file, 'utf-8')
      .catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return undefined;
        throw error;
      });
  }

  /** Lowers a module added after the build started, if NGP compiles it. */
  async function addSourceModule(
    sourceFile: string,
    format: NgpSourceFormat,
    source: string,
    resolve: FastCompileResolve,
  ): Promise<void> {
    const programFile = `${sourceFile}.ts`;
    await lowerSourceModule(sourceFile, source, format, resolve);
    const sourceModule = sourceModules.get(programFile);
    // Removed while it was lowered
    if (!sourceModule) return;
    // The analyzer reads it through `hostFs`
    analyzed.set(programFile, sourceModule.lowered.code);
    await enqueueIndex(() =>
      analyzer!.invalidateFiles([
        { filePath: toAnalyzerPath(programFile), updateType: FILE_CREATED },
      ]),
    );
  }

  /** Drops a removed module, and any lowering of it still in progress. */
  async function removeSourceModule(sourceFile: string): Promise<void> {
    const programFile = `${sourceFile}.ts`;
    removals.set(programFile, (removals.get(programFile) ?? 0) + 1);
    analyzed.delete(programFile);
    if (!sourceModules.delete(programFile)) return;
    await enqueueIndex(() =>
      analyzer!.invalidateFiles([
        { filePath: toAnalyzerPath(programFile), updateType: FILE_DELETED },
      ]),
    );
  }

  /**
   * Lowers a module for its transform, as fast compile does on every
   * transform, so the selectors it looks up are current. A transform that
   * started before a hot update can carry the previous code; it compiles the
   * latest lowering instead.
   */
  async function lowerForTransform(
    sourceFile: string,
    format: NgpSourceFormat,
    code: string,
    resolve: FastCompileResolve,
  ): Promise<NgpLoweredModule | undefined> {
    const programFile = `${sourceFile}.ts`;
    if (!sourceModules.has(programFile)) {
      // Requested before its `create` event, or added during `vite build --watch`
      await addSourceModule(sourceFile, format, code, resolve);
    } else if (code === (await readSource(sourceFile))) {
      await lowerSourceModule(sourceFile, code, format, resolve);
    }
    return sourceModules.get(programFile)?.lowered;
  }

  /** Maps a type error in a program file to the source module's location. */
  function toSourceLocation(location: SourceLocation): SourceLocation {
    const sourceModule = sourceModules.get(vite.normalizePath(location.file));
    const mapped = sourceModule?.lowered.toSourceLocation(
      location.line - 1,
      location.character - 1,
    );
    return mapped
      ? {
          file: sourceModule!.sourceFile,
          line: mapped.line + 1,
          character: mapped.column + 1,
        }
      : location;
  }

  sharedCtx?.registerCompiler({
    name: '@analogjs/vite-plugin-angular-ngp',
    getTsConfigPath: compilerApi.getTsConfigPath,
    getSourceMap: compilerApi.getSourceMap,
    hasEmitted: compilerApi.hasEmitted,
  });

  async function prepareResources(
    file: NgpFile,
    watch: (path: string) => void,
  ): Promise<NgpFile> {
    const hostFilePath = fromAnalyzerPath(file.filePath);
    watch(hostFilePath);
    const activeConfig = sharedCtx?.resolvedConfig ?? resolvedConfig;
    const activeStylePreprocessor =
      sharedCtx?.stylePreprocessor ?? stylePreprocessor;

    return {
      ...file,
      classes: await Promise.all(
        file.classes.map(async (metadata, classIndex) => {
          const component = metadata.component;
          if (!component) return metadata;
          if (component.templateUrl)
            watch(fromAnalyzerPath(component.templateUrl.resolvedPath));
          for (const style of component.styleUrls ?? [])
            watch(fromAnalyzerPath(style.resolvedPath));
          const preprocess = async (
            content: string,
            path: string,
            order: number,
            inline: boolean,
          ) => {
            const preprocessed = preprocessStylesheet(
              content,
              path,
              activeStylePreprocessor,
              {
                filename: path,
                containingFile: hostFilePath,
                resourceFile: inline ? undefined : path,
                className: metadata.className,
                order,
                inline,
              },
            );
            const result = await vite.preprocessCSS(
              preprocessed,
              path,
              activeConfig,
            );
            result.deps?.forEach(watch);
            return result.code;
          };
          return {
            ...metadata,
            component: {
              ...component,
              styles:
                component.styles &&
                (await Promise.all(
                  component.styles.map((style, index) =>
                    preprocess(
                      style,
                      `${hostFilePath}.inline-${classIndex}-${index}.${options.inlineStylesExtension}`,
                      index,
                      true,
                    ),
                  ),
                )),
              stylesFromUrls:
                component.stylesFromUrls &&
                (await Promise.all(
                  component.stylesFromUrls.map((style, index) =>
                    preprocess(
                      style,
                      fromAnalyzerPath(
                        component.styleUrls![index].resolvedPath,
                      ),
                      index,
                      false,
                    ),
                  ),
                )),
            },
          };
        }),
      ),
    };
  }

  async function indexChunks(update?: () => Promise<string[]>): Promise<void> {
    if (update) {
      const invalidated = await update();
      for (const filePath of invalidated) {
        output.delete(fromAnalyzerPath(filePath));
        compiler!.fileCache.delete(filePath);
      }
      chunkContexts.clear();
    } else {
      filesByPath.clear();
      chunkContexts.clear();
      output.clear();
      const angularOptions = compilerCli.readConfiguration(
        resolveTsConfigPath(),
      ).options as Record<string, unknown>;
      compiler = new api.HybridCompiler(analyzer!, {
        ...angularOptions,
        optimize: true,
        enableHmr: hmr,
        tcbConfig: api.buildTypeCheckingConfig(angularOptions),
      });
    }
    const chunks = update
      ? compiler!.analyzeOptimizedDelta()
      : compiler!.analyzeOptimized();
    for await (const chunk of chunks) {
      for (const file of chunk.files) {
        const normPath = fromAnalyzerPath(file.filePath);
        filesByPath.set(normPath, { file, chunk });
        output.delete(normPath);
        compiler!.fileCache.delete(file.filePath);
      }
      for (const removed of chunk.removedFiles ?? []) {
        const normPath = fromAnalyzerPath(removed);
        filesByPath.delete(normPath);
        output.delete(normPath);
      }
    }
  }

  function enqueueIndex(update: () => Promise<string[]>): Promise<void> {
    pending = pending.catch(() => {}).then(() => indexChunks(update));
    return pending;
  }

  function getChunkContext(chunk: NgpChunk): Promise<unknown> {
    let context = chunkContexts.get(chunk);
    if (!context) {
      context = compiler!.prepareChunk(chunk);
      chunkContexts.set(chunk, context);
    }
    return context;
  }

  async function checkTypes(
    filePath: string,
    sourceCode: string,
    tcbCode?: string | null,
  ): Promise<void> {
    typeChecker ??= new LspTypeChecker(
      resolveTsConfigPath(),
      options.typeChecker,
      {
        inMemoryFiles: () =>
          new Map(
            [...sourceModules].map(([file, { lowered }]) => [
              file,
              lowered.code,
            ]),
          ),
        mapLocation: toSourceLocation,
      },
    );
    typeChecker.queueFile(filePath, sourceCode, tcbCode);
    if (!watchMode) return;
    const typeErrors = await typeChecker.flushQueue(true);
    if (typeErrors.length) {
      throw new Error(typeErrors.join('\n'));
    }
  }

  async function processFile(
    normPath: string,
    activeCompiler: NgpCompiler,
    watch: (path: string) => void,
  ) {
    const { file: analyzed, chunk } = filesByPath.get(normPath)!;
    const [file, context, content] = await Promise.all([
      prepareResources(analyzed, (path) => {
        const key = sourceFileOf(vite.normalizePath(path));
        dependents.set(key, (dependents.get(key) ?? new Set()).add(normPath));
        watch(key);
      }),
      getChunkContext(chunk),
      analyzer!.getFileContent(analyzed.filePath),
    ]);
    sources.set(normPath, content);
    const result =
      activeCompiler.processFile.length >= 5
        ? await activeCompiler.processFile(
            file.filePath,
            content,
            undefined,
            file,
            context,
          )
        : await activeCompiler.processFile(
            file.filePath,
            content,
            file,
            context,
          );
    return { file, content, result };
  }

  function compileFile(
    normPath: string,
    watch: (path: string) => void,
  ): Promise<NgpResult> | undefined {
    if (!filesByPath.has(normPath)) return undefined;
    let task = output.get(normPath);
    if (!task) {
      task = (async () => {
        // Analyzer updates queued before this compile land first
        await pending;
        if (!filesByPath.has(normPath)) {
          throw new Error(`${sourceFileOf(normPath)} was removed.`);
        }
        const { file, content, result } = await processFile(
          normPath,
          compiler!,
          watch,
        );
        const errors = [
          ...(file.diagnostics ?? []),
          ...(result.diagnostics ?? []),
        ].filter((diagnostic) => diagnostic.category === 1);
        if (errors.length) {
          throw new Error(
            `${sourceFileOf(normPath)}: ${errors.map((error) => error.messageText).join('\n')}`,
          );
        }
        if (options.disableTypeChecking !== true) {
          await checkTypes(
            fromAnalyzerPath(file.filePath),
            content,
            result.tcb?.code,
          );
        }
        return result;
      })();
      output.set(normPath, task);
    }
    return task;
  }

  function componentNames(normPath: string): string[] {
    return (filesByPath.get(normPath)?.file.classes ?? []).flatMap(
      ({ className, component }) => (component && className ? [className] : []),
    );
  }

  // Components to update in place, following the Angular CLI's rule
  async function findComponentUpdates(
    normPath: string,
    read: () => string | Promise<string>,
  ): Promise<ComponentUpdate[]> {
    if (!TS_EXT_REGEX.test(normPath)) {
      return [...(dependents.get(normPath) ?? [])].flatMap((file) =>
        componentNames(file).map((className) => ({ file, className })),
      );
    }
    const stale = sources.get(normPath);
    if (stale === undefined) return [];
    const matchedClassNames = findHmrComponentUpdates(
      normPath,
      stale,
      await read(),
      new Set(componentNames(normPath)),
    );
    return (matchedClassNames ?? []).map((className) => ({
      file: normPath,
      className,
    }));
  }

  async function emitHmrUpdate(file: string, className: string) {
    // NGP emits only the update module of the class named by `hmrUpdateTarget`,
    // and only when it doesn't reuse the file's previously processed output
    const target = Object.assign(
      Object.create(Object.getPrototypeOf(compiler)),
      compiler,
      { hmrUpdateTarget: className, reuseProcessedFiles: false },
    );
    const { result } = await processFile(file, target, () => {});
    return (
      result.hmrUpdateModule &&
      (await transpile(result.hmrUpdateModule, file)).code
    );
  }

  async function sendComponentUpdates(
    updates: ComponentUpdate[],
    server: vite.ViteDevServer,
  ): Promise<boolean> {
    try {
      for (const file of new Set(updates.map((update) => update.file))) {
        await compileFile(file, () => {});
      }
      const codes = await Promise.all(
        updates.map(({ file, className }) => emitHmrUpdate(file, className)),
      );
      if (codes.some((code) => !code)) return false;
      updates.forEach(({ file, className }, index) => {
        // Components of a source module update through the module itself
        const sourceFile = sourceModules.get(file)?.sourceFile;
        const moduleFile = sourceFile ?? file;
        hmrUpdateCode.set(`${moduleFile}@${className}`, codes[index]!);
        componentUpdates.classNames.set(moduleFile, className);
        server.moduleGraph
          .getModulesByFile(moduleFile)
          ?.forEach((mod) => server.moduleGraph.invalidateModule(mod));
        server.ws.send('angular:component-update', {
          id: encodeURIComponent(`${moduleFile}@${className}`),
          timestamp: Date.now(),
        });
      });
      return true;
    } catch {
      // A full reload reports the compilation error
      return false;
    }
  }

  return {
    name: '@analogjs/vite-plugin-angular-ngp',
    enforce: 'pre',
    api: compilerApi,
    config(config, { command, mode }) {
      watchMode = command === 'serve';
      const isProd = isProdMode(config.mode);
      if (sharedCtx) {
        sharedCtx.initConfig(config, { command, mode });
      } else {
        configContext = {
          root: config.root || '.',
          isProd,
          isLib: !!config.build?.lib,
        };
      }
      const depOptimizer = createDepOptimizerConfig({
        tsconfig: resolveTsConfigPath(),
        isProd,
        jit: false,
        watchMode,
        isTest: options.isTest,
        isAstroIntegration: options.isAstroIntegration,
      });
      return {
        ...(isRolldown() ? { oxc: {} as any } : { esbuild: false }),
        ...depOptimizer,
      };
    },
    async configResolved(config) {
      resolvedConfig = config;
      hmr =
        watchMode &&
        options.liveReload &&
        !options.isTest &&
        config.server.hmr !== false;
      const integrations = sharedCtx
        ? await sharedCtx.resolveConfig(config)
        : await discoverAnalogIntegrations(config);
      transformFilter = integrations.transformFilter;
      componentRegistries = integrations.componentRegistries;
      stylePreprocessor = integrations.stylePreprocessor;
    },
    configureServer(server) {
      const changeTypes: Record<string, FileChangeType> = {
        add: 1,
        change: 2,
        unlink: 3,
      };
      devServer = server;
      server.watcher.on('all', (event, path) => {
        const type = changeTypes[event];
        if (type) typeChecker?.notifyFileChanged(path, type);
      });
      server.httpServer?.on('close', () => {
        typeChecker?.close();
        typeChecker = undefined;
        analyzer?.close();
        analyzer = undefined;
        compiler = undefined;
      });
    },
    // Runs on the dev server with or without HMR, and in `vite build --watch`
    async watchChange(id, { event }) {
      if (!analyzer || sourceFormats.length === 0) return;
      const file = canonicalPath(id);
      const resolve: FastCompileResolve = (spec, importer) =>
        this.resolve(spec, importer, { skipSelf: true });
      await withSourceLock(async () => {
        scanner.invalidate(file);
        const format = moduleFormatOf(file);
        if (event === 'update') {
          reloweredByChange.set(
            file,
            await relowerSourceModules(file, resolve),
          );
        } else if (event === 'delete') {
          await removeSourceModule(file);
        } else if (
          event === 'create' &&
          format &&
          !sourceModules.has(`${file}.ts`)
        ) {
          const source = await readSource(file);
          if (source !== undefined) {
            await addSourceModule(file, format, source, resolve);
          }
        }
        await syncProgramFiles();
      });
      // Modules that looked up selectors in `file` lower again when transformed
      for (const importer of scanner.importersByFile.get(file) ?? []) {
        devServer?.moduleGraph
          .getModulesByFile(importer)
          ?.forEach((mod) => devServer!.moduleGraph.invalidateModule(mod));
      }
    },
    async buildStart() {
      activeBuilds++;
      if (!analyzer) {
        const tsconfig = resolveTsConfigPath();
        const hasSourceFormats = sourceFormats.length > 0;
        const ngp = await loadNgp(tsconfig, hasSourceFormats);
        const isWasm = ngp.analyzerOptions.backend === 'wasm';
        toAnalyzerPath = isWasm ? toWasmPath : (path) => path;
        fromAnalyzerPath = isWasm ? fromWasmPath : vite.normalizePath;
        api = ngp.api;
        if (hasSourceFormats) {
          await lowerSourceModules(dirname(tsconfig), (specifier, importer) =>
            this.resolve(specifier, importer, { skipSelf: true }),
          );
        }
        analyzer = await api.createAnalyzer(toAnalyzerPath(tsconfig), {
          ...ngp.analyzerOptions,
          enableHmr: hmr,
          hostFs:
            hasSourceFormats || isWasm
              ? createNgpHostFs(
                  hasSourceFormats
                    ? (path) => sourceModules.get(path)?.lowered.code
                    : undefined,
                )
              : undefined,
        });
        pending = indexChunks();
      }
      await pending;
      for (const path of dependents.keys()) {
        this.addWatchFile(path);
      }
    },
    resolveId(id, importer) {
      return resolveAngularVirtualId(id, importer, {
        jit: false,
        resolvedConfig: sharedCtx?.resolvedConfig ?? resolvedConfig,
      });
    },
    async load(id) {
      return loadAngularVirtualModule(
        this,
        id,
        sharedCtx?.resolvedConfig ?? resolvedConfig,
      );
    },
    async transform(code, id) {
      const activeTransformFilter =
        sharedCtx?.transformFilter ?? transformFilter;
      const filePath = vite.normalizePath(id.split('?')[0]);
      const sourceFormat = scanner.sourceFormatOf(filePath);
      if (
        !(sourceFormat ? sourceFilter(id) : filter(id)) ||
        activeTransformFilter?.(code, id) === false
      ) {
        return;
      }
      await pending;
      let lowered: NgpLoweredModule | undefined;
      let compiledFile = filePath;
      if (sourceFormat) {
        const sourceFile = canonicalPath(filePath);
        const format = moduleFormatOf(sourceFile);
        if (!format) {
          this.error(
            `${filePath} is outside ${dirname(resolveTsConfigPath())}, where '${sourceFormat.name}' modules are compiled from.`,
          );
        }
        lowered = await withSourceLock(async () => {
          const result = await lowerForTransform(
            sourceFile,
            format,
            code,
            (spec, importer) =>
              this.resolve(spec, importer, { skipSelf: true }),
          );
          await syncProgramFiles();
          return result;
        });
        if (!lowered) {
          this.error(`${filePath} was removed while it was compiled.`);
        }
        if (lowered.error) {
          this.error({
            message: lowered.error.message,
            id: filePath,
            loc: lowered.error.loc && { file: filePath, ...lowered.error.loc },
          });
        }
        compiledFile = `${sourceFile}.ts`;
        // Transform the module again when a component it looked up changes
        for (const dependency of scanner.dependenciesOf(sourceFile)) {
          this.addWatchFile(dependency);
        }
      }
      const compiledCode = lowered ? lowered.code : code;
      const watch = (path: string) => this.addWatchFile(path);
      let result: NgpResult | undefined;
      try {
        result = await compileFile(compiledFile, watch);
      } catch (error) {
        // A failed compile stays cached until its file is updated, so only
        // report it if it compiled this content
        if (
          !sources.has(compiledFile) ||
          sources.get(compiledFile) === compiledCode
        ) {
          throw error;
        }
      }
      if (
        filesByPath.has(compiledFile) &&
        sources.get(compiledFile) !== compiledCode
      ) {
        if (lowered) analyzed.set(compiledFile, compiledCode);
        await enqueueIndex(() =>
          analyzer!.updateFileContent([
            {
              filePath: toAnalyzerPath(compiledFile),
              content: compiledCode,
            },
          ]),
        );
        result = await compileFile(compiledFile, watch);
      } else if (!result && lowered) {
        this.error(
          `${filePath} is not part of the TypeScript program of ${resolveTsConfigPath()}. Import it, or add it to the tsconfig's \`include\`.`,
        );
      } else if (!result && options.disableTypeChecking !== true) {
        await checkTypes(filePath, code);
      }
      let source = result?.magicString.toString() ?? code;
      if (result) {
        const analyzerFile = filesByPath.get(compiledFile)!.file.filePath;
        if (analyzerFile !== filePath) {
          // Component HMR ids name the analyzer's file; the dev server knows the module
          source = source.replaceAll(
            encodeURIComponent(`${analyzerFile}@`),
            encodeURIComponent(`${filePath}@`),
          );
        }
      }
      const map = result?.magicString.generateMap({
        source: compiledFile,
        includeContent: true,
        hires: true,
      });
      const transpiled = await transpile(source, compiledFile, map);
      const outputMap =
        lowered && transpiled.map
          ? lowered.mapToSource(JSON.stringify(transpiled.map))
          : transpiled.map;
      if (outputMap) {
        emittedMaps.set(
          filePath,
          typeof outputMap === 'string' ? outputMap : JSON.stringify(outputMap),
        );
      }
      return {
        code: transpiled.code,
        map: outputMap as vite.Rollup.SourceMapInput,
      };
    },
    async handleHotUpdate(ctx) {
      if (
        sharedCtx
          ? sharedCtx.hmr.isIgnoredFile(ctx.file)
          : isIgnoredHmrFile(ctx.file)
      ) {
        return [];
      }
      const normPath = vite.normalizePath(ctx.file);
      const sourceFile = canonicalPath(ctx.file);
      const programFile = programFileOf(sourceFile);
      const updates = await withSourceLock(async () => {
        // Lowered again in `watchChange`, which runs first
        const relowered = reloweredByChange.get(sourceFile) ?? [];
        reloweredByChange.delete(sourceFile);
        const lowered = programFile
          ? sourceModules.get(programFile)?.lowered
          : undefined;
        // In place only for a module that lowered without errors, which no
        // other module was lowered again against
        const componentUpdates =
          hmr &&
          !lowered?.error &&
          relowered.every((file) => file === programFile)
            ? await findComponentUpdates(
                programFile ?? normPath,
                lowered ? () => lowered.code : ctx.read,
              )
            : [];
        if (!programFile) {
          await enqueueIndex(() =>
            analyzer!.invalidateFiles([
              { filePath: toAnalyzerPath(ctx.file), updateType: FILE_CHANGED },
            ]),
          );
        }
        await syncProgramFiles();
        return componentUpdates;
      });
      if (updates.length && (await sendComponentUpdates(updates, ctx.server))) {
        return [];
      }
      hmrUpdateCode.clear();
      componentUpdates.classNames.clear();
      ctx.server.moduleGraph.invalidateAll();
      ctx.server.ws.send({ type: 'full-reload' });
      return [];
    },
    async buildEnd(error) {
      if (error || watchMode || !typeChecker) return;
      const typeErrors = await typeChecker.flushQueue();
      if (typeErrors.length) {
        throw new Error(typeErrors.join('\n'));
      }
    },
    async closeBundle() {
      activeBuilds = Math.max(0, activeBuilds - 1);
      if (watchMode || activeBuilds > 0) return;
      await pending.catch(() => {});
      typeChecker?.close();
      typeChecker = undefined;
      analyzer?.close();
      analyzer = undefined;
      compiler = undefined;
      filesByPath.clear();
      chunkContexts.clear();
      output.clear();
      emittedMaps.clear();
      sources.clear();
      dependents.clear();
      sourceModules.clear();
      analyzed.clear();
      releaseCssPreprocessorWorkers();
    },
  };
}

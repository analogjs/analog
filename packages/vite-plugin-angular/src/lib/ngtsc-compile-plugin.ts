import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path';
import { union } from 'es-toolkit';
import * as compilerCli from '@angular/compiler-cli';
import type { NgtscProgram } from '@angular/compiler-cli';
import type * as ts from 'typescript';
import type * as vite from 'vite';
import {
  normalizePath,
  preprocessCSS,
  type ModuleNode,
  type Plugin,
  type ResolvedConfig,
  type ViteDevServer,
} from 'vite';

import {
  createAngularBuildContext,
  isAngularBuildContext,
  type AngularBuildContext,
  type AngularBuildContextOptions,
} from './angular-build-context.js';
import {
  StyleUrlsResolver,
  TemplateUrlsResolver,
} from './component-resolvers.js';
import {
  findTemplateOwnerModules,
  getModulesForChangedFile,
  handleDirectComponentStyleHmr,
  isModuleForChangedResource,
  markModuleSelfAccepting,
} from './component-styles-plugin.js';
import { isComponentStyleSheet } from './encapsulation-plugin.js';
import {
  augmentHostWithCaching,
  augmentHostWithModuleResolution,
  augmentHostWithResources,
  augmentProgramWithVersioning,
  mergeTransformers,
} from './host.js';
import { createHotUpdateBatcher } from './hot-update-batch.js';
import type { EmitFileResult } from './models.js';
import type {
  FileReplacementSSR,
  FileReplacementWith,
} from './plugins/file-replacements.plugin.js';
import {
  describeStylesheetContent,
  injectViteIgnoreForHmrMetadata,
} from './utils/compilation-shared.js';
import { releaseCssPreprocessorWorkers } from './utils/css-preprocessor-workers.js';
import {
  activateDeferredDebug,
  debugCompiler,
  debugCompilerV,
  debugEmit,
  debugEmitV,
  debugHmr,
  debugHmrV,
  debugStyles,
} from './utils/debug.js';
import {
  createJitResourceTransformer,
  SourceFileCache,
} from './utils/devkit.js';
import { toJitInlineStyleId } from './utils/jit-inline-styles.js';
import {
  createDepOptimizerConfig,
  EXCLUDED_TS_EXT_REGEX,
  TS_EXT_REGEX,
} from './utils/plugin-config.js';
import { getJsTransformConfigKey } from './utils/rolldown.js';
import { markStylePathSafe } from './utils/safe-module-paths.js';
import type { SourceFileCache as SourceFileCacheType } from './utils/source-file-cache.js';
import { toVirtualRawId } from './utils/virtual-ids.js';
import {
  loadAngularVirtualModule,
  resolveAngularVirtualId,
} from './virtual-modules-plugin.js';

const require = createRequire(import.meta.url);

interface DeclarationFile {
  declarationFileDir: string;
  declarationPath: string;
  data: string;
}

export interface FileMetadataResult {
  errors?: string[];
  warnings?: (string | ts.DiagnosticMessageChain)[];
  hmrUpdateCode?: string | null;
  hmrEligible?: boolean;
}

export function evictDeletedFileMetadata(
  file: string,
  {
    classNamesMap,
    fileTransformMap,
  }: {
    classNamesMap: Map<string, string>;
    fileTransformMap: Map<string, string>;
  },
): void {
  const normalizedFile = normalizePath(file.split('?')[0]);
  classNamesMap.delete(normalizedFile);
  fileTransformMap.delete(normalizedFile);
}

export function createFsWatcherCacheInvalidator(
  invalidateFsCaches: () => void,
  invalidateTsconfigCaches: () => void,
  performCompilation: () => Promise<void>,
): () => Promise<void> {
  return async (): Promise<void> => {
    invalidateFsCaches();
    invalidateTsconfigCaches();
    await performCompilation();
  };
}

/**
 * Compiles Angular TypeScript sources using `@angular/compiler-cli` (`NgtscProgram`).
 */
export function ngtscCompilePlugin(
  ctxOrOptions?: AngularBuildContext | AngularBuildContextOptions,
): Plugin {
  const ctx = isAngularBuildContext(ctxOrOptions)
    ? ctxOrOptions
    : createAngularBuildContext({
        ...ctxOrOptions,
        compilationBackend: 'ngtsc',
      });

  const ts = require('typescript') as typeof import('typescript');

  let cachedBuilder:
    | ts.BuilderProgram
    | ts.EmitAndSemanticDiagnosticsBuilderProgram
    | undefined;
  let nextProgram: NgtscProgram | undefined;
  let cachedHost: ts.CompilerHost | undefined;
  let cachedHostKey: string | undefined;

  function invalidateFsCaches(): void {
    ctx.tsconfigResolver.invalidateIncludeCache();
  }

  function invalidateTsconfigCaches(): void {
    ctx.tsconfigResolver.invalidateTsconfigCaches();
    cachedHost = undefined;
    cachedHostKey = undefined;
  }

  const sourceFileCache: SourceFileCacheType = new SourceFileCache();
  const tsSourceFileCache = new Map<string, ts.SourceFile>();

  function invalidateSourceFiles(files: Set<string>): void {
    for (const file of files) {
      tsSourceFileCache.delete(normalizePath(file));
    }
    sourceFileCache.invalidate(files);
  }

  const { jit, isTest } = ctx.options;
  let viteServer: ViteDevServer | undefined;

  const styleUrlsResolver = new StyleUrlsResolver();
  const templateUrlsResolver = new TemplateUrlsResolver();
  let outputFile: ((file: string) => void) | undefined;
  const outputFiles = new Map<string, EmitFileResult>();

  const normalizeEmitterLookupId = (file: string): string => {
    const normalizedFile = normalizePath(file);

    if (!normalizedFile.startsWith('/@fs/')) {
      return normalizedFile;
    }

    const fsPath = normalizedFile
      .slice('/@fs'.length)
      .replace(/^\/([A-Za-z]:\/)/, '$1');

    return normalizePath(fsPath);
  };

  const describeEmitMarkers = (content: string) => ({
    contentLength: content.length,
    hasCmp: content.includes('ɵcmp'),
    hasFac: content.includes('ɵfac'),
    hasProv: content.includes('ɵprov'),
    hasDecorate: content.includes('__decorate'),
    hasMetadata: content.includes('__metadata'),
  });

  const fileEmitter = (file: string): EmitFileResult | undefined => {
    const normalizedFile = normalizeEmitterLookupId(file);
    const hadCachedEmit = outputFiles.has(normalizedFile);
    outputFile?.(normalizedFile);
    const emittedResult = outputFiles.get(normalizedFile);
    debugEmitV('fileEmitter lookup', {
      requestFile: file,
      normalizedFile,
      hadCachedEmit,
      hasOutputFileHook: !!outputFile,
      emitted: !!emittedResult,
      knownOutputCount: outputFiles.size,
      contentLength: emittedResult?.content?.length ?? 0,
      errorCount: emittedResult?.errors?.length ?? 0,
      warningCount: emittedResult?.warnings?.length ?? 0,
    });
    return emittedResult;
  };

  ctx.hmr.setFileEmitter((file) => fileEmitter(file));

  const compilerApi = {
    angularCompiler: true as const,
    getTsConfigPath: (): string => ctx.resolveTsConfigPath(),
    getSourceMap: (id: string): string | undefined =>
      outputFiles.get(normalizeEmitterLookupId(id))?.map,
    hasEmitted: (id: string): boolean =>
      outputFiles.has(normalizeEmitterLookupId(id)),
  };

  ctx.registerCompiler({
    name: '@analogjs/vite-plugin-angular',
    getTsConfigPath: compilerApi.getTsConfigPath,
    getSourceMap: compilerApi.getSourceMap,
    hasEmitted: compilerApi.hasEmitted,
  });

  let initialCompilation = false;
  let activeBuilds = 0;
  let closeRequested = false;
  const declarationFiles: DeclarationFile[] = [];
  const fileTransformMap = new Map<string, string>();
  let styleTransform: (
    code: string,
    filename: string,
  ) => Promise<vite.PreprocessCSSResult>;
  let pendingCompilation: Promise<void> | null = null;
  let compilationLock = Promise.resolve();
  const hotUpdates = createHotUpdateBatcher((ids) =>
    performCompilation(ctx.resolvedConfig!, ids),
  );

  function releaseCompilation(): void {
    cachedBuilder = undefined;
    nextProgram = undefined;
    cachedHost = undefined;
    cachedHostKey = undefined;
    outputFile = undefined;
    outputFiles.clear();
    fileTransformMap.clear();
    tsSourceFileCache.clear();
    sourceFileCache.clear();
    sourceFileCache.modifiedFiles.clear();
    sourceFileCache.babelFileCache?.clear();
    sourceFileCache.typeScriptFileCache?.clear();
    sourceFileCache.referencedFiles = undefined;
    ctx.tsconfigResolver.invalidateAll();
    releaseCssPreprocessorWorkers();
    ctx.styles.clear();
  }

  async function closeCompilation(): Promise<void> {
    closeRequested = false;
    hotUpdates.close();
    await compilationLock;
    declarationFiles.forEach(
      ({ declarationFileDir, declarationPath, data }) => {
        mkdirSync(declarationFileDir, { recursive: true });
        writeFileSync(declarationPath, data, 'utf-8');
      },
    );
    declarationFiles.length = 0;
    releaseCompilation();
  }

  function normalizeSourceMapSources(map: string, id: string): string {
    const sourceMap = JSON.parse(map) as {
      sources?: string[];
      sourceRoot?: string;
    };
    const sourceDirectory = dirname(id);
    const sourceRoot = sourceMap.sourceRoot ?? '';
    sourceMap.sources = sourceMap.sources?.map((source) => {
      if (isAbsolute(source) || /^[a-z][a-z\d+.-]*:/i.test(source)) {
        return normalizePath(source);
      }
      return normalizePath(resolve(sourceDirectory, sourceRoot, source));
    });
    delete sourceMap.sourceRoot;
    return JSON.stringify(sourceMap);
  }

  async function performCompilation(
    config: ResolvedConfig,
    ids?: string[],
  ): Promise<void> {
    let releaseLock: (() => unknown) | undefined;
    const previousLock = compilationLock;
    compilationLock = new Promise<void>((r) => {
      releaseLock = r;
    });
    try {
      await previousLock;
      await ctx.refreshIntegrations(config);
      await _doPerformCompilation(config, ids);
    } finally {
      releaseLock!();
    }
  }

  /**
   * This method shares mutable state and performs the actual compilation work.
   * It should not be called concurrently. Use `performCompilation` which wraps
   * this method in a lock to ensure only one compilation runs at a time.
   */
  async function _doPerformCompilation(
    config: ResolvedConfig,
    ids?: string[],
  ): Promise<void> {
    const isProd = config.mode === 'production';
    const modifiedFiles = new Set<string>(ids ?? []);
    invalidateSourceFiles(modifiedFiles);

    if (ids?.length) {
      for (const id of ids) {
        fileTransformMap.delete(id);
      }
    }

    const resolvedTsConfigPath = ctx.resolveTsConfigPath();
    const cached = ctx.tsconfigResolver.getCachedTsconfigOptions(
      resolvedTsConfigPath,
      config,
    );

    // Clone options before mutation (preserve cache purity)
    const tsCompilerOptions = { ...cached.options };
    let rootNames = [...cached.rootNames];

    if (ctx.shouldExternalizeStyles()) {
      tsCompilerOptions['externalRuntimeStyles'] = true;
    }

    if (ctx.shouldEnableLiveReload()) {
      tsCompilerOptions['_enableHmr'] = true;
      // Workaround for https://github.com/angular/angular/issues/59310
      tsCompilerOptions['supportTestBed'] = true;
    }

    debugCompiler('tsCompilerOptions (NgtscProgram path)', {
      liveReload: ctx.options.liveReload,
      viteHmr: ctx.hasViteHmrTransport(),
      externalizeStylesRequested: ctx.externalizeStylesRequested,
      shouldExternalize: ctx.shouldExternalizeStyles(),
      externalRuntimeStyles: !!tsCompilerOptions['externalRuntimeStyles'],
      hmrEnabled: !!tsCompilerOptions['_enableHmr'],
    });

    if (tsCompilerOptions['compilationMode'] === 'partial') {
      // These options can't be false in partial mode
      tsCompilerOptions['supportTestBed'] = true;
      tsCompilerOptions['supportJitMode'] = true;
    }

    if (!isTest && config.build?.lib) {
      tsCompilerOptions['declaration'] = true;
      tsCompilerOptions['declarationMap'] = ctx.watchMode;
      tsCompilerOptions['inlineSources'] = true;
    }

    if (isTest) {
      // Allow `TestBed.overrideXXX()` APIs.
      tsCompilerOptions['supportTestBed'] = true;
    }

    const replacements = ctx.options.fileReplacements.map((rp) =>
      join(
        ctx.options.workspaceRoot,
        (rp as FileReplacementSSR).ssr || (rp as FileReplacementWith).with,
      ),
    );
    // Merge + dedupe root names
    rootNames = union(
      union(rootNames, ctx.tsconfigResolver.ensureIncludeCache()),
      replacements,
    );
    const hostKey = JSON.stringify(tsCompilerOptions);
    let host: ts.CompilerHost;

    if (cachedHost && cachedHostKey === hostKey) {
      host = cachedHost;
    } else {
      host = ts.createIncrementalCompilerHost(tsCompilerOptions, {
        ...ts.sys,
        readFile(path: string, encoding?: string) {
          if (fileTransformMap.has(path)) {
            return fileTransformMap.get(path);
          }

          const file = ts.sys.readFile.call(null, path, encoding);

          if (file) {
            fileTransformMap.set(path, file);
          }

          return file;
        },
      });
      augmentHostWithModuleResolution(host, tsCompilerOptions);
      cachedHost = host;
      cachedHostKey = hostKey;

      // Only store cache if in watch mode
      if (ctx.watchMode) {
        augmentHostWithCaching(host, tsSourceFileCache);
      }
    }

    if (!jit) {
      const externalizeStyles = !!tsCompilerOptions['externalRuntimeStyles'];
      const stylesheetRegistry = ctx.styles.resetRegistry(externalizeStyles);
      debugStyles('stylesheet registry initialized (NgtscProgram path)', {
        externalizeStyles,
      });
      augmentHostWithResources(host, styleTransform, {
        inlineStylesExtension: ctx.options.inlineStylesExtension,
        isProd,
        stylesheetRegistry,
        sourceFileCache,
        stylePreprocessor: ctx.stylePreprocessor,
        logger: ctx.resolvedConfig?.logger,
      });
    }

    /**
     * Creates a new NgtscProgram to analyze/re-analyze
     * the source files and create a file emitter.
     * This is shared between an initial build and a hot update.
     */
    let typeScriptProgram: ts.Program;
    let angularCompiler: NgtscProgram['compiler'] | undefined;
    // Declaration changes can invalidate diagnostics in unchanged consumers.
    let builder:
      | ts.BuilderProgram
      | ts.EmitAndSemanticDiagnosticsBuilderProgram;
    const oldBuilder = ids?.some((id) => EXCLUDED_TS_EXT_REGEX.test(id))
      ? undefined
      : (cachedBuilder ?? ts.readBuilderProgram(tsCompilerOptions, host));

    if (!jit) {
      // Create the Angular specific program that contains the Angular compiler
      const angularProgram: NgtscProgram = new compilerCli.NgtscProgram(
        rootNames,
        tsCompilerOptions,
        host,
        nextProgram,
      );
      angularCompiler = angularProgram.compiler;
      typeScriptProgram = angularProgram.compiler.getCurrentProgram();
      augmentProgramWithVersioning(typeScriptProgram);

      builder = ts.createEmitAndSemanticDiagnosticsBuilderProgram(
        typeScriptProgram,
        host,
        oldBuilder as ts.EmitAndSemanticDiagnosticsBuilderProgram,
      );

      nextProgram = angularProgram;
    } else {
      builder = ts.createEmitAndSemanticDiagnosticsBuilderProgram(
        rootNames,
        tsCompilerOptions,
        host,
        oldBuilder as ts.EmitAndSemanticDiagnosticsBuilderProgram,
      );

      typeScriptProgram = builder.getProgram();
    }

    if (!ctx.watchMode) {
      // When not in watch mode, the startup cost of the incremental analysis can be avoided by
      // using an abstract builder that only wraps a TypeScript program.
      builder = ts.createAbstractBuilder(typeScriptProgram, host, oldBuilder);
    }
    cachedBuilder = builder;

    if (angularCompiler) {
      await angularCompiler.analyzeAsync();

      if (!ctx.options.disableTypeChecking) {
        // TypeScript builds the program diagnostics lazily and records why each
        // file is in the program as an index into `referencedFiles`, which
        // includes the shim references Angular tags onto every source file.
        // `prepareEmit()` below removes those tags, so a diagnostic that
        // explains a file (e.g. TS6059 for a file outside `rootDir`) would
        // otherwise throw while it is built for the first file's diagnostics.
        typeScriptProgram.getOptionsDiagnostics();
      }
    }

    const beforeTransformers = jit
      ? [
          compilerCli.constructorParametersDownlevelTransform(
            builder.getProgram(),
          ),
          createJitResourceTransformer(() =>
            builder.getProgram().getTypeChecker(),
          ),
        ]
      : [];

    const transformers = mergeTransformers(
      { before: beforeTransformers },
      jit ? {} : angularCompiler!.prepareEmit().transformers,
    );

    const fileMetadata = getFileMetadata(
      builder,
      angularCompiler,
      ctx.options.liveReload,
      ctx.options.disableTypeChecking,
      ctx.hmr.classNames,
    );

    const writeFileCallback: ts.WriteFileCallback = (
      _filename,
      content,
      _a,
      _b,
      sourceFiles,
    ) => {
      if (!sourceFiles?.length) {
        return;
      }

      const filename = normalizePath(sourceFiles[0].fileName);

      // Skip declaration outputs and declaration source files.
      if (
        filename.includes('ngtypecheck.ts') ||
        filename.includes('.d.') ||
        _filename.endsWith('.d.ts') ||
        _filename.endsWith('.d.mts') ||
        _filename.endsWith('.d.cts')
      ) {
        return;
      }

      // TS emits the .js.map file separately — attach it to the entry for
      // the same source file so the transform hook can return the map and
      // coverage tools can chain maps back to the original TS. The .map can
      // arrive before or after the .js, so upsert in either order. Match
      // only `.js.map` (not `.d.ts.map`) so a future `declarationMap: true`
      // doesn't clobber the JS source map with the declaration map.
      if (/\.[cm]?js\.map$/.test(_filename)) {
        const existing = outputFiles.get(filename);
        outputFiles.set(filename, {
          ...(existing ?? { dependencies: [] }),
          map: content,
        });
        return;
      }

      const metadata = ctx.watchMode ? fileMetadata(filename) : {};
      const existing = outputFiles.get(filename);

      outputFiles.set(filename, {
        ...(existing ?? {}),
        content,
        dependencies: [],
        errors: metadata.errors,
        warnings: metadata.warnings,
        hmrUpdateCode: metadata.hmrUpdateCode,
        hmrEligible: metadata.hmrEligible,
      });
      debugEmitV('registered ngtsc output', {
        filename,
        ...describeEmitMarkers(content),
        errorCount: metadata.errors?.length ?? 0,
        warningCount: metadata.warnings?.length ?? 0,
        hmrEligible: !!metadata.hmrEligible,
        knownOutputCount: outputFiles.size,
      });
    };

    const writeOutputFile = (id: string): void => {
      const sourceFile = builder.getSourceFile(id);
      if (!sourceFile) {
        return;
      }

      let content = '';
      let map: string | undefined;
      let mapFilename: string | undefined;
      builder.emit(
        sourceFile,
        (filename, data) => {
          if (/\.[cm]?js$/.test(filename)) {
            content = data;
          }

          if (/\.[cm]?js\.map$/.test(filename)) {
            map = data;
            mapFilename = filename;
          }

          if (
            !ctx.watchMode &&
            !isTest &&
            /\.d\.ts/.test(filename) &&
            !filename.includes('.ngtypecheck.')
          ) {
            // output to library root instead /src
            const declarationPath = resolve(
              config.root,
              config.build.outDir,
              relative(config.root, filename),
            ).replace('/src/', '/');

            const declarationFileDir = declarationPath
              .replace(basename(filename), '')
              .replace('/src/', '/');

            declarationFiles.push({
              declarationFileDir,
              declarationPath,
              data,
            });
          }
        },
        undefined /* cancellationToken */,
        undefined /* emitOnlyDtsFiles */,
        transformers,
      );

      writeFileCallback(id, content, false, undefined, [sourceFile]);
      if (map !== undefined && mapFilename !== undefined) {
        // Use the filename TypeScript emitted (handles `.cts`/`.mts` as well
        // as `.ts`) instead of regex-replacing the source `.ts` extension.
        writeFileCallback(mapFilename, map, false, undefined, [sourceFile]);
      }

      if (angularCompiler) {
        angularCompiler.incrementalCompilation.recordSuccessfulEmit(sourceFile);
      }
    };

    if (ctx.watchMode) {
      if (ids && ids.length > 0) {
        ids.forEach((id) => writeOutputFile(id));
      } else if (isTest) {
        /**
         * Only block the server from starting up
         * during testing.
         */
        while (
          (
            builder as ts.EmitAndSemanticDiagnosticsBuilderProgram
          ).emitNextAffectedFile(
            writeFileCallback,
            undefined,
            undefined,
            transformers,
          )
        ) {
          /* empty */
        }
      }
    }

    if (!isTest) {
      /**
       * Perf: Output files on demand so the dev server
       * isn't blocked when emitting files.
       */
      outputFile = writeOutputFile;
    }
  }

  return {
    name: '@analogjs/vite-plugin-angular',
    api: compilerApi,
    async config(config, { command, mode }) {
      activateDeferredDebug(command);
      const resolution = ctx.initConfig(config, { command, mode });

      // Do a preliminary resolution for dep optimizer (before configResolved)
      const preliminaryTsConfigPath = ctx.resolveTsConfigPath();

      const esbuild = config.esbuild ?? false;
      const oxc = config.oxc ?? false;
      const jsTransformConfigKey = getJsTransformConfigKey();
      const jsTransformConfigValue =
        jsTransformConfigKey === 'oxc' ? oxc : esbuild;

      const depOptimizer = createDepOptimizerConfig({
        tsconfig: preliminaryTsConfigPath,
        isProd: resolution.isProd,
        jit: ctx.options.jit,
        watchMode: ctx.watchMode,
        isTest: ctx.options.isTest,
        isAstroIntegration: ctx.options.isAstroIntegration,
      });

      return {
        [jsTransformConfigKey]: jsTransformConfigValue,
        ...depOptimizer,
      };
    },
    configResolved(config) {
      ctx.setResolvedConfig(config);

      if (!jit) {
        styleTransform = (code: string, filename: string) =>
          preprocessCSS(code, filename, config);
      }
    },
    configureServer(server) {
      viteServer = server;
      hotUpdates.configureServer(server);

      // Add/unlink changes the TypeScript program shape, not just file
      // contents, so we need to invalidate both include discovery and the
      // cached tsconfig root names before recompiling.
      const invalidateCompilationOnFsChange = createFsWatcherCacheInvalidator(
        invalidateFsCaches,
        invalidateTsconfigCaches,
        () => performCompilation(ctx.resolvedConfig!),
      );
      server.watcher.on('add', (file) => {
        if (EXCLUDED_TS_EXT_REGEX.test(file)) {
          invalidateSourceFiles(new Set([normalizePath(file)]));
        }
        return invalidateCompilationOnFsChange();
      });
      server.watcher.on('unlink', (file) => {
        const id = normalizePath(file);
        outputFiles.delete(id);
        tsSourceFileCache.delete(id);
        sourceFileCache.invalidate(new Set([id]));
        evictDeletedFileMetadata(file, {
          classNamesMap: ctx.hmr.classNames,
          fileTransformMap,
        });
        return invalidateCompilationOnFsChange();
      });
      server.watcher.on('change', (file) => {
        if (file.includes('tsconfig')) {
          invalidateTsconfigCaches();
        }
      });
    },
    async buildStart() {
      activeBuilds++;
      // Vite keys its CSS preprocessor worker cache by the top-level resolved
      // config object. Passing `this.environment.config` misses that cache
      // and falls back to a worker Vite never closes, which keeps Vitest
      // from exiting after AOT tests with `.scss` styleUrls. (#2556)
      if (!jit) {
        styleTransform = (code: string, filename: string) =>
          preprocessCSS(code, filename, ctx.resolvedConfig!);
      }

      // Browser mode also creates a server that may never transform TypeScript.
      if (!ctx.deferInitialCompilation) {
        pendingCompilation = performCompilation(
          (this.environment?.config as unknown as ResolvedConfig | undefined) ??
            ctx.resolvedConfig!,
        );
        await pendingCompilation;
        pendingCompilation = null;

        initialCompilation = true;
      }
    },
    async buildEnd(): Promise<void> {
      // Environments (e.g. client and ssr) build in parallel and share this
      // plugin's compilation state, so only reset after the last one ends.
      activeBuilds = Math.max(0, activeBuilds - 1);
      if (activeBuilds > 0) return;
      if (closeRequested) {
        await closeCompilation();
        return;
      }
      if (!ctx.watchMode) releaseCompilation();
    },
    async handleHotUpdate(hmrCtx) {
      if (ctx.hmr.isIgnoredFile(hmrCtx.file)) {
        debugHmr('ignored file change', { file: hmrCtx.file });
        return [];
      }

      if (TS_EXT_REGEX.test(hmrCtx.file)) {
        const [fileId] = hmrCtx.file.split('?');
        debugHmr('TS file changed', { file: hmrCtx.file, fileId });

        await hotUpdates.schedule(hmrCtx.file, [fileId]);

        if (EXCLUDED_TS_EXT_REGEX.test(fileId)) {
          // Declaration dependencies have no runtime modules for Vite to invalidate.
          hmrCtx.server.moduleGraph.invalidateAll();
          hmrCtx.server.ws.send({ type: 'full-reload', triggeredBy: fileId });
          return [];
        }

        let result: EmitFileResult | undefined;

        if (ctx.shouldEnableLiveReload()) {
          result = fileEmitter(fileId);
          debugHmr('TS file emitted', {
            fileId,
            hmrEligible: !!result?.hmrEligible,
            hasClassName: !!ctx.hmr.classNames.get(fileId),
          });
          debugHmrV('ts hmr evaluation', {
            file: hmrCtx.file,
            fileId,
            hasResult: !!result,
            hmrEligible: !!result?.hmrEligible,
            hasClassName: !!ctx.hmr.classNames.get(fileId),
            className: ctx.hmr.classNames.get(fileId),
            updateCode: result?.hmrUpdateCode
              ? describeStylesheetContent(result.hmrUpdateCode)
              : undefined,
            errors: result?.errors?.length ?? 0,
            warnings: result?.warnings?.length ?? 0,
            hint: result?.hmrEligible
              ? 'A TS-side component change, including inline template edits, produced an Angular HMR payload.'
              : 'No Angular HMR payload was emitted for this TS change; the change may not affect component template state.',
          });
        }

        if (
          ctx.shouldEnableLiveReload() &&
          result?.hmrEligible &&
          ctx.hmr.classNames.get(fileId)
        ) {
          const relativeFileId = ctx.hmr.toComponentUpdateId(fileId);

          debugHmr('sending component update', { relativeFileId });
          debugHmrV('ts hmr component update payload', {
            file: hmrCtx.file,
            fileId,
            relativeFileId,
            className: ctx.hmr.classNames.get(fileId),
          });
          ctx.hmr.sendComponentUpdate(hmrCtx.server, relativeFileId);

          return hmrCtx.modules.map((mod) => {
            if (mod.id === hmrCtx.file) {
              return markModuleSelfAccepting(mod);
            }

            return mod;
          });
        }
      }

      if (/\.(html|htm|css|less|sass|scss)$/.test(hmrCtx.file)) {
        debugHmr('resource file changed', { file: hmrCtx.file });
        fileTransformMap.delete(hmrCtx.file.split('?')[0]);
        // Angular component resources frequently enter HMR with incomplete
        // watcher context. In practice `ctx.modules` may only contain the
        // source file, only the `?direct` module, or nothing at all after a
        // TS-driven component refresh. Resolve the full live module set from
        // Vite's module graph and our stylesheet registry before deciding how
        // to hot update the resource.
        const stylesheetRegistry = ctx.styles.registry;
        const fileModules = await getModulesForChangedFile(
          hmrCtx.server,
          hmrCtx.file,
          hmrCtx.modules,
          stylesheetRegistry,
        );
        /**
         * Check to see if this was a direct request
         * for an external resource (styles, html).
         */
        const isDirect = fileModules.find(
          (mod) =>
            !!mod.id &&
            mod.id.includes('?direct') &&
            isModuleForChangedResource(mod, hmrCtx.file, stylesheetRegistry),
        );
        const isInline = fileModules.find(
          (mod) =>
            !!mod.id &&
            mod.id.includes('?inline') &&
            isModuleForChangedResource(mod, hmrCtx.file, stylesheetRegistry),
        );
        debugHmrV('resource direct/inline detection', {
          file: hmrCtx.file,
          hasDirect: !!isDirect,
          directId: isDirect?.id,
          hasInline: !!isInline,
          inlineId: isInline?.id,
        });

        if (isDirect || isInline) {
          if (ctx.shouldExternalizeStyles() && isDirect?.id && isDirect.file) {
            const isComponentStyle =
              isDirect.type === 'css' && isComponentStyleSheet(isDirect.id);
            debugHmrV('resource direct branch', {
              file: hmrCtx.file,
              directId: isDirect.id,
              directType: isDirect.type,
              shouldExternalize: ctx.shouldExternalizeStyles(),
              isComponentStyle,
            });
            if (isComponentStyle) {
              return handleDirectComponentStyleHmr({
                server: hmrCtx.server,
                file: hmrCtx.file,
                directModule: isDirect,
                fileModules,
                stylesheetRegistry,
                stylePreprocessor: ctx.stylePreprocessor,
              });
            }
          }
          return fileModules;
        }

        if (
          ctx.shouldEnableLiveReload() &&
          /\.(html|htm)$/.test(hmrCtx.file) &&
          fileModules.length === 0
        ) {
          const ownerModules = findTemplateOwnerModules(
            hmrCtx.server,
            hmrCtx.file,
          );
          debugHmrV('template owner lookup', {
            file: hmrCtx.file,
            ownerCount: ownerModules.length,
            ownerIds: ownerModules.map((mod) => mod.id),
            hint:
              ownerModules.length > 0
                ? 'The external template has candidate TS owner modules that can be recompiled for HMR.'
                : 'No TS owner modules were visible for this external template change; HMR will fall through to the generic importer path.',
          });
          if (ownerModules.length > 0) {
            const ownerIds = ownerModules
              .map((mod) => mod.id)
              .filter(Boolean) as string[];

            ownerModules.forEach((mod) =>
              hmrCtx.server.moduleGraph.invalidateModule(mod),
            );

            await hotUpdates.schedule(hmrCtx.file, ownerIds);

            const updates = ownerIds.filter((id) => ctx.hmr.classNames.get(id));
            debugHmrV('template owner recompilation result', {
              file: hmrCtx.file,
              ownerIds,
              updates,
              updateClassNames: updates.map((id) => ({
                id,
                className: ctx.hmr.classNames.get(id),
              })),
              hint:
                updates.length > 0
                  ? 'External template recompilation produced Angular component update targets.'
                  : 'External template recompilation completed, but no Angular component update targets were surfaced.',
            });
            if (updates.length > 0) {
              debugHmr('template owner module invalidation', {
                file: hmrCtx.file,
                ownerIds,
                updateCount: updates.length,
              });
              updates.forEach((updateId) => {
                ctx.hmr.sendComponentUpdate(
                  hmrCtx.server,
                  ctx.hmr.toComponentUpdateId(updateId),
                );
              });

              return ownerModules.map((mod) => markModuleSelfAccepting(mod));
            }
          }
        }

        const mods: ModuleNode[] = [];
        const updates: string[] = [];
        fileModules.forEach((mod) => {
          mod.importers.forEach((imp) => {
            hmrCtx.server.moduleGraph.invalidateModule(imp);

            if (
              ctx.shouldExternalizeStyles() &&
              imp.id &&
              ctx.hmr.classNames.get(imp.id)
            ) {
              updates.push(imp.id);
            } else {
              mods.push(imp);
            }
          });
        });
        debugHmrV('resource importer analysis', {
          file: hmrCtx.file,
          fileModuleCount: fileModules.length,
          importerCount: fileModules.reduce(
            (count, mod) => count + mod.importers.size,
            0,
          ),
          updates,
          mods: mods.map((mod) => mod.id),
        });

        if (mods.length === 0 && updates.length === 0) return mods;

        await hotUpdates.schedule(hmrCtx.file, [
          ...mods.map((mod) => mod.id as string),
          ...updates,
        ]);

        if (updates.length > 0) {
          debugHmr('resource importer component updates', {
            file: hmrCtx.file,
            updateCount: updates.length,
          });
          updates.forEach((updateId) => {
            ctx.hmr.sendComponentUpdate(
              hmrCtx.server,
              ctx.hmr.toComponentUpdateId(updateId),
            );
          });

          return fileModules.map((mod) => {
            if (mod.id === hmrCtx.file) {
              return markModuleSelfAccepting(mod);
            }

            return mod;
          });
        }

        return mods;
      }

      // clear HMR updates with a full reload
      debugHmr('full reload — unrecognized file type', { file: hmrCtx.file });
      ctx.hmr.clear();
      return hmrCtx.modules;
    },
    resolveId(id, importer) {
      const virtualId = resolveAngularVirtualId(id, importer, {
        jit,
        resolvedConfig: ctx.resolvedConfig,
      });
      if (virtualId !== undefined) {
        return virtualId;
      }

      return ctx.styles.resolveComponentStyleId(id);
    },
    async load(id) {
      const virtualModule = await loadAngularVirtualModule(
        this,
        id,
        ctx.resolvedConfig,
      );
      if (virtualModule !== undefined) {
        return virtualModule;
      }

      return ctx.styles.loadComponentStyle(id);
    },
    transform: {
      filter: {
        id: {
          include: [TS_EXT_REGEX],
          exclude: [/node_modules/, 'type=script', '@ng/component'],
        },
      },
      async handler(code, id) {
        if (ctx.transformFilter && !ctx.transformFilter(code, id)) {
          return;
        }

        // Encapsulation of component stylesheets is handled by the
        // separate '@analogjs/vite-plugin-angular:encapsulation' plugin
        // with enforce: 'post'. This ensures @tailwindcss/vite (enforce:
        // 'pre') fully resolves @apply directives — including those inside
        // :host {} — before Angular's ShadowCss rewrites selectors. (#2293)

        if (id.includes('.ts?')) {
          // Strip the query string off the ID
          // in case of a dynamically loaded file
          id = id.replace(/\?(.*)/, '');
        }

        fileTransformMap.set(id, code);

        /**
         * Re-analyze on each transform
         * for test(Vitest)
         */
        if (isTest) {
          if (ctx.deferInitialCompilation && !initialCompilation) {
            // Do full initial compilation
            pendingCompilation = performCompilation(
              (this.environment?.config as unknown as
                | ResolvedConfig
                | undefined) ?? ctx.resolvedConfig!,
            );
            initialCompilation = true;
          }

          const tsMod = viteServer?.moduleGraph.getModuleById(id);
          if (tsMod) {
            const invalidated = tsMod.lastInvalidationTimestamp;

            if (ctx.testWatchMode && invalidated) {
              pendingCompilation = performCompilation(
                (this.environment?.config as unknown as
                  | ResolvedConfig
                  | undefined) ?? ctx.resolvedConfig!,
                [id],
              );
            }
          }
        }

        const hasComponent = code.includes('@Component');
        debugCompilerV('transform', {
          id,
          codeLength: code.length,
          hasComponent,
        });
        // Resource URLs are only consumed for watch-file registration and
        // JIT rewrites, so skip resolution entirely in prod AOT builds.
        const resolveResourceUrls = hasComponent && (ctx.watchMode || jit);
        const templateUrls = resolveResourceUrls
          ? templateUrlsResolver.resolve(code, id)
          : [];
        const styleUrls = resolveResourceUrls
          ? styleUrlsResolver.resolve(code, id)
          : [];

        if (resolveResourceUrls && ctx.watchMode) {
          for (const urlSet of [...templateUrls, ...styleUrls]) {
            // `urlSet` is a string where a relative path is joined with an
            // absolute path using the `|` symbol.
            // For example: `./app.component.html|/home/projects/analog/src/app/app.component.html`.
            const [, absoluteFileUrl] = urlSet.split('|');
            this.addWatchFile(absoluteFileUrl);
          }
        }

        if (pendingCompilation) {
          await pendingCompilation;
          pendingCompilation = null;
        }
        await hotUpdates.wait();

        const typescriptResult = fileEmitter(id);
        if (!typescriptResult) {
          debugCompilerV('transform skip (file not emitted by Angular)', {
            id,
          });
          // File not in the Angular program — skip and let other plugins
          // or Vite's built-in transform handle it. Warn if it looks like
          // an Angular file that should have been compiled.
          const isAngular =
            !id.includes('@ng/component') &&
            /(Component|Directive|Pipe|Injectable|NgModule)\(/.test(code);
          debugEmit('transform emit miss', {
            id,
            normalizedId: normalizeEmitterLookupId(id),
            knownOutputCount: outputFiles.size,
            hasOutputFileHook: !!outputFile,
            isAngular,
          });

          if (isAngular) {
            this.warn(
              `[@analogjs/vite-plugin-angular]: "${id}" contains Angular decorators but is not in the TypeScript program. ` +
                `Ensure it is included in your tsconfig.`,
            );
          }

          return;
        }

        if (typescriptResult.warnings && typescriptResult.warnings.length > 0) {
          this.warn(`${typescriptResult.warnings.join('\n')}`);
        }

        if (typescriptResult.errors && typescriptResult.errors.length > 0) {
          this.error(`${typescriptResult.errors.join('\n')}`);
        }

        let data = typescriptResult.content ?? '';
        debugEmitV('transform emit hit', {
          id,
          normalizedId: normalizeEmitterLookupId(id),
          ...describeEmitMarkers(data),
          errorCount: typescriptResult.errors?.length ?? 0,
          warningCount: typescriptResult.warnings?.length ?? 0,
        });

        if (jit && data.includes('angular:jit:')) {
          // The emitted id carries the base64 of the entire stylesheet,
          // and the bundler derives chunk names from it — hash it so a
          // large inline style can't produce an over-long filename (#2459).
          data = data.replace(
            /angular:jit:style:inline;([A-Za-z0-9+/=]*)/g,
            (_match, encodedStyles) =>
              toJitInlineStyleId(encodedStyles, isTest),
          );

          // Templates use virtual ids (no extension) so Vite's asset/CSS
          // plugins don't interfere. (#2263)
          templateUrls.forEach((templateUrlSet) => {
            const [templateFile, resolvedTemplateUrl] =
              templateUrlSet.split('|');
            data = data.replace(
              `angular:jit:template:file;${templateFile}`,
              toVirtualRawId(resolvedTemplateUrl),
            );
          });

          // External styles use native ?inline imports. We mark each
          // path as safe in Vite's safeModulePaths so the Denied ID
          // security check passes, and Vite's CSS pipeline handles
          // preprocessing, test.css, and browser/node differences
          // natively. (#2263, #2310)
          styleUrls.forEach((styleUrlSet) => {
            const [styleFile, resolvedStyleUrl] = styleUrlSet.split('|');
            markStylePathSafe(ctx.resolvedConfig, resolvedStyleUrl);
            data = data.replace(
              `angular:jit:style:file;${styleFile}`,
              resolvedStyleUrl + '?inline',
            );
          });
        }

        // Angular's HMR initializer emits dynamic import() calls that Vite's
        // import-analysis plugin cannot statically analyze, producing SSR
        // warnings.  The Angular compiler's IR includes a @vite-ignore comment
        // but it can be lost during TypeScript emit.  Re-inject it here so the
        // warning is suppressed regardless of the compilation path used.
        if (data.includes('HmrLoad')) {
          const hasMetaUrl = data.includes('getReplaceMetadataURL');
          debugHmrV('vite-ignore injection', {
            id,
            dataLength: data.length,
            hasMetaUrl,
          });
          if (hasMetaUrl) {
            const patched = injectViteIgnoreForHmrMetadata(data);
            if (patched !== data && !patched.includes('@vite-ignore')) {
              debugHmrV('vite-ignore regex fallback', { id });
            }
            data = patched;
          }
        }
        if (typescriptResult.map) {
          // TS emits `//# sourceMappingURL=foo.js.map` at the end of the
          // .js content, but the .map file isn't served by Vite — we
          // return the map object directly. Strip the stale reference so
          // downstream tools don't see two sourceMappingURL comments.
          data = data.replace(/\s*\/\/# sourceMappingURL=[^\r\n]*\s*$/, '');
        }

        return {
          code: data,
          map: typescriptResult.map
            ? normalizeSourceMapSources(typescriptResult.map, id)
            : null,
        };
      },
    },
    async closeBundle(): Promise<void> {
      closeRequested = true;
      if (activeBuilds === 0) {
        await closeCompilation();
      }
    },
  };
}

/**
 * @internal
 */
export function getFileMetadata(
  program: ts.BuilderProgram,
  angularCompiler?: NgtscProgram['compiler'],
  hmrEnabled?: boolean,
  disableTypeChecking?: boolean,
  classNamesMap: Map<string, string> = new Map(),
): (file: string) => FileMetadataResult {
  const ts = require('typescript') as typeof import('typescript');
  return (file: string): FileMetadataResult => {
    const sourceFile = program.getSourceFile(file);
    if (!sourceFile) {
      return {};
    }

    const diagnostics = getDiagnosticsForSourceFile(
      sourceFile,
      !!disableTypeChecking,
      program,
      angularCompiler,
    );

    const errors = diagnostics
      .filter((d) => d.category === ts.DiagnosticCategory?.Error)
      .map((d) =>
        typeof d.messageText === 'object'
          ? d.messageText.messageText
          : d.messageText,
      );

    const warnings = diagnostics
      .filter((d) => d.category === ts.DiagnosticCategory?.Warning)
      .map((d) => d.messageText);

    let hmrUpdateCode: string | null | undefined = undefined;

    let hmrEligible = false;
    if (hmrEnabled) {
      for (const node of sourceFile.statements) {
        if (ts.isClassDeclaration(node) && node.name != null) {
          hmrUpdateCode = angularCompiler?.emitHmrUpdateModule(node);
          if (hmrUpdateCode) {
            const className = node.name.getText();
            classNamesMap.set(file, className);
            hmrEligible = true;
            debugHmr('NgtscProgram emitHmrUpdateModule', { file, className });
          }
        }
      }
    }

    return { errors, warnings, hmrUpdateCode, hmrEligible };
  };
}

function getDiagnosticsForSourceFile(
  sourceFile: ts.SourceFile,
  disableTypeChecking: boolean,
  program: ts.BuilderProgram,
  angularCompiler?: NgtscProgram['compiler'],
): readonly ts.Diagnostic[] {
  const syntacticDiagnostics = program.getSyntacticDiagnostics(sourceFile);

  if (disableTypeChecking) {
    // Syntax errors are cheap to compute and the app will not run if there are any
    // So always show these types of errors regardless if type checking is disabled
    return syntacticDiagnostics;
  }

  const semanticDiagnostics = program.getSemanticDiagnostics(sourceFile);
  const angularDiagnostics = angularCompiler
    ? angularCompiler.getDiagnosticsForFile(sourceFile, 1)
    : [];
  return [
    ...syntacticDiagnostics,
    ...semanticDiagnostics,
    ...angularDiagnostics,
  ];
}

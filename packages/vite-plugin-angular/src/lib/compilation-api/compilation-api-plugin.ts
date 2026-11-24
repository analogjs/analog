import { type createAngularCompilation as createAngularCompilationType } from '@angular/build/private';
import { union } from 'es-toolkit';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, isAbsolute, join, resolve } from 'node:path';
import {
  normalizePath,
  type Plugin,
  type ResolvedConfig,
  type ViteDevServer,
} from 'vite';

import {
  createAngularBuildContext,
  isAngularBuildContext,
  type AngularBuildContext,
  type AngularBuildContextOptions,
} from '../angular-build-context.js';
import { composeWithCompanions } from '../companion-plugins.js';
import { markModuleSelfAccepting } from '../component-styles-plugin.js';
import { createHotUpdateBatcher } from '../hot-update-batch.js';
import type { EmitFileResult } from '../models.js';
import { type FileReplacement } from '../plugins/file-replacements.plugin.js';
import { normalizeStylesheetDependencies } from '../style-preprocessor.js';
import {
  preprocessStylesheetResult,
  rewriteRelativeCssImports,
} from '../stylesheet-registry.js';
import {
  DiagnosticModes,
  injectViteIgnoreForHmrMetadata,
  mapTemplateUpdatesToFiles,
  toAngularCompilationFileReplacements,
} from '../utils/compilation-shared.js';
import {
  activateDeferredDebug,
  debugCompilationApi,
  debugCompiler,
  debugEmit,
  debugHmr,
  debugStyles,
  type DebugOption,
} from '../utils/debug.js';
import {
  angularFullVersion,
  createAngularCompilation,
  SourceFileCache,
} from '../utils/devkit.js';
import {
  createDepOptimizerConfig,
  TS_EXT_REGEX,
} from '../utils/plugin-config.js';
import type { SourceFileCache as SourceFileCacheType } from '../utils/source-file-cache.js';
import {
  loadAngularVirtualModule,
  resolveAngularVirtualId,
} from '../virtual-modules-plugin.js';

const require = createRequire(import.meta.url);

/**
 * @experimental The Angular Compilation API plugin may change in future releases.
 */
export interface AngularCompilationPluginOptions {
  tsconfig?: string | (() => string);
  workspaceRoot?: string;
  inlineStylesExtension?: string;
  jit?: boolean;
  liveReload?: boolean;
  disableTypeChecking?: boolean;
  supportedBrowsers?: string[];
  fileReplacements?: FileReplacement[];
  include?: string[];
  debug?: DebugOption;
}

function assertSupportedCompilationApi(): void {
  if (
    angularFullVersion < 200100 ||
    typeof createAngularCompilation !== 'function'
  ) {
    throw new Error(
      '[@analogjs/vite-plugin-angular]: angularCompilationPlugin requires Angular v20.1 or later and a matching @angular/build package with the Compilation API.',
    );
  }
}

/**
 * Single-responsibility compiler plugin backed by Angular's `@angular/build`
 * Compilation API. Can be composed with custom pipelines via `AngularBuildContext`
 * or mounted with default companions via `angularCompilationPlugin()`.
 *
 * @experimental This plugin may change in future releases.
 */
export function compilationApiPlugin(
  ctxOrOptions?:
    | AngularBuildContext
    | AngularCompilationPluginOptions
    | AngularBuildContextOptions,
): Plugin {
  assertSupportedCompilationApi();

  const ctx = isAngularBuildContext(ctxOrOptions)
    ? ctxOrOptions
    : createAngularBuildContext({
        ...ctxOrOptions,
        compilationBackend: 'compilation-api',
      });

  const ts = require('typescript') as typeof import('typescript');
  const { isTest } = ctx.options;

  // Persistent compilation instance — kept alive across rebuilds so Angular
  // can diff prior state and emit `templateUpdates` for HMR.
  let angularCompilation:
    | Awaited<ReturnType<typeof createAngularCompilationType>>
    | undefined;
  const sourceFileCache: SourceFileCacheType = new SourceFileCache();
  const outputFiles = new Map<string, EmitFileResult>();
  let compilationLock = Promise.resolve();
  let pendingCompilation: Promise<void> | null = null;
  let initialCompilation = false;
  let viteServer: ViteDevServer | undefined;
  const hotUpdates = createHotUpdateBatcher((ids) =>
    performCompilation(ctx.resolvedConfig!, ids),
  );

  function resolveCompilationApiTsConfigPath(
    resolvedTsConfigPath: string,
    config: ResolvedConfig,
  ): string {
    const includedFiles = ctx.tsconfigResolver.ensureIncludeCache();
    const cached = ctx.tsconfigResolver.getCachedTsconfigOptions(
      resolvedTsConfigPath,
      config,
    );
    const expandedGraphRoots =
      ctx.tsconfigResolver.collectExpandedTsconfigRoots(
        resolvedTsConfigPath,
        config,
      );
    const mergedRootNames = union(
      union(cached.rootNames, expandedGraphRoots),
      includedFiles,
    ).map((file) => normalizePath(file));

    if (mergedRootNames.length === cached.rootNames.length) {
      return resolvedTsConfigPath;
    }

    const resolvedCacheDir = isAbsolute(config.cacheDir)
      ? config.cacheDir
      : resolve(config.root, config.cacheDir);
    const wrapperDir = join(
      resolvedCacheDir,
      'analog-angular',
      'compilation-api',
    );
    const rawTsconfig = (ts.readConfigFile(
      resolvedTsConfigPath,
      ts.sys.readFile,
    ).config ?? {}) as { references?: unknown[] };
    const wrapperPayload = {
      extends: normalizePath(resolvedTsConfigPath),
      files: [...mergedRootNames].sort(),
      ...(rawTsconfig.references ? { references: rawTsconfig.references } : {}),
    };
    const wrapperHash = createHash('sha1')
      .update(JSON.stringify(wrapperPayload))
      .digest('hex')
      .slice(0, 12);
    const wrapperPath = join(
      wrapperDir,
      `tsconfig.includes.${wrapperHash}.json`,
    );

    mkdirSync(wrapperDir, { recursive: true });
    if (!existsSync(wrapperPath)) {
      writeFileSync(
        wrapperPath,
        `${JSON.stringify(wrapperPayload, null, 2)}\n`,
        'utf-8',
      );
    }

    debugCompilationApi('generated include wrapper tsconfig', {
      originalTsconfig: resolvedTsConfigPath,
      wrapperTsconfig: wrapperPath,
      includeCount: includedFiles.length,
      rootNameCount: mergedRootNames.length,
    });

    return wrapperPath;
  }

  const normalizeEmitterLookupId = (file: string): string => {
    const normalizedFile = normalizePath(file);
    if (!normalizedFile.startsWith('/@fs/')) return normalizedFile;
    const fsPath = normalizedFile
      .slice('/@fs'.length)
      .replace(/^\/([A-Za-z]:\/)/, '$1');
    return normalizePath(fsPath);
  };

  let outputFile: ((file: string) => void) | undefined;
  const fileEmitter = (file: string): EmitFileResult | undefined => {
    const normalizedFile = normalizeEmitterLookupId(file);
    outputFile?.(normalizedFile);
    return outputFiles.get(normalizedFile);
  };

  ctx.hmr.setFileEmitter((file) => fileEmitter(file));

  const compilerApi = {
    angularCompiler: true as const,
    getTsConfigPath: (): string => ctx.resolveTsConfigPath(),
    getSourceMap: (id: string): string | undefined =>
      outputFiles.get(normalizePath(id))?.map,
    hasEmitted: (id: string): boolean =>
      outputFiles.has(normalizeEmitterLookupId(id)),
  };

  ctx.registerCompiler({
    name: '@analogjs/vite-plugin-angular-compilation-api',
    getTsConfigPath: compilerApi.getTsConfigPath,
    getSourceMap: compilerApi.getSourceMap,
    hasEmitted: compilerApi.hasEmitted,
  });

  async function performAngularCompilation(
    config: ResolvedConfig,
    ids?: string[],
  ): Promise<void> {
    const stylesheetRegistry = ctx.styles.ensureRegistry();
    const compilation = (angularCompilation ??= await (
      createAngularCompilation as typeof createAngularCompilationType
    )(!!ctx.options.jit, false));
    const modifiedFiles = ids?.length
      ? new Set(ids.map((file) => normalizePath(file)))
      : undefined;
    if (modifiedFiles?.size) {
      sourceFileCache.invalidate(modifiedFiles);
    }
    if (modifiedFiles?.size && compilation.update) {
      debugCompilationApi('incremental update', {
        files: [...modifiedFiles],
      });
      await compilation.update(modifiedFiles);
    }

    const resolvedTsConfigPath = ctx.resolveTsConfigPath();
    const compilationApiTsConfigPath = resolveCompilationApiTsConfigPath(
      resolvedTsConfigPath,
      config,
    );
    debugEmit('compilation initialize', {
      resolvedTsConfigPath,
      compilationApiTsConfigPath,
      modifiedFileCount: modifiedFiles?.size ?? 0,
    });
    const transformCompilerOptions = (
      tsCompilerOptions: Record<string, unknown>,
    ) => {
      if (ctx.shouldExternalizeStyles()) {
        tsCompilerOptions['externalRuntimeStyles'] = true;
      }

      if (ctx.shouldEnableLiveReload()) {
        tsCompilerOptions['_enableHmr'] = true;
        tsCompilerOptions['supportTestBed'] = true;
      }

      debugCompiler('tsCompilerOptions (compilation API)', {
        liveReload: ctx.options.liveReload,
        viteHmr: ctx.hasViteHmrTransport(),
        externalizeStylesRequested: ctx.externalizeStylesRequested,
        watchMode: ctx.watchMode,
        shouldExternalize: ctx.shouldExternalizeStyles(),
        externalRuntimeStyles: !!tsCompilerOptions['externalRuntimeStyles'],
        hmrEnabled: !!tsCompilerOptions['_enableHmr'],
      });

      if (tsCompilerOptions['compilationMode'] === 'partial') {
        tsCompilerOptions['supportTestBed'] = true;
        tsCompilerOptions['supportJitMode'] = true;
      }

      if (!isTest && config.build?.lib) {
        tsCompilerOptions['declaration'] = true;
        tsCompilerOptions['declarationMap'] = ctx.watchMode;
        tsCompilerOptions['inlineSources'] = true;
      }

      if (isTest) {
        tsCompilerOptions['supportTestBed'] = true;
      }

      return tsCompilerOptions;
    };
    const compilationResult = await compilation.initialize(
      compilationApiTsConfigPath,
      {
        fileReplacements: toAngularCompilationFileReplacements(
          ctx.options.fileReplacements,
          ctx.options.workspaceRoot,
        ),
        modifiedFiles,
        async transformStylesheet(
          data: string,
          containingFile: string,
          resourceFile?: string | null,
          order?: number,
          className?: string | null,
        ) {
          if (ctx.shouldEnableLiveReload() && className && containingFile) {
            ctx.hmr.classNames.set(normalizePath(containingFile), className);
          }

          const result = await ctx.styles.transformStylesheet({
            data,
            containingFile,
            resourceFile,
            order,
            className,
            readMissingResource: true,
            logger: config.logger,
          });

          return result?.content || '';
        },
        processWebWorker(workerFile: string) {
          return workerFile;
        },
      },
      angularFullVersion >= 220200
        ? {
            enableHmr: ctx.shouldEnableLiveReload(),
            externalRuntimeStyles: ctx.shouldExternalizeStyles(),
            includeTestMetadata: isTest || ctx.shouldEnableLiveReload(),
            instrumentForCoverage: !isTest,
          }
        : (transformCompilerOptions as unknown as Parameters<
            typeof compilation.initialize
          >[2]),
    );

    // Preprocess external stylesheets for Tailwind CSS @reference
    debugStyles('external stylesheets from compilation API', {
      count: compilationResult.externalStylesheets?.size ?? 0,
      hasPreprocessor: !!ctx.stylePreprocessor,
      hasInlineMap: !!stylesheetRegistry,
    });
    const preprocessStats = { total: 0, injected: 0, skipped: 0, errors: 0 };
    for (const [key, value] of compilationResult.externalStylesheets ?? []) {
      preprocessStats.total++;
      const angularHash = `${value}.css`;
      stylesheetRegistry.registerExternalRequest(angularHash, key);

      if (ctx.stylePreprocessor && existsSync(key)) {
        try {
          const rawCss = readFileSync(key, 'utf-8');
          const preprocessed = preprocessStylesheetResult(
            rawCss,
            key,
            ctx.stylePreprocessor,
          );
          const servedCss = rewriteRelativeCssImports(preprocessed.code, key);
          stylesheetRegistry.registerServedStylesheet(
            {
              publicId: angularHash,
              sourcePath: key,
              originalCode: rawCss,
              normalizedCode: servedCss,
              dependencies: normalizeStylesheetDependencies(
                preprocessed.dependencies,
              ),
              diagnostics: preprocessed.diagnostics,
              tags: preprocessed.tags,
            },
            [key, normalizePath(key), basename(key), key.replace(/^\//, '')],
          );

          if (servedCss && servedCss !== rawCss) {
            preprocessStats.injected++;
          } else {
            preprocessStats.skipped++;
          }
        } catch (e) {
          preprocessStats.errors++;
          console.warn(
            `[@analogjs/vite-plugin-angular] failed to preprocess external stylesheet: ${key}: ${e}`,
          );
        }
      } else {
        preprocessStats.skipped++;
      }
    }
    debugStyles('external stylesheet preprocessing complete', preprocessStats);

    const diagnostics = await compilation.diagnoseFiles(
      ctx.options.disableTypeChecking
        ? DiagnosticModes.All & ~DiagnosticModes.Semantic
        : DiagnosticModes.All,
    );

    const errors = diagnostics.errors?.length ? diagnostics.errors : [];
    const warnings = diagnostics.warnings?.length ? diagnostics.warnings : [];

    const templateUpdates = mapTemplateUpdatesToFiles(
      compilationResult.templateUpdates,
    );
    if (templateUpdates.size > 0) {
      debugHmr('compilation API template updates', {
        count: templateUpdates.size,
        files: [...templateUpdates.keys()],
      });
    }

    const affectedFiles = Array.from(await compilation.emitAffectedFiles());
    debugEmit('emitAffectedFiles summary', {
      count: affectedFiles.length,
      templateUpdateCount: templateUpdates.size,
      knownOutputCountBefore: outputFiles.size,
    });

    for (const file of affectedFiles) {
      const normalizedFilename = normalizePath(file.filename);
      const templateUpdate = templateUpdates.get(normalizedFilename);

      if (templateUpdate) {
        ctx.hmr.classNames.set(normalizedFilename, templateUpdate.className);
      }

      outputFiles.set(normalizedFilename, {
        content: file.contents,
        dependencies: [],
        errors: errors.map((error: { text?: string }) => error.text || ''),
        warnings: warnings.map(
          (warning: { text?: string }) => warning.text || '',
        ),
        hmrUpdateCode: templateUpdate?.code,
        hmrEligible: !!templateUpdate?.code,
      });
    }

    // Free the compilation before chunks render; `transform` still reads `outputFiles`.
    if (!ctx.watchMode && !isTest) {
      await compilation.close?.();
      angularCompilation = undefined;
    }
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
      await performAngularCompilation(config, ids);
    } finally {
      releaseLock!();
    }
  }

  return {
    name: '@analogjs/vite-plugin-angular-compilation-api',
    api: compilerApi,
    enforce: 'pre' as const,
    async config(config, { command, mode }) {
      activateDeferredDebug(command);
      const resolution = ctx.initConfig(config, { command, mode });

      debugCompilationApi('enabled (Angular %s)', angularFullVersion);

      // Angular Compilation API handles TypeScript transforms — disable
      // esbuild/oxc so they don't compete.
      debugCompilationApi('esbuild/oxc disabled, Angular handles transforms');

      // The compilation API owns user-source transforms, but deps
      // optimization still bundles partial-compiled Angular libs from
      // node_modules (`ɵɵngDeclareInjectable/Factory`). Without the
      // linker plugin, those declarations reach the browser unprocessed
      // and Angular tries to JIT-compile them at runtime. Use the shared
      // `createDepOptimizerConfig` helper so the linker runs with identical
      // test/astro/cache arguments under both rolldown and esbuild.
      const preliminaryTsConfigPath = ctx.resolveTsConfigPath();
      const depOptimizer = createDepOptimizerConfig({
        tsconfig: preliminaryTsConfigPath,
        isProd: resolution.isProd,
        jit: ctx.options.jit,
        watchMode: ctx.watchMode,
        isTest: ctx.options.isTest,
        isAstroIntegration: ctx.options.isAstroIntegration,
      });

      return {
        esbuild: undefined,
        oxc: undefined,
        ...depOptimizer,
      };
    },
    async configResolved(config) {
      await ctx.resolveConfig(config);
      ctx.styles.resetRegistry(true);
      debugStyles('stylesheet registry initialized (Angular Compilation API)');
    },
    configureServer(server) {
      viteServer = server;
      hotUpdates.configureServer(server);

      const invalidateCompilation = async (): Promise<void> => {
        ctx.tsconfigResolver.invalidateAll();
        await performCompilation(ctx.resolvedConfig!);
      };
      server.watcher.on('add', invalidateCompilation);
      server.watcher.on('unlink', invalidateCompilation);
      server.watcher.on('change', (file) => {
        if (file.includes('tsconfig')) {
          ctx.tsconfigResolver.invalidateTsconfigCaches();
        }
      });
    },
    async buildStart() {
      if (!ctx.deferInitialCompilation) {
        pendingCompilation = performCompilation(ctx.resolvedConfig!);
        await pendingCompilation;
        pendingCompilation = null;
        initialCompilation = true;
      }
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

        let result: EmitFileResult | undefined;

        if (ctx.shouldEnableLiveReload()) {
          result = fileEmitter(fileId);
          debugHmr('TS file emitted', {
            fileId,
            hmrEligible: !!result?.hmrEligible,
            hasClassName: !!ctx.hmr.classNames.get(fileId),
          });
        }

        if (
          ctx.shouldEnableLiveReload() &&
          result?.hmrEligible &&
          ctx.hmr.classNames.get(fileId)
        ) {
          const relativeFileId = ctx.hmr.toComponentUpdateId(fileId);

          debugHmr('sending component update', { relativeFileId });
          ctx.hmr.sendComponentUpdate(hmrCtx.server, relativeFileId);

          return hmrCtx.modules.map((mod) => {
            if (mod.id === hmrCtx.file) {
              return markModuleSelfAccepting(mod);
            }
            return mod;
          });
        }
      }

      if (/\.(html|htm)$/.test(hmrCtx.file)) {
        debugHmr('template file changed', { file: hmrCtx.file });
        // Recompile to pick up template changes
        pendingCompilation = performCompilation(ctx.resolvedConfig!);
      }

      if (/\.(css|less|sass|scss)$/.test(hmrCtx.file)) {
        debugHmr('stylesheet file changed', { file: hmrCtx.file });
        ctx.styles.refreshForFile(hmrCtx.file);
      }

      return hmrCtx.modules;
    },
    resolveId(id, importer) {
      const virtualId = resolveAngularVirtualId(id, importer, {
        jit: ctx.options.jit,
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
          exclude: [
            /node_modules/,
            'type=script',
            '@ng/component',
            /[?&]raw\b/,
          ],
        },
      },
      async handler(code, id) {
        if (/[?&]raw\b/.test(id)) return;
        if (ctx.transformFilter && !ctx.transformFilter(code, id)) {
          return;
        }

        // Angular emits every file in the program, not only files with
        // Angular decorators, and `@analogjs/platform` excludes `.ts` from
        // Vite's own transform. So serve Angular's output for any emitted
        // file; only the "not emitted" warning below is decorator-specific.
        const isAngular =
          /(Component|Directive|Pipe|Injectable|NgModule)\(/.test(code);

        if (id.includes('.ts?')) {
          id = id.replace(/\?(.*)/, '');
        }

        if (isTest) {
          if (ctx.deferInitialCompilation && !initialCompilation) {
            pendingCompilation = performCompilation(ctx.resolvedConfig!);
            initialCompilation = true;
          }

          const tsMod = viteServer?.moduleGraph.getModuleById(id);
          if (tsMod) {
            const invalidated = tsMod.lastInvalidationTimestamp;
            if (ctx.testWatchMode && invalidated) {
              pendingCompilation = performCompilation(ctx.resolvedConfig!, [
                id,
              ]);
            }
          }
        }

        if (pendingCompilation) {
          await pendingCompilation;
          pendingCompilation = null;
        }
        await hotUpdates.wait();

        const typescriptResult = fileEmitter(id);
        if (!typescriptResult) {
          debugCompilationApi('transform skip (file not emitted)', { id });
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

        // Re-inject @vite-ignore for Angular HMR dynamic imports
        if (data.includes('HmrLoad')) {
          const hasMetaUrl = data.includes('getReplaceMetadataURL');
          if (hasMetaUrl) {
            data = injectViteIgnoreForHmrMetadata(data);
          }
        }

        return {
          code: data,
          map: null,
        };
      },
    },
    async closeBundle() {
      hotUpdates.close();
      await compilationLock;
      await angularCompilation?.close?.();
      angularCompilation = undefined;
      outputFiles.clear();
      ctx.hmr.clear();
      sourceFileCache.clear();
      ctx.tsconfigResolver.invalidateAll();
      ctx.styles.clear();
      pendingCompilation = null;
      initialCompilation = false;
    },
  };
}

/**
 * Compiles Angular applications using Angular's private Compilation API.
 *
 * @experimental This plugin may change in future releases.
 */
export function angularCompilationPlugin(
  options: AngularCompilationPluginOptions = {},
): Plugin[] {
  assertSupportedCompilationApi();
  const ctx = createAngularBuildContext({
    ...options,
    compilationBackend: 'compilation-api',
  });
  return composeWithCompanions(ctx, compilationApiPlugin(ctx));
}

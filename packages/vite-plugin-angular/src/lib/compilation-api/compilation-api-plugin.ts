import { type createAngularCompilation as createAngularCompilationType } from '@angular/build/private';
import { union } from 'es-toolkit';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import { createRequire } from 'node:module';
import {
  normalizePath,
  Plugin,
  preprocessCSS,
  ResolvedConfig,
  ViteDevServer,
} from 'vite';

import {
  createAngularCompilation,
  SourceFileCache,
  angularFullVersion,
} from '../utils/devkit.js';
import {
  activateDeferredDebug,
  debugCompilationApi,
  debugCompiler,
  debugEmit,
  debugHmr,
  debugHmrV,
  debugStyles,
  type DebugOption,
} from '../utils/debug.js';
import {
  getTsConfigPath,
  TS_EXT_REGEX,
  type TsConfigResolutionContext,
} from '../utils/plugin-config.js';
import { TsconfigResolver } from '../utils/tsconfig-resolver.js';
import { isTailwindReferenceError } from '../utils/tailwind-reference.js';
import {
  AnalogStylesheetRegistry,
  preprocessStylesheetResult,
  registerStylesheetContent,
  rewriteRelativeCssImports,
} from '../stylesheet-registry.js';
import { normalizeStylesheetDependencies } from '../style-preprocessor.js';
import type { StylePreprocessor } from '../style-preprocessor.js';
import {
  AngularStylePipelineOptions,
  configureStylePipelineRegistry,
} from '../style-pipeline.js';
import { type FileReplacement } from '../plugins/file-replacements.plugin.js';
import type { EmitFileResult } from '../models.js';
import type { SourceFileCache as SourceFileCacheType } from '../utils/source-file-cache.js';
import {
  injectViteIgnoreForHmrMetadata,
  isIgnoredHmrFile,
  toAngularCompilationFileReplacements,
  mapTemplateUpdatesToFiles,
  refreshStylesheetRegistryForFile,
  DiagnosticModes,
  isTestWatchMode,
} from '../utils/compilation-shared.js';

const require = createRequire(import.meta.url);
const ts = require('typescript');

export interface CompilationAPIPluginOptions {
  tsconfigGetter: () => string;
  workspaceRoot: string;
  inlineStylesExtension: string;
  jit: boolean;
  liveReload: boolean;
  disableTypeChecking: boolean;
  supportedBrowsers: string[];
  transformFilter?: (code: string, id: string) => boolean;
  fileReplacements: FileReplacement[];
  stylePreprocessor?: StylePreprocessor;
  stylePipeline?: AngularStylePipelineOptions;
  hasTailwindCss: boolean;
  tailwindCss?: {
    rootStylesheet: string;
    prefixes?: string[];
  };
  isTest: boolean;
  isAstroIntegration: boolean;
  include: string[];
  additionalContentDirs: string[];
  debug?: DebugOption;
}

export function compilationAPIPlugin(
  pluginOptions: CompilationAPIPluginOptions,
): Plugin {
  let resolvedConfig: ResolvedConfig;
  let tsConfigResolutionContext: TsConfigResolutionContext | null = null;
  let watchMode = false;

  // Persistent compilation instance — kept alive across rebuilds so Angular
  // can diff prior state and emit `templateUpdates` for HMR.
  let angularCompilation:
    | Awaited<ReturnType<typeof createAngularCompilationType>>
    | undefined;
  const sourceFileCache: SourceFileCacheType = new SourceFileCache();
  const outputFiles = new Map<string, EmitFileResult>();
  const classNames = new Map<string, string>();
  let stylesheetRegistry: AnalogStylesheetRegistry | undefined;
  let compilationLock = Promise.resolve();
  let pendingCompilation: Promise<void> | null = null;
  let initialCompilation = false;
  let compilationDiagnostics: { errors: string[]; warnings: string[] } = {
    errors: [],
    warnings: [],
  };
  let diagnosticsEmitted = false;
  let viteServer: ViteDevServer | undefined;

  const isTest = process.env['NODE_ENV'] === 'test' || !!process.env['VITEST'];
  const tsconfigResolver = new TsconfigResolver({
    workspaceRoot: pluginOptions.workspaceRoot,
    include: pluginOptions.include,
    liveReload: pluginOptions.liveReload,
    hasTailwindCss: pluginOptions.hasTailwindCss,
    isTest,
  });
  const isVitestVscode = !!process.env['VITEST_VSCODE'];
  let testWatchMode = isTestWatchMode();

  function hasViteHmrTransport(): boolean {
    return resolvedConfig ? resolvedConfig.server.hmr !== false : true;
  }

  function shouldEnableLiveReload(): boolean {
    const effectiveWatchMode = isTest ? testWatchMode : watchMode;
    return !!(
      effectiveWatchMode &&
      pluginOptions.liveReload &&
      hasViteHmrTransport()
    );
  }

  function shouldExternalizeStyles(): boolean {
    const effectiveWatchMode = isTest ? testWatchMode : watchMode;
    if (!effectiveWatchMode) return false;
    return !!(shouldEnableLiveReload() || pluginOptions.hasTailwindCss);
  }

  function resolveTsConfigPath() {
    const tsconfigValue = pluginOptions.tsconfigGetter();
    return getTsConfigPath(
      tsConfigResolutionContext!.root,
      tsconfigValue,
      tsConfigResolutionContext!.isProd,
      isTest,
      tsConfigResolutionContext!.isLib,
    );
  }

  function resolveCompilationApiTsConfigPath(
    resolvedTsConfigPath: string,
    config: ResolvedConfig,
  ): string {
    const includedFiles = tsconfigResolver.ensureIncludeCache();
    const cached = tsconfigResolver.getCachedTsconfigOptions(
      resolvedTsConfigPath,
      config,
    );
    const expandedGraphRoots = tsconfigResolver.collectExpandedTsconfigRoots(
      resolvedTsConfigPath,
      config,
    );
    const mergedRootNames = union(
      cached.rootNames,
      expandedGraphRoots,
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

  const normalizeEmitterLookupId = (file: string) => {
    const normalizedFile = normalizePath(file);
    if (!normalizedFile.startsWith('/@fs/')) return normalizedFile;
    const fsPath = normalizedFile
      .slice('/@fs'.length)
      .replace(/^\/([A-Za-z]:\/)/, '$1');
    return normalizePath(fsPath);
  };

  let outputFile: ((file: string) => void) | undefined;
  const fileEmitter = (file: string) => {
    const normalizedFile = normalizeEmitterLookupId(file);
    outputFile?.(normalizedFile);
    return outputFiles.get(normalizedFile);
  };

  async function performAngularCompilation(
    config: ResolvedConfig,
    ids?: string[],
  ) {
    const compilation = (angularCompilation ??= await (
      createAngularCompilation as typeof createAngularCompilationType
    )(!!pluginOptions.jit, false));
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

    const resolvedTsConfigPath = resolveTsConfigPath();
    const compilationApiTsConfigPath = resolveCompilationApiTsConfigPath(
      resolvedTsConfigPath,
      config,
    );
    debugEmit('compilation initialize', {
      resolvedTsConfigPath,
      compilationApiTsConfigPath,
      modifiedFileCount: modifiedFiles?.size ?? 0,
    });
    const compilationResult = await compilation.initialize(
      compilationApiTsConfigPath,
      {
        fileReplacements: toAngularCompilationFileReplacements(
          pluginOptions.fileReplacements,
          pluginOptions.workspaceRoot,
        ),
        modifiedFiles,
        async transformStylesheet(
          data: string,
          containingFile: string,
          resourceFile: string | null,
          order: number,
          className: string | null,
        ) {
          const filename =
            resourceFile ??
            containingFile.replace(
              '.ts',
              `.${pluginOptions.inlineStylesExtension}`,
            );

          const preprocessed = preprocessStylesheetResult(
            data,
            filename,
            pluginOptions.stylePreprocessor,
            {
              filename,
              containingFile,
              resourceFile,
              className,
              order,
              inline: !resourceFile,
            },
          );

          if (shouldEnableLiveReload() && className && containingFile) {
            classNames.set(normalizePath(containingFile), className as string);
          }

          if (shouldExternalizeStyles()) {
            const stylesheetId = registerStylesheetContent(
              stylesheetRegistry!,
              {
                code: preprocessed.code,
                dependencies: normalizeStylesheetDependencies(
                  preprocessed.dependencies,
                ),
                diagnostics: preprocessed.diagnostics,
                tags: preprocessed.tags,
                containingFile,
                className: className as string | undefined,
                order,
                inlineStylesExtension: pluginOptions.inlineStylesExtension,
                resourceFile: resourceFile ?? undefined,
              },
            );

            debugStyles('stylesheet deferred to Vite pipeline', {
              stylesheetId,
              resourceFile: resourceFile ?? '(inline)',
            });

            return stylesheetId;
          }

          debugStyles('stylesheet processed inline via preprocessCSS', {
            filename,
            resourceFile: resourceFile ?? '(inline)',
            dataLength: preprocessed.code.length,
          });

          let stylesheetResult;
          try {
            stylesheetResult = await preprocessCSS(
              preprocessed.code,
              `${filename}?direct`,
              resolvedConfig,
            );
          } catch (e) {
            if (isTailwindReferenceError(e)) {
              throw e;
            }
            debugStyles('preprocessCSS error', {
              filename,
              resourceFile: resourceFile ?? '(inline)',
              error: String(e),
            });
          }

          return stylesheetResult?.code || '';
        },
        processWebWorker(_workerFile: string, _containingFile: string) {
          return '';
        },
      },
      (tsCompilerOptions: Record<string, unknown>) => {
        if (shouldExternalizeStyles()) {
          tsCompilerOptions['externalRuntimeStyles'] = true;
        }

        if (shouldEnableLiveReload()) {
          tsCompilerOptions['_enableHmr'] = true;
          tsCompilerOptions['supportTestBed'] = true;
        }

        debugCompiler('tsCompilerOptions (compilation API)', {
          liveReload: pluginOptions.liveReload,
          viteHmr: hasViteHmrTransport(),
          hasTailwindCss: pluginOptions.hasTailwindCss,
          watchMode,
          shouldExternalize: shouldExternalizeStyles(),
          externalRuntimeStyles: !!tsCompilerOptions['externalRuntimeStyles'],
          hmrEnabled: !!tsCompilerOptions['_enableHmr'],
        });

        if (tsCompilerOptions['compilationMode'] === 'partial') {
          tsCompilerOptions['supportTestBed'] = true;
          tsCompilerOptions['supportJitMode'] = true;
        }

        if (!isTest && resolvedConfig.build?.lib) {
          tsCompilerOptions['declaration'] = true;
          tsCompilerOptions['declarationMap'] = watchMode;
          tsCompilerOptions['inlineSources'] = true;
        }

        if (isTest) {
          tsCompilerOptions['supportTestBed'] = true;
        }

        return tsCompilerOptions;
      },
    );

    // Preprocess external stylesheets for Tailwind CSS @reference
    debugStyles('external stylesheets from compilation API', {
      count: compilationResult.externalStylesheets?.size ?? 0,
      hasPreprocessor: !!pluginOptions.stylePreprocessor,
      hasInlineMap: !!stylesheetRegistry,
    });
    const preprocessStats = { total: 0, injected: 0, skipped: 0, errors: 0 };
    for (const [key, value] of compilationResult.externalStylesheets ?? []) {
      preprocessStats.total++;
      const angularHash = `${value}.css`;
      stylesheetRegistry?.registerExternalRequest(angularHash, key);

      if (
        stylesheetRegistry &&
        pluginOptions.stylePreprocessor &&
        existsSync(key)
      ) {
        try {
          const rawCss = readFileSync(key, 'utf-8');
          const preprocessed = preprocessStylesheetResult(
            rawCss,
            key,
            pluginOptions.stylePreprocessor,
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
      pluginOptions.disableTypeChecking
        ? DiagnosticModes.All & ~DiagnosticModes.Semantic
        : DiagnosticModes.All,
    );

    compilationDiagnostics = {
      errors: (diagnostics.errors || []).map(
        (d: {
          text?: string;
          location?: { file?: string; line?: number; column?: number } | null;
        }) => {
          const loc = d.location;
          const prefix = loc?.file
            ? `${loc.file}${loc.line != null ? `:${loc.line}` : ''}${loc.column != null ? `:${loc.column}` : ''} - `
            : '';
          return `${prefix}${d.text || ''}`;
        },
      ),
      warnings: (diagnostics.warnings || []).map(
        (d: {
          text?: string;
          location?: { file?: string; line?: number; column?: number } | null;
        }) => {
          const loc = d.location;
          const prefix = loc?.file
            ? `${loc.file}${loc.line != null ? `:${loc.line}` : ''}${loc.column != null ? `:${loc.column}` : ''} - `
            : '';
          return `${prefix}${d.text || ''}`;
        },
      ),
    };
    diagnosticsEmitted = false;

    const templateUpdates = mapTemplateUpdatesToFiles(
      compilationResult.templateUpdates,
    );
    if (templateUpdates.size > 0) {
      debugHmr('compilation API template updates', {
        count: templateUpdates.size,
        files: [...templateUpdates.keys()],
      });
    }

    const affectedFiles = await compilation.emitAffectedFiles();
    debugEmit('emitAffectedFiles summary', {
      count: affectedFiles.length,
      templateUpdateCount: templateUpdates.size,
      knownOutputCountBefore: outputFiles.size,
    });

    for (const file of affectedFiles) {
      const normalizedFilename = normalizePath(file.filename);
      const templateUpdate = templateUpdates.get(normalizedFilename);

      if (templateUpdate) {
        classNames.set(normalizedFilename, templateUpdate.className);
      }

      outputFiles.set(normalizedFilename, {
        content: file.contents,
        dependencies: [],
        errors: [],
        warnings: [],
        hmrUpdateCode: templateUpdate?.code,
        hmrEligible: !!templateUpdate?.code,
      });
    }
  }

  async function performCompilation(config: ResolvedConfig, ids?: string[]) {
    let resolve: (() => unknown) | undefined;
    const previousLock = compilationLock;
    compilationLock = new Promise<void>((r) => {
      resolve = r;
    });
    try {
      await previousLock;
      await performAngularCompilation(config, ids);
    } finally {
      resolve!();
    }
  }

  function isComponentStyleSheet(id: string): boolean {
    return id.includes('ngcomp=');
  }

  function getFilenameFromPath(id: string): string {
    try {
      return new URL(id, 'http://localhost').pathname.replace(/^\//, '');
    } catch {
      const queryIndex = id.indexOf('?');
      const pathname = queryIndex >= 0 ? id.slice(0, queryIndex) : id;
      return pathname.replace(/^\//, '');
    }
  }

  function sendHMRComponentUpdate(server: ViteDevServer, id: string) {
    debugHmrV('ws send: angular component update', {
      id,
      timestamp: Date.now(),
    });
    server.ws.send('angular:component-update', {
      id: encodeURIComponent(id),
      timestamp: Date.now(),
    });
    classNames.delete(id);
  }

  return {
    name: '@analogjs/vite-plugin-angular-compilation-api',
    enforce: 'pre' as const,
    async config(config, { command }) {
      activateDeferredDebug(command);
      watchMode = command === 'serve';
      const isProd =
        config.mode === 'production' ||
        process.env['NODE_ENV'] === 'production';

      tsConfigResolutionContext = {
        root: config.root || '.',
        isProd,
        isLib: !!config?.build?.lib,
      };

      if (angularFullVersion < 200100) {
        console.warn(
          '[@analogjs/vite-plugin-angular]: The Angular Compilation API is only available with Angular v20.1 and later',
        );
      } else {
        debugCompilationApi('enabled (Angular %s)', angularFullVersion);
      }

      // Angular Compilation API handles TypeScript transforms — disable
      // esbuild/oxc so they don't compete.
      debugCompilationApi('esbuild/oxc disabled, Angular handles transforms');

      return {
        esbuild: undefined,
        oxc: undefined,
        optimizeDeps: {
          include: ['rxjs/operators', 'rxjs', 'tslib'],
          exclude: ['@angular/platform-server'],
        },
        resolve: {
          conditions: ['style', ...(config.resolve?.conditions ?? [])],
        },
      };
    },
    configResolved(config) {
      resolvedConfig = config;

      stylesheetRegistry = new AnalogStylesheetRegistry();
      configureStylePipelineRegistry(
        pluginOptions.stylePipeline,
        stylesheetRegistry,
        { workspaceRoot: pluginOptions.workspaceRoot },
      );
      debugStyles('stylesheet registry initialized (Angular Compilation API)');

      if (isTest) {
        testWatchMode =
          !(config.server.watch === null) ||
          (config as any).test?.watch === true ||
          testWatchMode;
      }
    },
    configureServer(server) {
      viteServer = server;

      const invalidateCompilation = async () => {
        tsconfigResolver.invalidateAll();
        await performCompilation(resolvedConfig);
      };
      server.watcher.on('add', invalidateCompilation);
      server.watcher.on('unlink', invalidateCompilation);
      server.watcher.on('change', (file) => {
        if (file.includes('tsconfig')) {
          tsconfigResolver.invalidateTsconfigCaches();
        }
      });
    },
    async buildStart() {
      if (!isVitestVscode) {
        await performCompilation(resolvedConfig);
        pendingCompilation = null;
        initialCompilation = true;
      }

      if (!diagnosticsEmitted) {
        for (const warning of compilationDiagnostics.warnings) {
          this.warn(warning);
        }
        if (compilationDiagnostics.errors.length > 0) {
          this.error(compilationDiagnostics.errors.join('\n'));
        }
        diagnosticsEmitted = true;
      }
    },
    async handleHotUpdate(ctx) {
      if (isIgnoredHmrFile(ctx.file)) {
        debugHmr('ignored file change', { file: ctx.file });
        return [];
      }

      if (TS_EXT_REGEX.test(ctx.file)) {
        const [fileId] = ctx.file.split('?');
        debugHmr('TS file changed', { file: ctx.file, fileId });

        pendingCompilation = performCompilation(resolvedConfig, [fileId]);

        let result;

        if (shouldEnableLiveReload()) {
          await pendingCompilation;
          pendingCompilation = null;
          result = fileEmitter(fileId);
          debugHmr('TS file emitted', {
            fileId,
            hmrEligible: !!result?.hmrEligible,
            hasClassName: !!classNames.get(fileId),
          });
        }

        if (
          shouldEnableLiveReload() &&
          result?.hmrEligible &&
          classNames.get(fileId)
        ) {
          const relativeFileId = `${normalizePath(
            relative(process.cwd(), fileId),
          )}@${classNames.get(fileId)}`;

          debugHmr('sending component update', { relativeFileId });
          sendHMRComponentUpdate(ctx.server, relativeFileId);

          return ctx.modules.map((mod) => {
            if (mod.id === ctx.file) {
              mod.isSelfAccepting = true;
            }
            return mod;
          });
        }
      }

      if (/\.(html|htm)$/.test(ctx.file)) {
        debugHmr('template file changed', { file: ctx.file });
        // Recompile to pick up template changes
        pendingCompilation = performCompilation(resolvedConfig);
      }

      if (/\.(css|less|sass|scss)$/.test(ctx.file)) {
        debugHmr('stylesheet file changed', { file: ctx.file });
        refreshStylesheetRegistryForFile(
          ctx.file,
          stylesheetRegistry,
          pluginOptions.stylePreprocessor,
        );
      }

      return ctx.modules;
    },
    resolveId(id) {
      // Map angular component stylesheets
      if (isComponentStyleSheet(id)) {
        const filename = getFilenameFromPath(id);

        if (stylesheetRegistry?.hasServed(filename)) {
          return id;
        }

        const componentStyles =
          stylesheetRegistry?.resolveExternalSource(filename);
        if (componentStyles) {
          return componentStyles + new URL(id, 'http://localhost').search;
        }
      }

      return undefined;
    },
    async load(id) {
      // Serve component stylesheets from registry
      if (isComponentStyleSheet(id)) {
        const filename = getFilenameFromPath(id);
        const componentStyles = stylesheetRegistry?.getServedContent(filename);
        if (componentStyles) {
          stylesheetRegistry?.registerActiveRequest(id);
          return componentStyles;
        }
      }

      return;
    },
    transform: {
      filter: {
        id: {
          include: [TS_EXT_REGEX],
          exclude: [/node_modules/, 'type=script', '@ng/component'],
        },
      },
      async handler(code, id) {
        if (
          pluginOptions.transformFilter &&
          !(pluginOptions.transformFilter(code, id) ?? true)
        ) {
          return;
        }

        // Skip non-Angular files — in compilation API mode, Angular
        // compiles TypeScript before this hook, so only Angular files
        // need processing.
        const isAngular =
          /(Component|Directive|Pipe|Injectable|NgModule)\(/.test(code);
        if (!isAngular) {
          debugCompilationApi('transform skip (non-Angular file)', { id });
          return;
        }

        if (id.includes('?') && id.includes('analog-content-')) {
          return;
        }

        if (id.includes('.ts?')) {
          id = id.replace(/\?(.*)/, '');
        }

        if (isTest) {
          if (isVitestVscode && !initialCompilation) {
            pendingCompilation = performCompilation(resolvedConfig);
            initialCompilation = true;
          }

          const tsMod = viteServer?.moduleGraph.getModuleById(id);
          if (tsMod) {
            const invalidated = tsMod.lastInvalidationTimestamp;
            if (testWatchMode && invalidated) {
              pendingCompilation = performCompilation(resolvedConfig, [id]);
            }
          }
        }

        if (pendingCompilation) {
          await pendingCompilation;
          pendingCompilation = null;
        }

        if (!diagnosticsEmitted) {
          for (const warning of compilationDiagnostics.warnings) {
            this.warn(warning);
          }
          if (compilationDiagnostics.errors.length > 0) {
            this.error(compilationDiagnostics.errors.join('\n'));
          }
          diagnosticsEmitted = true;
        }

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
    closeBundle() {
      angularCompilation?.close?.();
      angularCompilation = undefined;
    },
  };
}

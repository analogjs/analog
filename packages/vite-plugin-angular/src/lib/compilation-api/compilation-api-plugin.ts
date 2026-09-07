import { updateComponentStyles } from '../component-style-hmr.js';
import { ResourceDependencies } from '../resource-dependencies.js';
import {
  StyleUrlsResolver,
  TemplateUrlsResolver,
} from '../component-resolvers.js';
import { stripQuery, isCompilerSource } from '../utils/module-id.js';
import { componentHmrId } from '../utils/component-hmr-id.js';
import { createCompilerSession } from '../compiler-session.js';
import {
  extractInlineSourceMap,
  normalizeSourceMap,
} from '../utils/source-map.js';
import { stylesheetFailure } from '../stylesheet-pipeline.js';
import { createStylesheetTransform } from '../stylesheet-pipeline.js';
import type { CompilerPlugin } from '../compiler-backend.js';
import { projectCompilerLayer } from '../compiler-backend-live.js';
import { type createAngularCompilation as createAngularCompilationType } from '@angular/build/private';
import * as Layer from 'effect/Layer';
import type { ResolvedSourceProject } from '../compiler-source-graph.js';
import { sourceGraphLayer } from '../compiler-source-graph-live.js';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
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
  supportsAngularCompilation,
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
  debugStylesV,
  type DebugOption,
} from '../utils/debug.js';
import {
  createDepOptimizerConfig,
  getTsConfigPath,
  TS_EXT_REGEX,
  type TsConfigResolutionContext,
} from '../utils/plugin-config.js';
import { TsconfigResolver } from '../utils/tsconfig-resolver.js';
import {
  AnalogStylesheetRegistry,
  preprocessStylesheetResult,
  registerStylesheetContent,
  rewriteRelativeCssImports,
} from '../stylesheet-registry.js';
import { normalizeStylesheetDependencies } from '../style-preprocessor.js';
import type { StylePreprocessor } from '../style-preprocessor.js';
import {
  discoverAnalogIntegrations,
  type TransformFilter,
} from '../analog-plugin-interop.js';
import { type FileReplacement } from '../plugins/file-replacements.plugin.js';
import type { EmitFileResult } from '../models.js';
import type { SourceFileCache as SourceFileCacheType } from '../utils/source-file-cache.js';
import {
  injectViteIgnoreForHmrMetadata,
  isIgnoredHmrFile,
  toAngularCompilationFileReplacements,
  mapTemplateUpdatesToFiles,
  refreshStylesheetRegistryForFile,
  createCompilationMode,
  DiagnosticModes,
  isTestWatchMode,
} from '../utils/compilation-shared.js';
import { loadVirtualRawModule } from '../utils/virtual-resources.js';

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
  fileReplacements: FileReplacement[];
  isTest: boolean;
  componentStyleHmr?: 'auto' | 'metadata';
  isAstroIntegration: boolean;
  include: string[];
  debug?: DebugOption;
}

interface CompilationAPIState {
  outputFiles: Map<string, EmitFileResult>;
  classNames: Map<string, string>;
}

export function compilationAPIPlugin(
  pluginOptions: CompilationAPIPluginOptions,
  state: CompilationAPIState = {
    outputFiles: new Map<string, EmitFileResult>(),
    classNames: new Map<string, string>(),
  },
): CompilerPlugin {
  let resolvedConfig: ResolvedConfig;
  let tsConfigResolutionContext: TsConfigResolutionContext | null = null;
  let watchMode = false;
  let stylePreprocessor: StylePreprocessor | undefined;
  let transformFilter: TransformFilter | undefined;
  let externalizeStylesRequested = false;

  // Persistent compilation instance — kept alive across rebuilds so Angular
  // can diff prior state and emit `templateUpdates` for HMR.
  let angularCompilation:
    | Awaited<ReturnType<typeof createAngularCompilationType>>
    | undefined;
  const sourceFileCache: SourceFileCacheType = new SourceFileCache();
  const { outputFiles, classNames } = state;
  let stylesheetRegistry: AnalogStylesheetRegistry | undefined;
  const resourceDependencies = new ResourceDependencies();
  const styleDependencies = new ResourceDependencies();
  const resourceOwners = (file: string): readonly string[] => [
    ...new Set([
      ...resourceDependencies.owners(file),
      ...styleDependencies
        .owners(file)
        .flatMap((source) =>
          TS_EXT_REGEX.test(source)
            ? [source]
            : resourceDependencies.owners(source),
        ),
    ]),
  ];
  const renderStylesheet = createStylesheetTransform(
    (code, file) =>
      preprocessCSS(code, file, viteServer?.config ?? resolvedConfig),
    styleDependencies,
  );
  const styleUrlsResolver = new StyleUrlsResolver();
  const templateUrlsResolver = new TemplateUrlsResolver();
  let initialCompilation = false;
  let viteServer: ViteDevServer | undefined;

  const isTest = process.env['NODE_ENV'] === 'test' || !!process.env['VITEST'];
  const tsconfigResolver = new TsconfigResolver({
    workspaceRoot: pluginOptions.workspaceRoot,
    include: pluginOptions.include,
    liveReload: pluginOptions.liveReload,
    isTest,
  });
  const isVitestVscode = !!process.env['VITEST_VSCODE'];
  let testWatchMode = isTestWatchMode();

  const compilation = createCompilerSession(
    projectCompilerLayer({
      config: () => resolvedConfig,
      tsconfig: resolveTsConfigPath,
      expandReferences: true,
      configure: (integrations) => {
        stylePreprocessor = integrations.stylePreprocessor;
        transformFilter = integrations.transformFilter;
        externalizeStylesRequested = integrations.externalizeStyles;
      },
      compile: (ids, project) =>
        performAngularCompilation(resolvedConfig, ids, project),
      close: async () => {
        await angularCompilation?.close?.();
        angularCompilation = undefined;
        viteServer = undefined;
        sourceFileCache.reset();
        resourceDependencies.clear();
        styleDependencies.clear();
        styleUrlsResolver.clear();
        templateUrlsResolver.clear();
        outputFiles.clear();
        classNames.clear();
        stylesheetRegistry = undefined;
      },
    }).pipe(Layer.provide(sourceGraphLayer(tsconfigResolver))),
  );

  const shouldUseNativeStyles = () =>
    pluginOptions.componentStyleHmr !== 'metadata' &&
    !pluginOptions.jit &&
    !isTest &&
    watchMode &&
    pluginOptions.liveReload &&
    resolvedConfig?.server.hmr !== false &&
    angularFullVersion >= 210000 &&
    angularFullVersion < 230000;
  const { shouldEnableLiveReload, shouldExternalizeStyles } =
    createCompilationMode(() => ({
      watch: isTest ? testWatchMode : watchMode,
      liveReload: pluginOptions.liveReload,
      hmr: resolvedConfig?.server.hmr !== false,
      externalizeStyles: externalizeStylesRequested || shouldUseNativeStyles(),
    }));

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
    project: ResolvedSourceProject,
  ): string {
    const mergedRootNames = project.rootNames.map((file) =>
      normalizePath(file),
    );

    if (mergedRootNames.length === project.configuredRoots.length) {
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
      additionalRootCount:
        mergedRootNames.length - project.configuredRoots.length,
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
    ids: string[] | undefined,
    project: ResolvedSourceProject,
  ) {
    const compilation = (angularCompilation ??= await createAngularCompilation(
      !!pluginOptions.jit,
      false,
    ));
    ids = ids && [
      ...new Set([
        // Angular rejects HMR candidates when modifiedFiles contains an unknown
        // Sass partial. Report its owning stylesheet; keep actual TS/resource edits.
        ...ids.filter(
          (id) =>
            TS_EXT_REGEX.test(id) ||
            resourceDependencies.owners(id).length ||
            !styleDependencies.owners(id).length,
        ),
        ...ids.flatMap((id) => styleDependencies.owners(id)),
      ]),
    ];
    for (const id of ids ?? [])
      if (TS_EXT_REGEX.test(id)) styleDependencies.remove(id);
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
      project,
    );
    debugEmit('compilation initialize', {
      resolvedTsConfigPath,
      compilationApiTsConfigPath,
      modifiedFileCount: modifiedFiles?.size ?? 0,
    });
    const fileReplacements = toAngularCompilationFileReplacements(
      pluginOptions.fileReplacements,
      pluginOptions.workspaceRoot,
    );
    const compilationResult = await compilation.initialize(
      compilationApiTsConfigPath,
      {
        ...(fileReplacements ? { fileReplacements } : {}),
        ...(modifiedFiles ? { modifiedFiles } : {}),
        async transformStylesheet(
          data: string,
          containingFile: string,
          resourceFile?: string,
          order?: number,
          className?: string,
        ) {
          if (shouldEnableLiveReload() && className) {
            classNames.set(normalizePath(containingFile), className);
          }
          return (
            (await renderStylesheet({
              data,
              containingFile,
              resourceFile,
              className,
              order,
              inlineStylesExtension: pluginOptions.inlineStylesExtension,
              registry:
                shouldExternalizeStyles() &&
                (resourceFile || externalizeStylesRequested)
                  ? stylesheetRegistry
                  : undefined,
              preprocessor: stylePreprocessor,
            })) ?? ''
          );
        },
        processWebWorker(_workerFile: string, _containingFile: string) {
          return '';
        },
      },
      (tsCompilerOptions: Record<string, unknown>) => {
        // The native API returns one emitted value per source file. Keep the
        // map inline until the Vite transform boundary so it cannot be replaced
        // by the subsequent JavaScript emission in Angular's internal Map.
        tsCompilerOptions['sourceMap'] = false;
        tsCompilerOptions['inlineSourceMap'] = !!project.options.sourceMap;
        tsCompilerOptions['inlineSources'] = !!project.options.sourceMap;
        if (shouldExternalizeStyles()) {
          tsCompilerOptions['externalRuntimeStyles'] = true;
        }

        if (shouldEnableLiveReload()) {
          tsCompilerOptions['_enableHmr'] = true;
          tsCompilerOptions['supportTestBed'] = true;
        }

        debugCompiler('tsCompilerOptions (compilation API)', {
          liveReload: pluginOptions.liveReload,
          viteHmr: resolvedConfig.server.hmr !== false,
          externalizeStylesRequested,
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
          // This API returns one output per source file. Declaration output
          // would replace its JavaScript; library declarations need a separate build.
          tsCompilerOptions['declaration'] = false;
          tsCompilerOptions['declarationMap'] = false;
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
      hasPreprocessor: !!stylePreprocessor,
      hasInlineMap: !!stylesheetRegistry,
    });
    const preprocessStats = { total: 0, injected: 0, skipped: 0, errors: 0 };
    for (const [key, value] of compilationResult.externalStylesheets ?? []) {
      preprocessStats.total++;
      const angularHash = `${value}.css`;
      stylesheetRegistry?.registerExternalRequest(angularHash, key);

      if (stylesheetRegistry && stylePreprocessor && existsSync(key)) {
        try {
          const rawCss = readFileSync(key, 'utf-8');
          const preprocessed = preprocessStylesheetResult(
            rawCss,
            key,
            stylePreprocessor,
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
            [key, normalizePath(key), key.replace(/^\//, '')],
          );

          if (servedCss && servedCss !== rawCss) {
            preprocessStats.injected++;
          } else {
            preprocessStats.skipped++;
          }
        } catch (e) {
          throw stylesheetFailure('preprocess', key, e);
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

    const errors = diagnostics.errors?.length ? diagnostics.errors : [];
    const warnings = diagnostics.warnings?.length ? diagnostics.warnings : [];

    const templateUpdates = mapTemplateUpdatesToFiles(
      compilationResult.templateUpdates,
      outputFiles,
    );
    if (templateUpdates.size > 0) {
      debugHmr('compilation API template updates', {
        count: templateUpdates.size,
        files: [...templateUpdates.keys()],
      });
    }

    const affectedFiles = [...(await compilation.emitAffectedFiles())];
    debugEmit('emitAffectedFiles summary', {
      count: affectedFiles.length,
      templateUpdateCount: templateUpdates.size,
      knownOutputCountBefore: outputFiles.size,
    });

    // A template-only HMR update may not emit the component's full JavaScript.
    for (const [filename, update] of templateUpdates) {
      classNames.set(filename, update.className);
      const previous = outputFiles.get(filename);
      if (previous) {
        outputFiles.set(filename, {
          ...previous,
          hmrUpdateCode: update.code,
          hmrEligible: true,
        });
      }
    }

    for (const file of affectedFiles) {
      const normalizedFilename = normalizePath(file.filename);
      const templateUpdate = templateUpdates.get(normalizedFilename);

      if (templateUpdate) {
        classNames.set(normalizedFilename, templateUpdate.className);
      }

      outputFiles.set(normalizedFilename, {
        content: file.contents,
        dependencies: [],
        errors: errors.map((error: { text?: string }) => error.text || ''),
        warnings: warnings.map(
          (warning: { text?: string }) => warning.text || '',
        ),
        hmrUpdateCode: templateUpdate?.code ?? null,
        hmrEligible: !!templateUpdate?.code,
      });
    }
    return [...templateUpdates.keys()];
  }

  function notifyComponentUpdates(
    server: ViteDevServer,
    files: readonly string[],
  ) {
    for (const file of files) {
      const className = classNames.get(file);
      if (!className) continue;
      const relativeFileId = componentHmrId(
        relative(process.cwd(), file),
        className,
      );
      const clientGraph = server.environments.client?.moduleGraph;
      const clientModule = clientGraph?.getModuleById(file);
      if (clientModule) {
        clientGraph?.invalidateModule(clientModule);
        clientModule.isSelfAccepting = true;
      }
      sendHMRComponentUpdate(server, relativeFileId);
    }
  }

  function isComponentStyleSheet(id: string): boolean {
    return new URL(id, 'http://localhost').searchParams.has('ngcomp');
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
    api: {
      read: compilation.read,
      defer: compilation.defer,
      watch: compilation.watch,
      warmup: compilation.warmup,
      ready: compilation.ready,
      resourceOwners,
      invalidate: async (files) => {
        await compilation.run(files);
      },
    },
    enforce: 'pre' as const,
    async config(config, { command }) {
      if (
        typeof createAngularCompilation !== 'function' ||
        !supportsAngularCompilation()
      ) {
        throw new Error(
          '[@analogjs/vite-plugin-angular]: The experimental Compilation API requires @angular/build/private to export createAngularCompilation. Use a compatible @angular/build version or set experimental.useAngularCompilationAPI to false.',
        );
      }
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
        esbuild: false,
        oxc: false,
        ...createDepOptimizerConfig({
          own: compilation.own,
          tsconfig: resolveTsConfigPath(),
          isProd,
          jit: pluginOptions.jit,
          watchMode,
          isTest,
          isAstroIntegration: pluginOptions.isAstroIntegration,
        }),
      };
    },
    async configResolved(config) {
      resolvedConfig = config;

      stylesheetRegistry = new AnalogStylesheetRegistry();
      const integrations = await discoverAnalogIntegrations(config);
      integrations.configureStylesheetRegistry?.(stylesheetRegistry, {
        workspaceRoot: pluginOptions.workspaceRoot,
      });
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
        await compilation.run();
      };
      const invalidateTsconfig = (file: string) => {
        if (file.includes('tsconfig')) {
          tsconfigResolver.invalidateTsconfigCaches();
        }
      };
      compilation.watch(server.watcher, 'add', invalidateCompilation);
      compilation.watch(server.watcher, 'unlink', (file) => {
        resourceDependencies.remove(file);
        styleDependencies.remove(file);
        return invalidateCompilation();
      });
      compilation.watch(server.watcher, 'change', invalidateTsconfig);
    },
    async buildStart() {
      if (!isVitestVscode) {
        await compilation.start();
        initialCompilation = true;
      }
    },
    async handleHotUpdate(ctx) {
      if (isIgnoredHmrFile(ctx.file)) {
        debugHmr('ignored file change', { file: ctx.file });
        return [];
      }

      if (TS_EXT_REGEX.test(ctx.file)) {
        const fileId = stripQuery(ctx.file);
        debugHmr('TS file changed', { file: ctx.file, fileId });

        compilation.run([fileId]);

        let result;

        if (shouldEnableLiveReload()) {
          result = await compilation.read(() => fileEmitter(fileId));
          debugHmr('TS file emitted', {
            fileId,
            hmrEligible: !!result?.hmrEligible,
            hasClassName: !!classNames.get(fileId),
          });
        }

        const hmrClassName = classNames.get(fileId);
        if (shouldEnableLiveReload() && result?.hmrEligible && hmrClassName) {
          const relativeFileId = componentHmrId(
            relative(process.cwd(), fileId),
            hmrClassName,
          );

          debugHmr('sending component update', { relativeFileId });
          sendHMRComponentUpdate(ctx.server, relativeFileId);

          const clientModule =
            ctx.server.environments.client?.moduleGraph.getModuleById(ctx.file);
          if (clientModule) clientModule.isSelfAccepting = true;
          return ctx.modules;
        }
      }

      if (shouldUseNativeStyles()) {
        const updated = await updateComponentStyles(
          ctx,
          stylesheetRegistry,
          (file) =>
            refreshStylesheetRegistryForFile(
              file,
              stylesheetRegistry,
              stylePreprocessor,
            ),
          resourceOwners(ctx.file),
        );
        if (updated) return updated;
      }
      if (
        /\.(html|htm)$/.test(ctx.file) ||
        (!shouldExternalizeStyles() && resourceOwners(ctx.file).length)
      ) {
        debugHmr('template file changed', { file: ctx.file });
        const updatedComponents = await compilation.run([ctx.file]);
        if (shouldEnableLiveReload()) {
          if (updatedComponents.updatedComponents.length) {
            notifyComponentUpdates(
              ctx.server,
              updatedComponents.updatedComponents,
            );
          } else {
            ctx.server.ws.send({ type: 'full-reload' });
          }
          return [];
        }
      }

      if (/\.(css|less|sass|scss)$/.test(ctx.file)) {
        debugHmr('stylesheet file changed', { file: ctx.file });
        refreshStylesheetRegistryForFile(
          ctx.file,
          stylesheetRegistry,
          stylePreprocessor,
        );
        // Angular's external-style host retains the original link element,
        // while Vite's CSS update replaces it. A later template HMR can then
        // re-add an unversioned link whose stale rules override the update.
        // Until both hosts share link ownership, reload component CSS using
        // the same correctness fallback as the ngtsc stylesheet path.
        if (
          stylesheetRegistry?.hasExternalSource(ctx.file) ||
          ctx.modules.some((module) => isComponentStyleSheet(module.id ?? ''))
        ) {
          for (const module of ctx.modules) {
            ctx.server.moduleGraph.invalidateModule(module);
          }
          ctx.server.ws.send({ type: 'full-reload' });
          return [];
        }
      }

      return ctx.modules;
    },
    resolveId(id) {
      // Map angular component stylesheets
      if (isComponentStyleSheet(id)) {
        const filename = getFilenameFromPath(id);
        const search = new URL(id, 'http://localhost').search;
        const servedSourcePath =
          stylesheetRegistry?.getServedSourcePath(filename);

        if (servedSourcePath) {
          debugStylesV('resolveId: mapped served stylesheet to source', {
            filename,
            resolvedPath: servedSourcePath,
          });
          return servedSourcePath + search;
        }

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
      // Virtual raw ids back JIT-emitted templateUrl/styleUrl imports.
      // virtual-modules-plugin resolves them; this plugin is the active
      // compilation plugin in compilation-API mode, so load must read the
      // backing file (jit=true is the test-mode default).
      const rawModule = await loadVirtualRawModule(this, id);
      if (rawModule !== undefined) return rawModule;

      // Serve component stylesheets from registry
      if (isComponentStyleSheet(id)) {
        const filename = getFilenameFromPath(id);
        stylesheetRegistry?.registerActiveRequest(id);
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
        if (!isCompilerSource(id)) return;
        resourceDependencies.replace(
          stripQuery(id),
          [
            ...templateUrlsResolver.resolve(code, stripQuery(id)),
            ...styleUrlsResolver.resolve(code, stripQuery(id)),
          ].map((resource) => resource.absolutePath),
        );
        if (transformFilter && !transformFilter(code, id)) {
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
          if (isVitestVscode && !initialCompilation) {
            compilation.run();
            initialCompilation = true;
          }

          const tsMod = viteServer?.moduleGraph.getModuleById(id);
          if (tsMod) {
            const invalidated = tsMod.lastInvalidationTimestamp;
            if (testWatchMode && invalidated) {
              compilation.run([id]);
            }
          }
        }

        const typescriptResult = await compilation.read(() => fileEmitter(id));
        for (const source of [
          stripQuery(id),
          ...resourceDependencies.dependencies(stripQuery(id)),
        ]) {
          for (const dependency of styleDependencies.dependencies(source))
            this.addWatchFile(dependency);
        }

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

        const emitted = extractInlineSourceMap(data);
        return {
          code: emitted.code,
          map: emitted.map ? normalizeSourceMap(emitted.map, id) : null,
        };
      },
    },
    async closeBundle() {
      if (!resolvedConfig?.build.watch) await compilation.close();
    },
    closeWatcher: () => compilation.close(),
  };
}

import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import {
  normalizePath,
  preprocessCSS,
  type Logger,
  type Plugin,
  type ResolvedConfig,
  type UserConfig,
  type ViteDevServer,
} from 'vite';

import {
  discoverAnalogIntegrations,
  type AnalogIntegrations,
  type ComponentRegistryEntries,
  type StylesheetRegistryConfigurator,
  type TransformFilter,
} from './analog-plugin-interop.js';
import { isComponentStyleSheet } from './encapsulation-plugin.js';
import type { EmitFileResult } from './models.js';
import type { FileReplacement } from './plugins/file-replacements.plugin.js';
import {
  normalizeStylesheetDependencies,
  type StylePreprocessor,
} from './style-preprocessor.js';
import {
  AnalogStylesheetRegistry,
  preprocessStylesheetResult,
  registerStylesheetContent,
} from './stylesheet-registry.js';
import {
  describeStylesheetContent,
  getBrowserModeCliOverride,
  isIgnoredHmrFile,
  isTestWatchMode,
  refreshStylesheetRegistryForFile,
} from './utils/compilation-shared.js';
import {
  applyDebugOption,
  debugHmr,
  debugHmrV,
  debugStyles,
  debugStylesV,
  type DebugOption,
} from './utils/debug.js';
import { angularFullVersion } from './utils/devkit.js';
import type { TypeCheckerOption } from './utils/lsp-type-checker.js';
import {
  createTsConfigGetter,
  getTsConfigPath,
  isProdMode,
  type TsConfigResolutionContext,
} from './utils/plugin-config.js';
import { reportStylesheetError } from './utils/stylesheet-warning.js';
import { TsconfigResolver } from './utils/tsconfig-resolver.js';

export interface PluginOptions {
  /**
   * Path to the tsconfig used for compilation, or a function returning it.
   * Defaults to `tsconfig.app.json` (`tsconfig.lib.json` for libraries,
   * `tsconfig.spec.json` in tests).
   */
  tsconfig?: string | (() => string);
  /**
   * Absolute path to the workspace root. Defaults to `NX_WORKSPACE_ROOT`,
   * then `process.cwd()`.
   */
  workspaceRoot?: string;
  /**
   * Stylesheet extension used for inline component `styles`. Defaults to `css`.
   */
  inlineStylesExtension?: string;
  /**
   * Compile components in JIT mode. Defaults to `true` in tests and `false`
   * otherwise.
   */
  jit?: boolean;
  /**
   * Additional files to include in compilation, as globs relative to the
   * workspace root.
   */
  include?: string[];
  /**
   * Enables Analog's Angular live-reload/HMR pipeline during development/watch mode.
   *
   * This is separate from Vite's `server.hmr` option, which configures the
   * HMR client transport.
   *
   * Defaults to `true` for watch mode, or `false` with `compilation: 'ngp'`,
   * which reloads the page on every change unless this is `true`. Set to
   * `false` to disable Angular reload updates while keeping other stylesheet
   * externalization behavior available when needed.
   */
  liveReload?: boolean;
  /**
   * Skip semantic and Angular template diagnostics during compilation.
   * Defaults to `true`, or `false` with `compilation: 'ngp'`, which requires
   * a TypeScript 7 type checker (see `typeChecker`).
   */
  disableTypeChecking?: boolean;
  /**
   * TypeScript 7 type checker used with `compilation: 'ngp'`: `'tsgo'`
   * (default), `'tsrs'`, or a command serving the TypeScript 7 language
   * server over stdio (`args` defaults to `['--lsp', '--stdio']`).
   */
  typeChecker?: TypeCheckerOption;
  /**
   * Replace source files at build time, like `fileReplacements` in
   * `angular.json`.
   */
  fileReplacements?: FileReplacement[];
  /**
   * Opt into the fast compile path. Skips Angular's template type-checking
   * and routes compilation through an internal single-pass transform when
   * `compilation` is not specified.
   * Defaults to `false`.
   */
  fastCompile?: boolean;
  /**
   * Selects the compilation path, overriding fastCompile. Defaults to 'ngtsc';
   * 'ngp' is experimental and falls back to 'ngtsc' under Vitest's JIT default.
   */
  compilation?: 'ngtsc' | 'ngp';
  /**
   * Compilation output mode used when `fastCompile` is enabled.
   * - `'full'` (default): Emit final Ivy definitions for application builds.
   * - `'partial'`: Emit partial declarations for library publishing.
   */
  fastCompileMode?: 'full' | 'partial';
  /**
   * Enable debug logging for specific scopes.
   *
   * - `true` → enables all `analog:angular:*` scopes
   * - `string[]` → enables listed namespaces (e.g. `['analog:angular:hmr']`)
   * - `{ scopes?, mode? }` → object form with optional `mode: 'build' | 'dev'`
   *   to restrict output to a specific Vite command (omit for both)
   *
   * Also responds to the `DEBUG` env var (Node.js) or `localStorage.debug`
   * (browser), using the `obug` convention.
   */
  debug?: DebugOption;
}

export type AngularCompilationBackend =
  | 'ngtsc'
  | 'fast'
  | 'ngp'
  | 'compilation-api';

export interface AngularBuildContextOptions extends PluginOptions {
  /**
   * Explicit compiler backend selection when composing plugins directly.
   * Overrides `compilation` and `fastCompile` when set.
   */
  compilationBackend?: AngularCompilationBackend;
  /**
   * Target browser list used by `@angular/build` Compilation API.
   */
  supportedBrowsers?: string[];
}

export interface NormalizedAngularOptions {
  tsconfigGetter: () => string;
  workspaceRoot: string;
  inlineStylesExtension: string;
  jit: boolean;
  include: string[];
  liveReload: boolean;
  disableTypeChecking: boolean;
  typeChecker?: TypeCheckerOption;
  fileReplacements: FileReplacement[];
  compilation: AngularCompilationBackend;
  fastCompile: boolean;
  fastCompileMode: 'full' | 'partial';
  supportedBrowsers: string[];
  isTest: boolean;
  isStackBlitz: boolean;
  isAstroIntegration: boolean;
  isVitestVscode: boolean;
}

export interface AngularCompilerCapabilities {
  readonly name: string;
  readonly getTsConfigPath: () => string;
  readonly getSourceMap?: (id: string) => string | undefined;
  readonly hasEmitted?: (id: string) => boolean;
}

export type HmrIgnorePredicate = (file: string) => boolean;

export interface AngularHmrStore {
  readonly rootDir: string;
  readonly classNames: Map<string, string>;
  fileEmitter: (
    file: string,
    className: string,
  ) => Pick<EmitFileResult, 'hmrUpdateCode'> | undefined;
  setFileEmitter(
    emitter: (
      file: string,
      className: string,
    ) => Pick<EmitFileResult, 'hmrUpdateCode'> | undefined,
  ): void;
  toComponentUpdateId(fileId: string, className?: string): string;
  resolveComponentFileId(fileId: string): string;
  sendComponentUpdate(server: ViteDevServer, id: string): void;
  addIgnoreFilter(predicate: HmrIgnorePredicate): void;
  isIgnoredFile(file: string): boolean;
  clear(): void;
}

export interface StylesheetTransformInput {
  data: string;
  containingFile: string;
  resourceFile?: string | null;
  order?: number;
  className?: string | null;
  readMissingResource?: boolean;
  eagerTransform?: (
    code: string,
    id: string,
  ) => Promise<{ code?: string } | null | undefined>;
  logger?: Logger;
}

export interface AngularStylesheetService {
  registry: AnalogStylesheetRegistry | undefined;
  resetRegistry(externalize: boolean): AnalogStylesheetRegistry | undefined;
  ensureRegistry(): AnalogStylesheetRegistry;
  transformStylesheet(
    input: StylesheetTransformInput,
  ): Promise<{ content: string; externalized: boolean } | null>;
  resolveComponentStyleId(id: string): string | undefined;
  loadComponentStyle(id: string): string | undefined;
  refreshForFile(file: string): void;
  clear(): void;
}

const ANGULAR_BUILD_CONTEXT_BRAND = Symbol.for(
  '@analogjs/vite-plugin-angular:build-context',
);

export const ANGULAR_COMPILER_PLUGIN_NAMES: readonly string[] = [
  '@analogjs/vite-plugin-angular',
  '@analogjs/vite-plugin-angular-fast-compile',
  '@analogjs/vite-plugin-angular-compilation-api',
  '@analogjs/vite-plugin-angular-ngp',
];

export interface AngularBuildContext {
  readonly kind: 'angular-build-context';
  readonly options: NormalizedAngularOptions;
  readonly tsconfigResolver: TsconfigResolver;
  readonly hmr: AngularHmrStore;
  readonly styles: AngularStylesheetService;
  compiler: AngularCompilerCapabilities | undefined;
  watchMode: boolean;
  testWatchMode: boolean;
  deferInitialCompilation: boolean;
  resolvedConfig: ResolvedConfig | undefined;
  tsConfigResolutionContext: TsConfigResolutionContext | null;
  stylePreprocessor: StylePreprocessor | undefined;
  configureStylesheetRegistry: StylesheetRegistryConfigurator | undefined;
  transformFilter: TransformFilter | undefined;
  componentRegistries: ComponentRegistryEntries[];
  externalizeStylesRequested: boolean;
  initConfig(
    config: UserConfig,
    env: { command: 'build' | 'serve'; mode?: string },
  ): TsConfigResolutionContext;
  setResolvedConfig(config: ResolvedConfig): void;
  resolveConfig(config: ResolvedConfig): Promise<AnalogIntegrations>;
  refreshIntegrations(config?: ResolvedConfig): Promise<AnalogIntegrations>;
  resolveTsConfigPath(): string;
  hasViteHmrTransport(): boolean;
  shouldEnableLiveReload(): boolean;
  shouldExternalizeStyles(): boolean;
  registerCompiler(capabilities: AngularCompilerCapabilities): void;
}

const patchedLoggers = new WeakSet<Logger>();

/**
 * Removes leading `/` and query string from a URL path.
 * e.g. `/foo.scss?direct&ngcomp=ng-c3153525609&e=0` returns `foo.scss`.
 */
export function getFilenameFromPath(id: string): string {
  try {
    return new URL(id, 'http://localhost').pathname.replace(/^\//, '');
  } catch {
    // Defensive fallback: if the ID cannot be parsed as a URL (e.g., it
    // contains characters that are invalid in URLs but valid in file paths
    // on some platforms), strip the query string manually.
    const queryIndex = id.indexOf('?');
    const pathname = queryIndex >= 0 ? id.slice(0, queryIndex) : id;
    return pathname.replace(/^\//, '');
  }
}

export function resolveComponentStyleId(
  id: string,
  stylesheetRegistry?: AnalogStylesheetRegistry,
): string | undefined {
  if (!isComponentStyleSheet(id)) {
    return undefined;
  }

  const filename = getFilenameFromPath(id);
  const search = new URL(id, 'http://localhost').search;
  const servedSourcePath = stylesheetRegistry?.getServedSourcePath(filename);

  if (servedSourcePath) {
    debugStylesV('resolveId: mapped served stylesheet to source', {
      filename,
      resolvedPath: servedSourcePath,
    });
    return servedSourcePath + search;
  }

  if (stylesheetRegistry?.hasServed(filename)) {
    debugStylesV('resolveId: kept preprocessed ID', { filename });
    return id;
  }

  const componentStyles = stylesheetRegistry?.resolveExternalSource(filename);
  if (componentStyles) {
    debugStylesV('resolveId: mapped external stylesheet', {
      filename,
      resolvedPath: componentStyles,
    });
    return componentStyles + search;
  }

  debugStyles('resolveId: component stylesheet NOT FOUND in either map', {
    filename,
    inlineMapSize: stylesheetRegistry?.servedCount ?? 0,
    externalMapSize: stylesheetRegistry?.externalCount ?? 0,
  });

  return undefined;
}

export function loadComponentStyle(
  id: string,
  stylesheetRegistry?: AnalogStylesheetRegistry,
): string | undefined {
  if (!isComponentStyleSheet(id)) {
    return undefined;
  }

  const filename = getFilenameFromPath(id);
  const componentStyles = stylesheetRegistry?.getServedContent(filename);
  if (!componentStyles) {
    return undefined;
  }

  stylesheetRegistry?.registerActiveRequest(id);
  const sourcePath =
    stylesheetRegistry?.resolveExternalSource(filename) ??
    stylesheetRegistry?.resolveExternalSource(filename.replace(/^\//, '')) ??
    stylesheetRegistry?.getServedSourcePath(filename) ??
    stylesheetRegistry?.getServedSourcePath(filename.replace(/^\//, ''));
  debugHmrV('stylesheet active request registered', {
    requestId: id,
    filename,
    sourcePath,
    trackedRequestIds:
      stylesheetRegistry?.getRequestIdsForSource(sourcePath ?? '') ?? [],
  });
  debugStylesV('load: served inline component stylesheet', {
    filename,
    requestId: id,
    ...describeStylesheetContent(componentStyles),
  });
  return componentStyles;
}

export function isAngularBuildContext(
  value: unknown,
): value is AngularBuildContext {
  return (
    typeof value === 'object' &&
    value !== null &&
    ANGULAR_BUILD_CONTEXT_BRAND in value
  );
}

export function createAngularHmrStore(
  rootDir: string = process.cwd(),
): AngularHmrStore {
  const classNames = new Map<string, string>();
  const ignoreFilters: HmrIgnorePredicate[] = [isIgnoredHmrFile];
  let activeEmitter: (
    file: string,
    className: string,
  ) => Pick<EmitFileResult, 'hmrUpdateCode'> | undefined = () => undefined;

  return {
    rootDir,
    classNames,
    fileEmitter(file: string, className: string) {
      return activeEmitter(file, className);
    },
    setFileEmitter(emitter) {
      activeEmitter = emitter;
    },
    toComponentUpdateId(fileId: string, className?: string): string {
      const resolvedClassName = className ?? classNames.get(fileId) ?? '';
      return `${normalizePath(relative(rootDir, fileId))}@${resolvedClassName}`;
    },
    resolveComponentFileId(fileId: string): string {
      return normalizePath(resolve(rootDir, fileId));
    },
    sendComponentUpdate(server: ViteDevServer, id: string): void {
      debugHmrV('ws send: angular component update', {
        id,
        timestamp: Date.now(),
      });
      server.ws.send('angular:component-update', {
        id: encodeURIComponent(id),
        timestamp: Date.now(),
      });
      classNames.delete(id);
    },
    addIgnoreFilter(predicate: HmrIgnorePredicate): void {
      if (!ignoreFilters.includes(predicate)) {
        ignoreFilters.push(predicate);
      }
    },
    isIgnoredFile(file: string): boolean {
      return ignoreFilters.some((predicate) => predicate(file));
    },
    clear(): void {
      classNames.clear();
    },
  };
}

function resolveBackend(
  options: AngularBuildContextOptions | undefined,
  isTest: boolean,
): AngularCompilationBackend {
  if (options?.compilationBackend) {
    return options.compilationBackend;
  }

  const compilation =
    options?.compilation === 'ngp' && !(isTest && options.jit === undefined)
      ? 'ngp'
      : 'ngtsc';

  if (compilation === 'ngp') {
    return 'ngp';
  }

  if (options?.compilation === undefined && options?.fastCompile) {
    return 'fast';
  }

  return 'ngtsc';
}

export function createAngularBuildContext(
  options?: AngularBuildContextOptions,
): AngularBuildContext {
  applyDebugOption(options?.debug, options?.workspaceRoot);

  const isTest = process.env['NODE_ENV'] === 'test' || !!process.env['VITEST'];
  const isStackBlitz = !!process.versions['webcontainer'];
  const isAstroIntegration = process.env['ANALOG_ASTRO'] === 'true';
  const isVitestVscode = !!process.env['VITEST_VSCODE'];
  const compilation = resolveBackend(options, isTest);

  // Test mode under NgtscProgram disables WebSocket-based liveReload because
  // Vitest's runner does not consume Angular's component-update WS events.
  // Style externalization still checks `externalizeStylesRequested` separately.
  let liveReload =
    options?.liveReload ?? (compilation !== 'ngp' ? true : false);
  if (compilation === 'ngtsc' && isTest) {
    liveReload = false;
    debugHmr('hmr disabled', {
      angularVersion: angularFullVersion,
      isTest,
    });
  }

  const normalizedOptions: NormalizedAngularOptions = {
    tsconfigGetter: createTsConfigGetter(options?.tsconfig),
    workspaceRoot:
      options?.workspaceRoot ??
      process.env['NX_WORKSPACE_ROOT'] ??
      process.cwd(),
    inlineStylesExtension: options?.inlineStylesExtension ?? 'css',
    jit: typeof options?.jit !== 'undefined' ? options.jit : isTest,
    include: options?.include ?? [],
    liveReload,
    disableTypeChecking:
      options?.disableTypeChecking ?? (compilation !== 'ngp' ? true : false),
    typeChecker: options?.typeChecker,
    fileReplacements: options?.fileReplacements ?? [],
    compilation,
    fastCompile: compilation === 'fast',
    fastCompileMode: options?.fastCompileMode ?? 'full',
    supportedBrowsers: options?.supportedBrowsers ?? ['safari 15'],
    isTest,
    isStackBlitz,
    isAstroIntegration,
    isVitestVscode,
  };

  const tsconfigResolver = new TsconfigResolver({
    workspaceRoot: normalizedOptions.workspaceRoot,
    include: normalizedOptions.include,
    liveReload: normalizedOptions.liveReload,
    isTest: normalizedOptions.isTest,
  });

  const hmr = createAngularHmrStore();

  let ctx!: AngularBuildContext;

  const styles: AngularStylesheetService = {
    registry: undefined,

    resetRegistry(externalize: boolean): AnalogStylesheetRegistry | undefined {
      styles.registry = externalize
        ? new AnalogStylesheetRegistry()
        : undefined;
      if (styles.registry) {
        ctx.configureStylesheetRegistry?.(styles.registry, {
          workspaceRoot: normalizedOptions.workspaceRoot,
        });
      }
      return styles.registry;
    },

    ensureRegistry(): AnalogStylesheetRegistry {
      if (!styles.registry) {
        styles.registry = new AnalogStylesheetRegistry();
        ctx.configureStylesheetRegistry?.(styles.registry, {
          workspaceRoot: normalizedOptions.workspaceRoot,
        });
      }
      return styles.registry;
    },

    async transformStylesheet(
      input: StylesheetTransformInput,
    ): Promise<{ content: string; externalized: boolean } | null> {
      let data = input.data;
      if (input.readMissingResource && input.resourceFile && !data) {
        data = readFileSync(input.resourceFile, 'utf-8');
      }

      const filename =
        input.resourceFile ??
        input.containingFile.replace(
          '.ts',
          `.${normalizedOptions.inlineStylesExtension}`,
        );

      const preprocessed = preprocessStylesheetResult(
        data,
        filename,
        ctx.stylePreprocessor,
        {
          filename,
          containingFile: input.containingFile,
          resourceFile: input.resourceFile ?? undefined,
          className: input.className ?? undefined,
          order: input.order,
          inline: !input.resourceFile,
        },
      );

      if (ctx.shouldExternalizeStyles() && styles.registry) {
        const stylesheetId = registerStylesheetContent(styles.registry, {
          code: preprocessed.code,
          dependencies: normalizeStylesheetDependencies(
            preprocessed.dependencies,
          ),
          diagnostics: preprocessed.diagnostics,
          tags: preprocessed.tags,
          containingFile: input.containingFile,
          className: input.className ?? undefined,
          order: input.order,
          inlineStylesExtension: normalizedOptions.inlineStylesExtension,
          resourceFile: input.resourceFile ?? undefined,
        });

        debugStyles('stylesheet deferred to Vite pipeline', {
          stylesheetId,
          resourceFile: input.resourceFile ?? '(inline)',
          dependencies: preprocessed.dependencies,
          diagnostics: preprocessed.diagnostics,
          tags: preprocessed.tags,
        });

        return { content: stylesheetId, externalized: true };
      }

      debugStyles('stylesheet processed inline via preprocessCSS', {
        filename,
        resourceFile: input.resourceFile ?? '(inline)',
        dataLength: preprocessed.code.length,
      });

      let stylesheetResult: { code?: string } | null | undefined;
      try {
        if (input.eagerTransform) {
          stylesheetResult = await input.eagerTransform(
            preprocessed.code,
            `${filename}?direct`,
          );
        } else if (ctx.resolvedConfig) {
          stylesheetResult = await preprocessCSS(
            preprocessed.code,
            `${filename}?direct`,
            ctx.resolvedConfig,
          );
        }
      } catch (e) {
        debugStyles('stylesheet transform error', {
          filename,
          resourceFile: input.resourceFile ?? '(inline)',
          error: String(e),
        });
        reportStylesheetError(
          input.logger ?? ctx.resolvedConfig?.logger,
          filename,
          e,
          ctx.resolvedConfig?.command === 'build',
        );
      }

      if (!stylesheetResult?.code) {
        return null;
      }

      return { content: stylesheetResult.code, externalized: false };
    },

    resolveComponentStyleId(id: string): string | undefined {
      return resolveComponentStyleId(id, styles.registry);
    },

    loadComponentStyle(id: string): string | undefined {
      return loadComponentStyle(id, styles.registry);
    },

    refreshForFile(file: string): void {
      refreshStylesheetRegistryForFile(
        file,
        styles.registry,
        ctx.stylePreprocessor,
      );
    },

    clear(): void {
      styles.registry = undefined;
    },
  };

  ctx = {
    kind: 'angular-build-context',
    options: normalizedOptions,
    tsconfigResolver,
    hmr,
    styles,
    compiler: undefined,
    watchMode: false,
    testWatchMode: isTestWatchMode(),
    deferInitialCompilation: isVitestVscode,
    resolvedConfig: undefined,
    tsConfigResolutionContext: null,
    stylePreprocessor: undefined,
    configureStylesheetRegistry: undefined,
    transformFilter: undefined,
    componentRegistries: [],
    externalizeStylesRequested: false,

    initConfig(config, { command }) {
      ctx.watchMode = command === 'serve';
      const isProd = isProdMode(config.mode);
      ctx.tsConfigResolutionContext = {
        root: config.root || '.',
        isProd,
        isLib: !!config?.build?.lib,
      };
      return ctx.tsConfigResolutionContext;
    },

    setResolvedConfig(config: ResolvedConfig) {
      ctx.resolvedConfig = config;
      ctx.tsConfigResolutionContext ??= {
        root: config.root || '.',
        isProd: isProdMode(config.mode),
        isLib: !!config?.build?.lib,
      };

      // Suppress noisy sourcemap warnings from Angular packages that ship
      // FESM bundles whose sourcemaps reference source files not included
      // in the npm package.
      if (config.logger?.warnOnce && !patchedLoggers.has(config.logger)) {
        patchedLoggers.add(config.logger);
        const originalWarnOnce = config.logger.warnOnce;
        config.logger.warnOnce = (msg, warnOptions) => {
          if (
            typeof msg === 'string' &&
            msg.includes('Sourcemap') &&
            msg.includes('node_modules')
          ) {
            return;
          }
          originalWarnOnce(msg, warnOptions);
        };
      }

      if (normalizedOptions.isTest) {
        const browser = (
          config as unknown as {
            test?: { browser?: { enabled?: boolean }; watch?: boolean };
          }
        ).test?.browser;
        ctx.deferInitialCompilation =
          normalizedOptions.isVitestVscode ||
          (!!browser &&
            (getBrowserModeCliOverride() ?? browser.enabled) === true);

        ctx.testWatchMode =
          !(config.server?.watch === null) ||
          (config as unknown as { test?: { watch?: boolean } }).test?.watch ===
            true ||
          ctx.testWatchMode;
      }
    },

    async resolveConfig(config: ResolvedConfig): Promise<AnalogIntegrations> {
      ctx.setResolvedConfig(config);
      return ctx.refreshIntegrations(config);
    },

    async refreshIntegrations(
      config?: ResolvedConfig,
    ): Promise<AnalogIntegrations> {
      const targetConfig = config ?? ctx.resolvedConfig;
      if (!targetConfig) {
        return {
          componentRegistries: [],
          include: [],
          externalizeStyles: false,
        };
      }

      const integrations = await discoverAnalogIntegrations(targetConfig);
      ctx.stylePreprocessor = integrations.stylePreprocessor;
      ctx.configureStylesheetRegistry =
        integrations.configureStylesheetRegistry;
      ctx.transformFilter = integrations.transformFilter;
      ctx.componentRegistries = integrations.componentRegistries;
      ctx.externalizeStylesRequested = integrations.externalizeStyles;
      ctx.tsconfigResolver.setIntegrationIncludes(integrations.include);
      return integrations;
    },

    resolveTsConfigPath(): string {
      const resolution = ctx.tsConfigResolutionContext ?? {
        root: ctx.resolvedConfig?.root || '.',
        isProd: isProdMode(ctx.resolvedConfig?.mode),
        isLib: !!ctx.resolvedConfig?.build?.lib,
      };
      return getTsConfigPath(
        resolution.root,
        normalizedOptions.tsconfigGetter(),
        resolution.isProd,
        normalizedOptions.isTest,
        resolution.isLib,
        normalizedOptions.workspaceRoot,
      );
    },

    hasViteHmrTransport(): boolean {
      return ctx.resolvedConfig
        ? ctx.resolvedConfig.server?.hmr !== false
        : true;
    },

    shouldEnableLiveReload(): boolean {
      const effectiveWatchMode = normalizedOptions.isTest
        ? ctx.testWatchMode
        : ctx.watchMode;
      return !!(
        effectiveWatchMode &&
        normalizedOptions.liveReload &&
        ctx.hasViteHmrTransport()
      );
    },

    shouldExternalizeStyles(): boolean {
      const effectiveWatchMode = normalizedOptions.isTest
        ? ctx.testWatchMode
        : ctx.watchMode;
      if (!effectiveWatchMode) return false;
      return !!(ctx.shouldEnableLiveReload() || ctx.externalizeStylesRequested);
    },

    registerCompiler(capabilities: AngularCompilerCapabilities): void {
      ctx.compiler = capabilities;
    },
  };

  Object.defineProperty(ctx, ANGULAR_BUILD_CONTEXT_BRAND, {
    value: true,
    enumerable: false,
  });

  return ctx;
}

export function ensureAngularBuildContext(
  ctxOrOptions?: AngularBuildContext | AngularBuildContextOptions,
): AngularBuildContext {
  if (isAngularBuildContext(ctxOrOptions)) {
    return ctxOrOptions;
  }
  return createAngularBuildContext(ctxOrOptions);
}

export function isAngularCompilerPlugin(plugin: Plugin): boolean {
  const api = plugin.api as
    | { angularCompiler?: boolean; getTsConfigPath?: unknown }
    | undefined;
  return (
    api?.angularCompiler === true ||
    ANGULAR_COMPILER_PLUGIN_NAMES.includes(plugin.name)
  );
}

export function getAngularCompilerApi(
  plugins: readonly Plugin[],
): AngularCompilerCapabilities | undefined {
  for (const plugin of plugins) {
    if (!isAngularCompilerPlugin(plugin)) {
      continue;
    }
    const api = plugin.api as Partial<AngularCompilerCapabilities> | undefined;
    if (typeof api?.getTsConfigPath === 'function') {
      return {
        name: plugin.name,
        getTsConfigPath: api.getTsConfigPath,
        getSourceMap: api.getSourceMap,
        hasEmitted: api.hasEmitted,
      };
    }
  }
  return undefined;
}

import { NgtscProgram } from '@angular/compiler-cli';
import { union } from 'es-toolkit';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path';
import * as vite from 'vite';

import * as compilerCli from '@angular/compiler-cli';
import { createRequire } from 'node:module';
import * as ts from 'typescript';
import {
  ModuleNode,
  normalizePath,
  Plugin,
  preprocessCSS,
  ResolvedConfig,
  ViteDevServer,
} from 'vite';
import { buildOptimizerPlugin } from './angular-build-optimizer-plugin.js';
import { jitPlugin } from './angular-jit-plugin.js';
import {
  createCompilerPlugin,
  createRolldownCompilerPlugin,
} from './compiler-plugin.js';
import {
  getAngularComponentMetadata,
  StyleUrlsResolver,
  TemplateUrlsResolver,
} from './component-resolvers.js';
import {
  augmentHostWithCaching,
  augmentHostWithResources,
  augmentProgramWithVersioning,
  mergeTransformers,
} from './host.js';
import type {
  StylePreprocessor,
  StylesheetDependency,
} from './style-preprocessor.js';

import { compilationAPIPlugin } from './compilation-api/index.js';
import { fastCompilePlugin } from './fast-compile-plugin.js';
import {
  templateClassBindingGuardPlugin,
  removeActiveGraphMetadata,
  removeStyleOwnerMetadata,
  type ActiveGraphComponentRecord,
  type StyleOwnerRecord,
  type TemplateClassBindingGuardContext,
} from './template-class-binding-guard-plugin.js';
import {
  tailwindReferencePlugin,
  buildStylePreprocessor,
  validateTailwindConfig,
} from './tailwind-plugin.js';
import {
  encapsulationPlugin,
  isComponentStyleSheet,
  getComponentStyleSheetMeta,
} from './encapsulation-plugin.js';
import { virtualModulesPlugin } from './virtual-modules-plugin.js';
import { angularVitestPlugins } from './angular-vitest-plugin.js';
import {
  createJitResourceTransformer,
  SourceFileCache,
  angularFullVersion,
} from './utils/devkit.js';
import {
  activateDeferredDebug,
  applyDebugOption,
  debugCompiler,
  debugCompilerV,
  debugEmit,
  debugEmitV,
  debugHmr,
  debugHmrV,
  debugStyles,
  debugStylesV,
  type DebugOption,
} from './utils/debug.js';
import {
  createTsConfigGetter,
  getTsConfigPath,
  TS_EXT_REGEX,
  type TsConfigResolutionContext,
} from './utils/plugin-config.js';
import { TsconfigResolver } from './utils/tsconfig-resolver.js';
import { getJsTransformConfigKey, isRolldown } from './utils/rolldown.js';
import {
  toVirtualRawId,
  toVirtualStyleId,
  VIRTUAL_RAW_PREFIX,
} from './utils/virtual-ids.js';
import { type SourceFileCache as SourceFileCacheType } from './utils/source-file-cache.js';

const require = createRequire(import.meta.url);

import { pendingTasksPlugin } from './angular-pending-tasks.plugin.js';
import { liveReloadPlugin } from './live-reload-plugin.js';
import { EmitFileResult } from './models.js';
import { nxFolderPlugin } from './nx-folder-plugin.js';
import {
  FileReplacement,
  FileReplacementSSR,
  FileReplacementWith,
  replaceFiles,
} from './plugins/file-replacements.plugin.js';
import { routerPlugin } from './router-plugin.js';
import {
  AnalogStylesheetRegistry,
  preprocessStylesheet,
  rewriteRelativeCssImports,
} from './stylesheet-registry.js';
import {
  AngularStylePipelineOptions,
  configureStylePipelineRegistry,
} from './style-pipeline.js';
import { markStylePathSafe } from './utils/safe-module-paths.js';

export {
  DiagnosticModes,
  injectViteIgnoreForHmrMetadata,
  isIgnoredHmrFile,
  toAngularCompilationFileReplacements,
  mapTemplateUpdatesToFiles,
  refreshStylesheetRegistryForFile,
  describeStylesheetContent,
  isTestWatchMode,
} from './utils/compilation-shared.js';
export {
  findStaticClassAndBoundClassConflicts,
  findBoundClassAndNgClassConflicts,
} from './template-class-binding-guard-plugin.js';
export { buildStylePreprocessor } from './tailwind-plugin.js';
import {
  DiagnosticModes,
  injectViteIgnoreForHmrMetadata,
  isIgnoredHmrFile,
  describeStylesheetContent,
  refreshStylesheetRegistryForFile,
  isTestWatchMode,
} from './utils/compilation-shared.js';
import {
  loadVirtualRawModule,
  rewriteHtmlRawImport,
} from './utils/virtual-resources.js';

export interface PluginOptions {
  tsconfig?: string | (() => string);
  workspaceRoot?: string;
  inlineStylesExtension?: string;
  jit?: boolean;
  advanced?: {
    /**
     * Custom TypeScript transformers that are run before Angular compilation
     */
    tsTransformers?: ts.CustomTransformers;
  };
  supportedBrowsers?: string[];
  transformFilter?: (code: string, id: string) => boolean;
  /**
   * Additional files to include in compilation
   */
  include?: string[];
  additionalContentDirs?: string[];
  /**
   * Enables Analog's Angular live-reload/HMR pipeline during development/watch mode.
   *
   * This is separate from Vite's `server.hmr` option, which configures the
   * HMR client transport.
   *
   * Defaults to `true` for watch mode. Set to `false` to disable Angular
   * reload updates while keeping other stylesheet externalization behavior
   * available when needed.
   */
  liveReload?: boolean;
  disableTypeChecking?: boolean;
  fileReplacements?: FileReplacement[];
  /**
   * Opt into the fast compile path. Skips Angular's template type-checking
   * and routes compilation through an internal single-pass transform.
   * Defaults to `false`.
   */
  fastCompile?: boolean;
  /**
   * Compilation output mode used when `fastCompile` is enabled.
   * - `'full'` (default): Emit final Ivy definitions for application builds.
   * - `'partial'`: Emit partial declarations for library publishing.
   */
  fastCompileMode?: 'full' | 'partial';
  experimental?: {
    useAngularCompilationAPI?: boolean;
  };
  /**
   * Enable debug logging for specific scopes.
   *
   * - `true` → enables all `analog:angular:*` scopes
   * - `string[]` → enables listed namespaces (e.g. `['analog:angular:tailwind']`)
   * - `{ scopes?, mode? }` → object form with optional `mode: 'build' | 'dev'`
   *   to restrict output to a specific Vite command (omit for both)
   *
   * Also responds to the `DEBUG` env var (Node.js) or `localStorage.debug`
   * (browser), using the `obug` convention.
   */
  debug?: DebugOption;
  /**
   * Optional preprocessor that transforms component CSS before it enters Vite's
   * preprocessCSS pipeline. Runs on every component stylesheet (both external
   * `.component.css` files and inline `styles: [...]` blocks).
   *
   * @param code - Raw CSS content of the component stylesheet
   * @param filename - Resolved file path of the stylesheet (or containing .ts file for inline styles)
   * @returns Transformed CSS string, or the original code if no transformation is needed
   */
  stylePreprocessor?: StylePreprocessor;
  /**
   * Experimental Angular stylesheet-resource hooks for community-maintained
   * style-pipeline plugins.
   *
   * These hooks run inside the Angular resource pipeline, which is the seam a
   * standalone Vite plugin cannot own on its own.
   */
  stylePipeline?: AngularStylePipelineOptions;
  /**
   * First-class Tailwind CSS v4 integration for Angular component styles.
   *
   * Angular's compiler processes component CSS through Vite's `preprocessCSS()`,
   * which runs `@tailwindcss/vite` — but each component stylesheet is processed
   * in isolation without access to the root Tailwind configuration (prefix, @theme,
   * @custom-variant, @plugin definitions). This causes errors like:
   *
   *   "Cannot apply utility class `sa:grid` because the `sa` variant does not exist"
   *
   * The `tailwindCss` option solves this by auto-injecting a `@reference` directive
   * into every component CSS file that uses Tailwind utilities, pointing it to the
   * root Tailwind stylesheet so `@tailwindcss/vite` can resolve the full configuration.
   *
   * @example Basic usage — reference a root Tailwind CSS file:
   * ```ts
   * import { resolve } from 'node:path';
   *
   * angular({
   *   tailwindCss: {
   *     rootStylesheet: resolve(__dirname, 'src/styles/tailwind.css'),
   *   },
   * })
   * ```
   *
   * @example With prefix detection — only inject for files using specific prefixes:
   * ```ts
   * angular({
   *   tailwindCss: {
   *     rootStylesheet: resolve(__dirname, 'src/styles/tailwind.css'),
   *     // Only inject @reference into files that use these prefixed classes
   *     prefixes: ['sa:', 'tw:'],
   *   },
   * })
   * ```
   *
   * @example AnalogJS platform — passed through the `vite` option:
   * ```ts
   * analog({
   *   vite: {
   *     tailwindCss: {
   *       rootStylesheet: resolve(__dirname, '../../../libs/meritos/tailwind.config.css'),
   *     },
   *   },
   * })
   * ```
   */
  tailwindCss?: {
    /**
     * Absolute path to the root Tailwind CSS file that contains `@import "tailwindcss"`,
     * `@theme`, `@custom-variant`, and `@plugin` definitions.
     *
     * A `@reference` directive pointing to this file will be auto-injected into
     * component CSS files that use Tailwind utilities.
     */
    rootStylesheet: string;
    /**
     * Optional list of class prefixes to detect (e.g. `['sa:', 'tw:']`).
     * When provided, `@reference` is only injected into component CSS files that
     * contain at least one of these prefixes. When omitted, `@reference` is injected
     * into all component CSS files that contain `@apply` or `@` directives.
     *
     * @default undefined — inject into all component CSS files with `@apply`
     */
    prefixes?: string[];
  };
}

const classNames = new Map();
export function evictDeletedFileMetadata(
  file: string,
  {
    removeActiveGraphMetadata,
    removeStyleOwnerMetadata,
    classNamesMap,
    fileTransformMap,
  }: {
    removeActiveGraphMetadata: (file: string) => void;
    removeStyleOwnerMetadata: (file: string) => void;
    classNamesMap: Map<string, string>;
    fileTransformMap: Map<string, string>;
  },
): void {
  const normalizedFile = normalizePath(file.split('?')[0]);
  removeActiveGraphMetadata(normalizedFile);
  removeStyleOwnerMetadata(normalizedFile);
  classNamesMap.delete(normalizedFile);
  fileTransformMap.delete(normalizedFile);
}

interface DeclarationFile {
  declarationFileDir: string;
  declarationPath: string;
  data: string;
}

export function angular(options?: PluginOptions): Plugin[] {
  applyDebugOption(options?.debug, options?.workspaceRoot);
  const liveReload = options?.liveReload ?? true;

  /**
   * Normalize plugin options so defaults
   * are used for values not provided.
   */
  const pluginOptions = {
    tsconfigGetter: createTsConfigGetter(options?.tsconfig),
    workspaceRoot: options?.workspaceRoot ?? process.cwd(),
    inlineStylesExtension: options?.inlineStylesExtension ?? 'css',
    advanced: {
      tsTransformers: {
        before: options?.advanced?.tsTransformers?.before ?? [],
        after: options?.advanced?.tsTransformers?.after ?? [],
        afterDeclarations:
          options?.advanced?.tsTransformers?.afterDeclarations ?? [],
      },
    },
    supportedBrowsers: options?.supportedBrowsers ?? ['safari 15'],
    jit: options?.jit,
    include: options?.include ?? [],
    additionalContentDirs: options?.additionalContentDirs ?? [],
    liveReload,
    disableTypeChecking: options?.disableTypeChecking ?? true,
    fileReplacements: options?.fileReplacements ?? [],
    useAngularCompilationAPI:
      options?.experimental?.useAngularCompilationAPI ?? false,
    fastCompile: options?.fastCompile ?? false,
    fastCompileMode: options?.fastCompileMode ?? 'full',
    hasTailwindCss: !!options?.tailwindCss,
    tailwindCss: options?.tailwindCss,
    stylePreprocessor: buildStylePreprocessor(options),
  };

  let resolvedConfig: ResolvedConfig;
  let tsConfigResolutionContext: TsConfigResolutionContext | null = null;

  const ts = require('typescript');
  let builder: ts.BuilderProgram | ts.EmitAndSemanticDiagnosticsBuilderProgram;
  let nextProgram: NgtscProgram | undefined;
  let cachedHost: ts.CompilerHost | undefined;
  let cachedHostKey: string | undefined;
  const isTest = process.env['NODE_ENV'] === 'test' || !!process.env['VITEST'];
  const tsconfigResolver = new TsconfigResolver({
    workspaceRoot: pluginOptions.workspaceRoot,
    include: pluginOptions.include,
    liveReload: pluginOptions.liveReload,
    hasTailwindCss: pluginOptions.hasTailwindCss,
    isTest,
  });
  function invalidateFsCaches() {
    tsconfigResolver.invalidateIncludeCache();
  }
  function invalidateTsconfigCaches() {
    tsconfigResolver.invalidateTsconfigCaches();
    cachedHost = undefined;
    cachedHostKey = undefined;
  }
  let watchMode = false;
  let testWatchMode = isTestWatchMode();
  // Dev-time component identity index for the currently active Vite graph.
  // We intentionally populate this during the pre-transform pass instead of a
  // workspace-wide scan so diagnostics stay tied to the app the developer is
  // actually serving, and so they track hot-updated files incrementally.
  const activeGraphComponentMetadata = new Map<
    string,
    ActiveGraphComponentRecord[]
  >();
  const selectorOwners = new Map<string, Set<string>>();
  const classNameOwners = new Map<string, Set<string>>();
  const transformedStyleOwnerMetadata = new Map<string, StyleOwnerRecord[]>();
  const styleSourceOwners = new Map<string, Set<string>>();

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

  /**
   * Determines whether Angular should externalize component styles.
   *
   * When true, Angular emits style references (hash-based IDs) instead of
   * inlining CSS strings. Vite's resolveId → load → transform pipeline
   * then serves these virtual modules, allowing @tailwindcss/vite to
   * process @reference directives.
   *
   * Required for TWO independent use-cases:
   *   1. HMR — Vite needs external modules for hot replacement
   *   2. Tailwind CSS (hasTailwindCss) — styles must pass through Vite's
   *      CSS pipeline so @tailwindcss/vite can resolve @apply directives
   *
   * In production builds (!watchMode), styles are NOT externalized — they
   * are inlined after preprocessCSS runs eagerly in transformStylesheet.
   */
  function shouldExternalizeStyles(): boolean {
    const effectiveWatchMode = isTest ? testWatchMode : watchMode;
    if (!effectiveWatchMode) return false;
    return !!(shouldEnableLiveReload() || pluginOptions.hasTailwindCss);
  }

  function validateNoDuplicateAnalogPlugins(config: ResolvedConfig): void {
    const analogInstances = (config.plugins ?? []).filter(
      (p) => p.name === '@analogjs/vite-plugin-angular',
    );
    if (analogInstances.length > 1 && !config.build?.ssr) {
      throw new Error(
        `[@analogjs/vite-plugin-angular] analog() is registered ${analogInstances.length} times. ` +
          `Each instance creates separate style maps, causing component ` +
          `styles to be lost. Remove duplicate registrations.`,
      );
    }
  }

  let stylesheetRegistry: AnalogStylesheetRegistry | undefined;
  const sourceFileCache: SourceFileCacheType = new SourceFileCache();
  const isVitestVscode = !!process.env['VITEST_VSCODE'];
  const isStackBlitz = !!process.versions['webcontainer'];
  const isAstroIntegration = process.env['ANALOG_ASTRO'] === 'true';

  const jit =
    typeof pluginOptions?.jit !== 'undefined' ? pluginOptions.jit : isTest;
  let viteServer: ViteDevServer | undefined;

  const styleUrlsResolver = new StyleUrlsResolver();
  const guardContext: TemplateClassBindingGuardContext = {
    styleUrlsResolver,
    activeGraphComponentMetadata,
    selectorOwners,
    classNameOwners,
    transformedStyleOwnerMetadata,
    styleSourceOwners,
  };
  const templateUrlsResolver = new TemplateUrlsResolver();
  let outputFile: ((file: string) => void) | undefined;
  const outputFiles = new Map<string, EmitFileResult>();
  const normalizeEmitterLookupId = (file: string) => {
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

  const fileEmitter = (file: string) => {
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
  let initialCompilation = false;
  const declarationFiles: DeclarationFile[] = [];
  const fileTransformMap = new Map<string, string>();
  let styleTransform: (
    code: string,
    filename: string,
  ) => Promise<vite.PreprocessCSSResult>;
  let pendingCompilation: Promise<void> | null;
  let compilationLock = Promise.resolve();
  function angularPlugin(): Plugin {
    let isProd = false;

    if (angularFullVersion < 190000 && pluginOptions.liveReload) {
      // Angular < 19 does not support externalRuntimeStyles or _enableHmr.
      debugHmr('hmr disabled: Angular version does not support HMR APIs', {
        angularVersion: angularFullVersion,
        isTest,
      });
      console.warn(
        '[@analogjs/vite-plugin-angular]: HMR was disabled because Angular v19+ is required for externalRuntimeStyles/_enableHmr support. Detected Angular version: %s.',
        angularFullVersion,
      );
      pluginOptions.liveReload = false;
    }

    if (isTest) {
      // Test mode: disable HMR because
      // Vitest's runner doesn't support Vite's WebSocket-based HMR.
      // This does NOT block style externalization — shouldExternalizeStyles()
      // independently checks hasTailwindCss, so Tailwind utilities in
      // component styles still work in unit tests.
      pluginOptions.liveReload = false;
      debugHmr('hmr disabled', {
        angularVersion: angularFullVersion,
        isTest,
      });
    }

    return {
      name: '@analogjs/vite-plugin-angular',
      async config(config, { command }) {
        activateDeferredDebug(command);
        watchMode = command === 'serve';
        isProd =
          config.mode === 'production' ||
          process.env['NODE_ENV'] === 'production';

        // Store the config context for later resolution in configResolved
        tsConfigResolutionContext = {
          root: config.root || '.',
          isProd,
          isLib: !!config?.build?.lib,
        };

        // Do a preliminary resolution for esbuild plugin (before configResolved)
        const preliminaryTsConfigPath = resolveTsConfigPath();

        const esbuild = config.esbuild ?? false;
        const oxc = config.oxc ?? false;

        const defineOptions = {
          ngJitMode: 'false',
          ngI18nClosureMode: 'false',
          ...(watchMode ? {} : { ngDevMode: 'false' }),
        };
        const useRolldown = isRolldown();
        const jsTransformConfigKey = getJsTransformConfigKey();
        const jsTransformConfigValue =
          jsTransformConfigKey === 'oxc' ? oxc : esbuild;

        const rolldownOptions: vite.DepOptimizationOptions['rolldownOptions'] =
          {
            plugins: [
              createRolldownCompilerPlugin(
                {
                  tsconfig: preliminaryTsConfigPath,
                  sourcemap: !isProd,
                  advancedOptimizations: isProd,
                  jit,
                  incremental: watchMode,
                },
                // Astro manages the transformer lifecycle externally.
                !isAstroIntegration,
              ),
            ],
          };

        const esbuildOptions: vite.DepOptimizationOptions['esbuildOptions'] = {
          plugins: [
            createCompilerPlugin(
              {
                tsconfig: preliminaryTsConfigPath,
                sourcemap: !isProd,
                advancedOptimizations: isProd,
                jit,
                incremental: watchMode,
              },
              isTest,
              !isAstroIntegration,
            ),
          ],
          define: defineOptions,
        };

        return {
          [jsTransformConfigKey]: jsTransformConfigValue,
          optimizeDeps: {
            include: ['rxjs/operators', 'rxjs', 'tslib'],
            exclude: ['@angular/platform-server'],
            ...(useRolldown ? { rolldownOptions } : { esbuildOptions }),
          },
        };
      },
      configResolved(config) {
        resolvedConfig = config;

        // Suppress noisy sourcemap warnings from Angular packages that ship
        // FESM bundles whose sourcemaps reference source files not included
        // in the npm package.
        if (config.logger?.warnOnce) {
          const originalWarnOnce = config.logger.warnOnce;
          config.logger.warnOnce = (msg, options) => {
            if (
              typeof msg === 'string' &&
              msg.includes('Sourcemap') &&
              msg.includes('node_modules')
            ) {
              return;
            }
            originalWarnOnce(msg, options);
          };
        }

        if (pluginOptions.hasTailwindCss) {
          validateTailwindConfig(pluginOptions.tailwindCss, config, watchMode);
          validateNoDuplicateAnalogPlugins(config);
        }

        if (!jit) {
          styleTransform = (code: string, filename: string) =>
            preprocessCSS(code, filename, config);
        }

        if (isTest) {
          // set test watch mode
          // - vite override from vitest-angular
          // - @nx/vite executor set server.watch explicitly to undefined (watch)/null (watch=false)
          // - vite config for test.watch variable
          // - vitest watch mode detected from the command line
          testWatchMode =
            !(config.server.watch === null) ||
            (config as any).test?.watch === true ||
            testWatchMode;
        }
      },
      configureServer(server) {
        viteServer = server;

        // Add/unlink changes the TypeScript program shape, not just file
        // contents, so we need to invalidate both include discovery and the
        // cached tsconfig root names before recompiling.
        const invalidateCompilationOnFsChange = createFsWatcherCacheInvalidator(
          invalidateFsCaches,
          invalidateTsconfigCaches,
          () => performCompilation(resolvedConfig),
        );
        server.watcher.on('add', invalidateCompilationOnFsChange);
        server.watcher.on('unlink', (file) => {
          evictDeletedFileMetadata(file, {
            removeActiveGraphMetadata: (f) =>
              removeActiveGraphMetadata(guardContext, f),
            removeStyleOwnerMetadata: (f) =>
              removeStyleOwnerMetadata(guardContext, f),
            classNamesMap: classNames as Map<string, string>,
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
        // Defer the first compilation in test mode
        if (!isVitestVscode) {
          await performCompilation(resolvedConfig);
          pendingCompilation = null;

          initialCompilation = true;
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
            debugHmrV('ts hmr evaluation', {
              file: ctx.file,
              fileId,
              hasResult: !!result,
              hmrEligible: !!result?.hmrEligible,
              hasClassName: !!classNames.get(fileId),
              className: classNames.get(fileId),
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
            shouldEnableLiveReload() &&
            result?.hmrEligible &&
            classNames.get(fileId)
          ) {
            const relativeFileId = `${normalizePath(
              relative(process.cwd(), fileId),
            )}@${classNames.get(fileId)}`;

            debugHmr('sending component update', { relativeFileId });
            debugHmrV('ts hmr component update payload', {
              file: ctx.file,
              fileId,
              relativeFileId,
              className: classNames.get(fileId),
            });
            sendHMRComponentUpdate(ctx.server, relativeFileId);

            return ctx.modules.map((mod) => {
              if (mod.id === ctx.file) {
                return markModuleSelfAccepting(mod);
              }

              return mod;
            });
          }
        }

        if (/\.(html|htm|css|less|sass|scss)$/.test(ctx.file)) {
          debugHmr('resource file changed', { file: ctx.file });
          fileTransformMap.delete(ctx.file.split('?')[0]);
          /**
           * Check to see if this was a direct request
           * for an external resource (styles, html).
           */
          const isDirect = fileModules.find(
            (mod) =>
              !!mod.id &&
              mod.id.includes('?direct') &&
              isModuleForChangedResource(mod, ctx.file, stylesheetRegistry),
          );
          const isInline = fileModules.find(
            (mod) =>
              !!mod.id &&
              mod.id.includes('?inline') &&
              isModuleForChangedResource(mod, ctx.file, stylesheetRegistry),
          );
          debugHmrV('resource direct/inline detection', {
            file: ctx.file,
            hasDirect: !!isDirect,
            directId: isDirect?.id,
            hasInline: !!isInline,
            inlineId: isInline?.id,
          });

          if (isDirect || isInline) {
            if (shouldExternalizeStyles() && isDirect?.id && isDirect.file) {
              const isComponentStyle =
                isDirect.type === 'css' && isComponentStyleSheet(isDirect.id);
              debugHmrV('resource direct branch', {
                file: ctx.file,
                directId: isDirect.id,
                directType: isDirect.type,
                shouldExternalize: shouldExternalizeStyles(),
                isComponentStyle,
              });
              if (isComponentStyle) {
                const { encapsulation } = getComponentStyleSheetMeta(
                  isDirect.id,
                );
                // Angular exposes one component stylesheet through two module
                // shapes:
                // 1. a `?direct&ngcomp=...` CSS module that Vite can patch with
                //    a normal `css-update`
                // 2. a `?ngcomp=...` JS wrapper module that embeds `__vite__css`
                //    for Angular's runtime consumption
                //
                // Value: invalidate the browser-visible wrapper before patching
                // the direct CSS module so Angular re-evaluates the same live
                // wrapper it is actually using.
                //
                // Guards against: a successful-looking CSS HMR event that
                // leaves the UI stale because the wrapper still holds the
                // pre-edit CSS string.
                const wrapperModules =
                  await findComponentStylesheetWrapperModules(
                    ctx.server,
                    ctx.file,
                    isDirect,
                    fileModules,
                    stylesheetRegistry,
                  );
                const stylesheetDiagnosis = diagnoseComponentStylesheetPipeline(
                  ctx.file,
                  isDirect,
                  stylesheetRegistry,
                  wrapperModules,
                  pluginOptions.stylePreprocessor,
                );
                debugStylesV('HMR: component stylesheet changed', {
                  file: isDirect.file,
                  encapsulation,
                });
                debugHmrV('component stylesheet wrapper modules', {
                  file: ctx.file,
                  wrapperCount: wrapperModules.length,
                  wrapperIds: wrapperModules.map((mod) => mod.id),
                  availableModuleIds: fileModules.map((mod) => mod.id),
                });
                debugHmrV(
                  'component stylesheet pipeline diagnosis',
                  stylesheetDiagnosis,
                );

                // Drop Vite's cached direct-module transform before wrapper
                // lookup and patching continue.
                //
                // Value: later fetches and wrapper regeneration see the just
                // edited stylesheet instead of the last served transform result.
                ctx.server.moduleGraph.invalidateModule(isDirect);
                debugHmrV('component stylesheet direct module invalidated', {
                  file: ctx.file,
                  directModuleId: isDirect.id,
                  directModuleUrl: isDirect.url,
                  reason:
                    'Ensure Vite drops stale direct CSS transform results before wrapper or fallback handling continues.',
                });

                // CSS-only HMR is safe only when the browser-visible wrapper is
                // known and the component is not using Shadow DOM. Vite's CSS
                // patching does not search shadow roots, so Shadow DOM still
                // falls back to reload for correctness.
                const trackedWrapperRequestIds =
                  stylesheetDiagnosis.trackedRequestIds.filter((id) =>
                    id.includes('?ngcomp='),
                  );
                const canUseCssUpdate =
                  encapsulation !== 'shadow' &&
                  (wrapperModules.length > 0 ||
                    trackedWrapperRequestIds.length > 0);

                if (canUseCssUpdate) {
                  wrapperModules.forEach((mod) =>
                    ctx.server.moduleGraph.invalidateModule(mod),
                  );
                  // A live wrapper ModuleNode is ideal because we can
                  // invalidate it directly, but it is not strictly required.
                  //
                  // Value: keep CSS-only HMR working when the browser has
                  // already loaded the wrapper URL and the registry can still
                  // prove that wrapper identity, even if this HMR pass did not
                  // surface a live ModuleNode for it.
                  debugHmrV('sending css-update for component stylesheet', {
                    file: ctx.file,
                    path: isDirect.url,
                    acceptedPath: isDirect.file,
                    wrapperCount: wrapperModules.length,
                    trackedWrapperRequestIds,
                    hint:
                      wrapperModules.length > 0
                        ? 'Live wrapper modules were found and invalidated before sending the CSS update.'
                        : 'No live wrapper ModuleNode was available, but the wrapper request id is already tracked, so Analog is trusting the browser-visible wrapper identity and patching the direct stylesheet instead of forcing a reload.',
                  });
                  sendCssUpdate(ctx.server, {
                    path: isDirect.url,
                    acceptedPath: isDirect.file,
                  });
                  logComponentStylesheetHmrOutcome({
                    file: ctx.file,
                    encapsulation,
                    diagnosis: stylesheetDiagnosis,
                    outcome: 'css-update',
                    directModuleId: isDirect.id,
                    wrapperIds: wrapperModules.map((mod) => mod.id),
                  });

                  return union(
                    fileModules
                      .filter((mod) => {
                        // Component stylesheets will have 2 modules (*.component.scss and *.component.scss?direct&ngcomp=xyz&e=x)
                        // We remove the module with the query params to prevent vite double logging the stylesheet name "hmr update *.component.scss, *.component.scss?direct&ngcomp=xyz&e=x"
                        return mod.file !== ctx.file || mod.id !== isDirect.id;
                      })
                      .map((mod) => {
                        if (mod.file === ctx.file) {
                          return markModuleSelfAccepting(mod);
                        }
                        return mod;
                      }) as ModuleNode[],
                    wrapperModules.map((mod) => markModuleSelfAccepting(mod)),
                  );
                }

                // If the browser-visible `?ngcomp=...` wrapper cannot be
                // trusted, prefer correctness over a partial patch and reload.
                //
                // Guards against: logging a "successful" CSS update while
                // Angular keeps running stale wrapper JS that still embeds the
                // old stylesheet contents.
                debugHmrV('component stylesheet hmr fallback: full reload', {
                  file: ctx.file,
                  encapsulation,
                  reason:
                    trackedWrapperRequestIds.length === 0
                      ? 'missing-wrapper-module'
                      : encapsulation === 'shadow'
                        ? 'shadow-encapsulation'
                        : 'tracked-wrapper-still-not-patchable',
                  directId: isDirect.id,
                  trackedRequestIds:
                    stylesheetRegistry?.getRequestIdsForSource(ctx.file) ?? [],
                });
                const ownerModules = findStyleOwnerModules(
                  ctx.server,
                  ctx.file,
                  styleSourceOwners,
                );
                debugHmrV('component stylesheet owner fallback lookup', {
                  file: ctx.file,
                  ownerCount: ownerModules.length,
                  ownerIds: ownerModules.map((mod) => mod.id),
                  ownerFiles: [
                    ...(styleSourceOwners.get(normalizePath(ctx.file)) ?? []),
                  ],
                });

                if (ownerModules.length > 0) {
                  pendingCompilation = performCompilation(resolvedConfig, [
                    ...ownerModules.map((mod) => mod.id).filter(Boolean),
                  ]);
                  await pendingCompilation;
                  pendingCompilation = null;

                  const updates = ownerModules
                    .map((mod) => mod.id)
                    .filter((id): id is string => !!id && !!classNames.get(id));
                  const derivedUpdates = ownerModules
                    .map((mod) => mod.id)
                    .filter((id): id is string => !!id)
                    .flatMap((ownerId) =>
                      resolveComponentClassNamesForStyleOwner(
                        ownerId,
                        ctx.file,
                      ).map((className) => ({
                        ownerId,
                        className,
                        via: 'raw-component-metadata' as const,
                      })),
                    );
                  debugHmrV('component stylesheet owner fallback compilation', {
                    file: ctx.file,
                    ownerIds: ownerModules.map((mod) => mod.id),
                    updateIds: updates,
                    classNames: updates.map((id) => ({
                      id,
                      className: classNames.get(id),
                    })),
                    derivedUpdates,
                  });
                  // Keep owner recompilation and metadata derivation as
                  // diagnostics only.
                  //
                  // Value: the fallback log can still point at the affected
                  // components.
                  //
                  // Guards against: treating a component-update as a safe
                  // substitute for a missing wrapper module. Angular can
                  // re-render the component without forcing the browser to
                  // refresh the wrapper CSS, which leaves the UI visually stale.
                  if (derivedUpdates.length > 0) {
                    debugHmrV(
                      'component stylesheet owner fallback derived updates',
                      {
                        file: ctx.file,
                        updates: derivedUpdates,
                        hint: 'Angular did not repopulate classNames during CSS-only owner recompilation, so Analog derived component identities from raw component metadata.',
                      },
                    );
                  }
                }

                logComponentStylesheetHmrOutcome({
                  file: ctx.file,
                  encapsulation,
                  diagnosis: stylesheetDiagnosis,
                  outcome: 'full-reload',
                  directModuleId: isDirect.id,
                  wrapperIds: wrapperModules.map((mod) => mod.id),
                  ownerIds: ownerModules.map((mod) => mod.id),
                });
                sendFullReload(ctx.server, {
                  file: ctx.file,
                  encapsulation,
                  reason:
                    wrapperModules.length === 0
                      ? 'missing-wrapper-module-and-no-owner-updates'
                      : 'shadow-encapsulation',
                  directId: isDirect.id,
                  trackedRequestIds:
                    stylesheetRegistry?.getRequestIdsForSource(ctx.file) ?? [],
                });
                return [];
              }
            }
            return fileModules;
          }

          if (
            shouldEnableLiveReload() &&
            /\.(html|htm)$/.test(ctx.file) &&
            fileModules.length === 0
          ) {
            const ownerModules = findTemplateOwnerModules(ctx.server, ctx.file);
            debugHmrV('template owner lookup', {
              file: ctx.file,
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
                ctx.server.moduleGraph.invalidateModule(mod),
              );

              pendingCompilation = performCompilation(resolvedConfig, ownerIds);
              await pendingCompilation;
              pendingCompilation = null;

              const updates = ownerIds.filter((id) => classNames.get(id));
              debugHmrV('template owner recompilation result', {
                file: ctx.file,
                ownerIds,
                updates,
                updateClassNames: updates.map((id) => ({
                  id,
                  className: classNames.get(id),
                })),
                hint:
                  updates.length > 0
                    ? 'External template recompilation produced Angular component update targets.'
                    : 'External template recompilation completed, but no Angular component update targets were surfaced.',
              });
              if (updates.length > 0) {
                debugHmr('template owner module invalidation', {
                  file: ctx.file,
                  ownerIds,
                  updateCount: updates.length,
                });
                updates.forEach((updateId) => {
                  const relativeFileId = `${normalizePath(
                    relative(process.cwd(), updateId),
                  )}@${classNames.get(updateId)}`;
                  sendHMRComponentUpdate(ctx.server, relativeFileId);
                });

                return ownerModules.map((mod) => markModuleSelfAccepting(mod));
              }
            }
          }

          const mods: ModuleNode[] = [];
          const updates: string[] = [];
          fileModules.forEach((mod) => {
            mod.importers.forEach((imp) => {
              ctx.server.moduleGraph.invalidateModule(imp);

              if (shouldExternalizeStyles() && classNames.get(imp.id)) {
                updates.push(imp.id as string);
              } else {
                mods.push(imp);
              }
            });
          });
          debugHmrV('resource importer analysis', {
            file: ctx.file,
            fileModuleCount: fileModules.length,
            importerCount: fileModules.reduce(
              (count, mod) => count + mod.importers.size,
              0,
            ),
            updates,
            mods: mods.map((mod) => mod.id),
          });

          pendingCompilation = performCompilation(resolvedConfig, [
            ...mods.map((mod) => mod.id).filter(Boolean),
            ...updates,
          ]);

          if (updates.length > 0) {
            await pendingCompilation;
            pendingCompilation = null;

            debugHmr('resource importer component updates', {
              file: ctx.file,
              updateCount: updates.length,
            });
            updates.forEach((updateId) => {
              const impRelativeFileId = `${normalizePath(
                relative(process.cwd(), updateId),
              )}@${classNames.get(updateId)}`;

              sendHMRComponentUpdate(ctx.server, impRelativeFileId);
            });

            return fileModules.map((mod) => {
              if (mod.id === ctx.file) {
                return markModuleSelfAccepting(mod);
              }

              return mod;
            });
          }

          return mods;
        }

        // clear HMR updates with a full reload
        debugHmr('full reload — unrecognized file type', { file: ctx.file });
        classNames.clear();
        return ctx.modules;
      },
      resolveId(id, importer) {
        if (id.startsWith(VIRTUAL_RAW_PREFIX)) {
          return `\0${id}`;
        }

        if (jit && id.startsWith('angular:jit:')) {
          const filePath = normalizePath(
            resolve(dirname(importer as string), id.split(';')[1]),
          );
          if (id.includes(':style')) {
            // Mark the style path as safe so Vite's Denied ID check
            // passes, then let Vite's native CSS pipeline handle the
            // ?inline import (preprocessing, test.css, etc.).
            markStylePathSafe(resolvedConfig, filePath);
            return filePath + '?inline';
          }
          return toVirtualRawId(filePath);
        }

        // User `.html?raw` imports get rewritten to virtual ids so
        // Vite's server.fs Denied ID check stays out of the way.
        const rawRewrite = rewriteHtmlRawImport(id, importer);
        if (rawRewrite) return rawRewrite;

        // User `.scss?inline` / `.css?inline` imports: resolve and mark
        // safe so Vite's native CSS pipeline handles them.
        if (/\.(css|scss|sass|less)\?inline$/.test(id) && importer) {
          const filePath = id.split('?')[0];
          const resolved = isAbsolute(filePath)
            ? normalizePath(filePath)
            : normalizePath(resolve(dirname(importer), filePath));
          markStylePathSafe(resolvedConfig, resolved);
          return resolved + '?inline';
        }

        // Map angular external styleUrls to the source file
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
            debugStylesV('resolveId: kept preprocessed ID', { filename });
            return id;
          }

          const componentStyles =
            stylesheetRegistry?.resolveExternalSource(filename);
          if (componentStyles) {
            debugStylesV('resolveId: mapped external stylesheet', {
              filename,
              resolvedPath: componentStyles,
            });
            return componentStyles + new URL(id, 'http://localhost').search;
          }

          debugStyles(
            'resolveId: component stylesheet NOT FOUND in either map',
            {
              filename,
              inlineMapSize: stylesheetRegistry?.servedCount ?? 0,
              externalMapSize: stylesheetRegistry?.externalCount ?? 0,
            },
          );
        }

        return undefined;
      },
      async load(id) {
        // Virtual raw ids (templates) come from the transform-time
        // substitution below and the resolveId rewrite for user
        // `.html?raw` imports. Style ?inline imports now flow through
        // Vite's native CSS pipeline via safeModulePaths.
        const rawModule = await loadVirtualRawModule(this, id);
        if (rawModule !== undefined) return rawModule;

        // Vitest fallback: the module-runner calls ensureEntryFromUrl
        // before transformRequest, which can skip resolveId. Mark the
        // path safe here so the Denied ID check passes, then let Vite's
        // CSS pipeline handle the rest.
        if (/\.(css|scss|sass|less)\?inline$/.test(id)) {
          markStylePathSafe(resolvedConfig, id.split('?')[0]);
        }

        // Map angular inline styles to the source text
        if (isComponentStyleSheet(id)) {
          const filename = getFilenameFromPath(id);
          const componentStyles =
            stylesheetRegistry?.getServedContent(filename);
          if (componentStyles) {
            stylesheetRegistry?.registerActiveRequest(id);
            // Register the concrete request id that was just served. During HMR
            // the changed file event references the original source stylesheet
            // path, but the live browser module graph references hashed
            // stylesheet request ids such as `/abc123.css?ngcomp=...`. This is
            // the bridge between those two worlds.
            debugHmrV('stylesheet active request registered', {
              requestId: id,
              filename,
              sourcePath:
                stylesheetRegistry?.resolveExternalSource(filename) ??
                stylesheetRegistry?.resolveExternalSource(
                  filename.replace(/^\//, ''),
                ) ??
                stylesheetRegistry?.getServedSourcePath(filename) ??
                stylesheetRegistry?.getServedSourcePath(
                  filename.replace(/^\//, ''),
                ),
              trackedRequestIds:
                stylesheetRegistry?.getRequestIdsForSource(
                  stylesheetRegistry?.resolveExternalSource(filename) ??
                    stylesheetRegistry?.resolveExternalSource(
                      filename.replace(/^\//, ''),
                    ) ??
                    stylesheetRegistry?.getServedSourcePath(filename) ??
                    stylesheetRegistry?.getServedSourcePath(
                      filename.replace(/^\//, ''),
                    ) ??
                    '',
                ) ?? [],
            });
            debugStylesV('load: served inline component stylesheet', {
              filename,
              length: componentStyles.length,
              requestId: id,
              ...describeStylesheetContent(componentStyles),
            });
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
          /**
           * Check for options.transformFilter
           */
          if (
            options?.transformFilter &&
            !(options?.transformFilter(code, id) ?? true)
          ) {
            return;
          }

          /**
           * Skip transforming content files
           */
          if (id.includes('?') && id.includes('analog-content-')) {
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
            if (isVitestVscode && !initialCompilation) {
              // Do full initial compilation
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

          const hasComponent = code.includes('@Component');
          debugCompilerV('transform', {
            id,
            codeLength: code.length,
            hasComponent,
          });
          const templateUrls = hasComponent
            ? templateUrlsResolver.resolve(code, id)
            : [];
          const styleUrls = hasComponent
            ? styleUrlsResolver.resolve(code, id)
            : [];

          if (hasComponent && watchMode) {
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

          if (
            typescriptResult.warnings &&
            typescriptResult.warnings.length > 0
          ) {
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
            data = data.replace(
              /angular:jit:style:inline;/g,
              'virtual:angular:jit:style:inline;',
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
              markStylePathSafe(resolvedConfig, resolvedStyleUrl);
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

          return {
            code: data,
            map: null,
          };
        },
      },
      closeBundle() {
        declarationFiles.forEach(
          ({ declarationFileDir, declarationPath, data }) => {
            mkdirSync(declarationFileDir, { recursive: true });
            writeFileSync(declarationPath, data, 'utf-8');
          },
        );
      },
    };
  }

  const compilationPlugin = pluginOptions.useAngularCompilationAPI
    ? compilationAPIPlugin({
        tsconfigGetter: pluginOptions.tsconfigGetter,
        workspaceRoot: pluginOptions.workspaceRoot,
        inlineStylesExtension: pluginOptions.inlineStylesExtension,
        jit,
        liveReload: pluginOptions.liveReload,
        disableTypeChecking: pluginOptions.disableTypeChecking,
        supportedBrowsers: pluginOptions.supportedBrowsers,
        transformFilter: options?.transformFilter,
        fileReplacements: pluginOptions.fileReplacements,
        stylePreprocessor: pluginOptions.stylePreprocessor,
        stylePipeline: options?.stylePipeline,
        hasTailwindCss: pluginOptions.hasTailwindCss,
        tailwindCss: pluginOptions.tailwindCss,
        isTest,
        isAstroIntegration,
        include: pluginOptions.include,
        additionalContentDirs: pluginOptions.additionalContentDirs,
        debug: options?.debug,
      })
    : pluginOptions.fastCompile
      ? fastCompilePlugin({
          tsconfigGetter: pluginOptions.tsconfigGetter,
          workspaceRoot: pluginOptions.workspaceRoot,
          inlineStylesExtension: pluginOptions.inlineStylesExtension,
          jit,
          liveReload: pluginOptions.liveReload,
          supportedBrowsers: pluginOptions.supportedBrowsers,
          transformFilter: options?.transformFilter,
          isTest,
          isAstroIntegration,
          fastCompileMode: pluginOptions.fastCompileMode,
        })
      : angularPlugin();

  return [
    replaceFiles(pluginOptions.fileReplacements, pluginOptions.workspaceRoot),
    virtualModulesPlugin({ jit }),
    templateClassBindingGuardPlugin(guardContext),
    pluginOptions.hasTailwindCss &&
      tailwindReferencePlugin({ tailwindCss: pluginOptions.tailwindCss }),
    pluginOptions.liveReload && liveReloadPlugin({ classNames, fileEmitter }),
    // `compilationPlugin` is either `angularPlugin()` or `fastCompilePlugin()`
    // depending on `pluginOptions.fastCompile`. When fastCompile is off the
    // array used to also include an unconditional `angularPlugin()` right
    // before this line — invoking the same plugin twice and double-
    // registering its hooks. Removed: `compilationPlugin` already covers both
    // branches.
    compilationPlugin,
    !pluginOptions.fastCompile &&
      pluginOptions.liveReload &&
      liveReloadPlugin({ classNames, fileEmitter }),
    ...(isTest && !isStackBlitz ? angularVitestPlugins() : []),
    (jit &&
      jitPlugin({
        inlineStylesExtension: pluginOptions.inlineStylesExtension,
      })) as Plugin,
    buildOptimizerPlugin({
      supportedBrowsers: pluginOptions.supportedBrowsers,
      jit,
    }),
    routerPlugin(),
    angularFullVersion < 190004 && pendingTasksPlugin(),
    nxFolderPlugin(),
    encapsulationPlugin(shouldExternalizeStyles),
  ].filter(Boolean) as Plugin[];

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

  async function performCompilation(config: ResolvedConfig, ids?: string[]) {
    let resolve: (() => unknown) | undefined;
    const previousLock = compilationLock;
    compilationLock = new Promise<void>((r) => {
      resolve = r;
    });
    try {
      await previousLock;
      await _doPerformCompilation(config, ids);
    } finally {
      resolve!();
    }
  }

  /**
   * This method share mutable state and performs the actual compilation work.
   * It should not be called concurrently. Use `performCompilation` which wraps this method in a lock to ensure only one compilation runs at a time.
   */
  async function _doPerformCompilation(config: ResolvedConfig, ids?: string[]) {
    const isProd = config.mode === 'production';
    const modifiedFiles = new Set<string>(ids ?? []);
    sourceFileCache.invalidate(modifiedFiles);

    if (ids?.length) {
      for (const id of ids || []) {
        fileTransformMap.delete(id);
      }
    }

    const resolvedTsConfigPath = resolveTsConfigPath();
    const cached = tsconfigResolver.getCachedTsconfigOptions(
      resolvedTsConfigPath,
      config,
    );

    // Clone options before mutation (preserve cache purity)
    const tsCompilerOptions = { ...cached.options };
    let rootNames = [...cached.rootNames];

    if (shouldExternalizeStyles()) {
      tsCompilerOptions['externalRuntimeStyles'] = true;
    }

    if (shouldEnableLiveReload()) {
      tsCompilerOptions['_enableHmr'] = true;
      // Workaround for https://github.com/angular/angular/issues/59310
      tsCompilerOptions['supportTestBed'] = true;
    }

    debugCompiler('tsCompilerOptions (NgtscProgram path)', {
      liveReload: pluginOptions.liveReload,
      viteHmr: hasViteHmrTransport(),
      shouldExternalize: shouldExternalizeStyles(),
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
      tsCompilerOptions['declarationMap'] = watchMode;
      tsCompilerOptions['inlineSources'] = true;
    }

    if (isTest) {
      // Allow `TestBed.overrideXXX()` APIs.
      tsCompilerOptions['supportTestBed'] = true;
    }

    const replacements = pluginOptions.fileReplacements.map((rp) =>
      join(
        pluginOptions.workspaceRoot,
        (rp as FileReplacementSSR).ssr || (rp as FileReplacementWith).with,
      ),
    );
    // Merge + dedupe root names
    rootNames = union(
      rootNames,
      tsconfigResolver.ensureIncludeCache(),
      replacements,
    );
    const hostKey = JSON.stringify(tsCompilerOptions);
    let host: ts.CompilerHost;

    if (cachedHost && cachedHostKey === hostKey) {
      host = cachedHost;
    } else {
      host = ts.createIncrementalCompilerHost(tsCompilerOptions, {
        ...ts.sys,
        readFile(path: string, encoding: string) {
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
      cachedHost = host;
      cachedHostKey = hostKey;

      // Only store cache if in watch mode
      if (watchMode) {
        augmentHostWithCaching(host, sourceFileCache);
      }
    }

    if (!jit) {
      const externalizeStyles = !!tsCompilerOptions['externalRuntimeStyles'];
      stylesheetRegistry = externalizeStyles
        ? new AnalogStylesheetRegistry()
        : undefined;
      if (stylesheetRegistry) {
        configureStylePipelineRegistry(
          pluginOptions.stylePipeline,
          stylesheetRegistry,
          {
            workspaceRoot: pluginOptions.workspaceRoot,
          },
        );
      }
      debugStyles('stylesheet registry initialized (NgtscProgram path)', {
        externalizeStyles,
      });
      augmentHostWithResources(host, styleTransform, {
        inlineStylesExtension: pluginOptions.inlineStylesExtension,
        isProd,
        stylesheetRegistry,
        sourceFileCache,
        stylePreprocessor: pluginOptions.stylePreprocessor,
      });
    }

    /**
     * Creates a new NgtscProgram to analyze/re-analyze
     * the source files and create a file emitter.
     * This is shared between an initial build and a hot update.
     */
    let typeScriptProgram: ts.Program;
    let angularCompiler: NgtscProgram['compiler'];
    const oldBuilder =
      builder ?? ts.readBuilderProgram(tsCompilerOptions, host);

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

    if (!watchMode) {
      // When not in watch mode, the startup cost of the incremental analysis can be avoided by
      // using an abstract builder that only wraps a TypeScript program.
      builder = ts.createAbstractBuilder(typeScriptProgram, host, oldBuilder);
    }

    if (angularCompiler!) {
      await angularCompiler.analyzeAsync();
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
      angularCompiler!,
      pluginOptions.liveReload,
      pluginOptions.disableTypeChecking,
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

      if (filename.includes('ngtypecheck.ts') || filename.includes('.d.')) {
        return;
      }

      const metadata = watchMode ? fileMetadata(filename) : {};

      outputFiles.set(filename, {
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

    const writeOutputFile = (id: string) => {
      const sourceFile = builder.getSourceFile(id);
      if (!sourceFile) {
        return;
      }

      let content = '';
      builder.emit(
        sourceFile,
        (filename, data) => {
          if (/\.[cm]?js$/.test(filename)) {
            content = data;
          }

          if (
            !watchMode &&
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

      if (angularCompiler) {
        angularCompiler.incrementalCompilation.recordSuccessfulEmit(sourceFile);
      }
    };

    if (watchMode) {
      if (ids && ids.length > 0) {
        ids.forEach((id) => writeOutputFile(id));
      } else {
        /**
         * Only block the server from starting up
         * during testing.
         */
        if (isTest) {
          // TypeScript will loop until there are no more affected files in the program
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
    }

    if (!isTest) {
      /**
       * Perf: Output files on demand so the dev server
       * isn't blocked when emitting files.
       */
      outputFile = writeOutputFile;
    }
  }
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
 * Returns every live Vite module that can legitimately represent a changed
 * Angular resource file.
 *
 * For normal files, `getModulesByFile()` is enough. For Angular component
 * stylesheets, it is not: the browser often holds virtual hashed requests
 * (`/abc123.css?direct&ngcomp=...` and `/abc123.css?ngcomp=...`) that are no
 * longer discoverable from the original source path alone. We therefore merge:
 * - watcher event modules
 * - module-graph modules by source file
 * - registry-tracked live request ids resolved back through the module graph
 */
export async function getModulesForChangedFile(
  server: ViteDevServer,
  file: string,
  eventModules: readonly ModuleNode[] = [],
  stylesheetRegistry?: AnalogStylesheetRegistry,
): Promise<ModuleNode[]> {
  const normalizedFile = normalizePath(file.split('?')[0]);
  const modules = new Map<string, ModuleNode>();

  for (const mod of eventModules) {
    if (mod.id) {
      modules.set(mod.id, mod);
    }
  }

  server.moduleGraph.getModulesByFile(normalizedFile)?.forEach((mod) => {
    if (mod.id) {
      modules.set(mod.id, mod);
    }
  });

  const stylesheetRequestIds =
    stylesheetRegistry?.getRequestIdsForSource(normalizedFile) ?? [];
  const requestIdHits: Array<{
    requestId: string;
    candidate: string;
    via: 'url' | 'id';
    moduleId?: string;
  }> = [];
  for (const requestId of stylesheetRequestIds) {
    const candidates = [
      requestId,
      requestId.startsWith('/') ? requestId : `/${requestId}`,
    ];

    for (const candidate of candidates) {
      // `getModuleByUrl()` is the important lookup here. Angular's wrapper
      // module is served by URL and can be absent from a straight `getModuleById`
      // lookup during CSS HMR, even though it is the browser-visible module
      // that must be refreshed. We keep `getModuleById()` as a compatibility
      // fallback for the simpler direct CSS case.
      const mod =
        (await server.moduleGraph.getModuleByUrl(candidate)) ??
        server.moduleGraph.getModuleById(candidate);
      requestIdHits.push({
        requestId,
        candidate,
        via: mod?.url === candidate ? 'url' : 'id',
        moduleId: mod?.id,
      });
      if (mod?.id) {
        modules.set(mod.id, mod);
      }
    }
  }

  debugHmrV('getModulesForChangedFile registry lookup', {
    file: normalizedFile,
    stylesheetRequestIds,
    requestIdHits,
    resolvedModuleIds: [...modules.keys()],
  });

  return [...modules.values()];
}

export function isModuleForChangedResource(
  mod: ModuleNode,
  changedFile: string,
  stylesheetRegistry?: AnalogStylesheetRegistry,
): boolean {
  const normalizedChangedFile = normalizePath(changedFile.split('?')[0]);

  if (normalizePath((mod.file ?? '').split('?')[0]) === normalizedChangedFile) {
    return true;
  }

  if (!mod.id) {
    return false;
  }

  // Virtual Angular stylesheet modules do not report the original source file
  // as `mod.file`; they point at the served hashed stylesheet asset instead.
  // Recover the source file through the stylesheet registry so HMR can still
  // answer "does this live module belong to the resource that just changed?"
  const requestPath = getFilenameFromPath(mod.id);
  const sourcePath =
    stylesheetRegistry?.resolveExternalSource(requestPath) ??
    stylesheetRegistry?.resolveExternalSource(requestPath.replace(/^\//, '')) ??
    stylesheetRegistry?.getServedSourcePath(requestPath) ??
    stylesheetRegistry?.getServedSourcePath(requestPath.replace(/^\//, ''));

  return (
    normalizePath((sourcePath ?? '').split('?')[0]) === normalizedChangedFile
  );
}

function safeStatMtimeMs(file: string): number | undefined {
  try {
    return statSync(file).mtimeMs;
  } catch {
    return undefined;
  }
}

function diagnoseComponentStylesheetPipeline(
  changedFile: string,
  directModule: ModuleNode,
  stylesheetRegistry: AnalogStylesheetRegistry | undefined,
  wrapperModules: ModuleNode[],
  stylePreprocessor?: StylePreprocessor,
): {
  file: string;
  sourcePath?: string;
  source?: ReturnType<typeof describeStylesheetContent>;
  registry?: ReturnType<typeof describeStylesheetContent>;
  dependencies: StylesheetDependency[];
  diagnostics: ReturnType<AnalogStylesheetRegistry['getDiagnosticsForSource']>;
  tags: string[];
  directModuleId?: string;
  directModuleUrl?: string;
  trackedRequestIds: string[];
  wrapperCount: number;
  anomalies: string[];
  hints: string[];
} {
  const normalizedFile = normalizePath(changedFile.split('?')[0]);
  const sourceExists = existsSync(normalizedFile);
  const sourceCode = sourceExists
    ? readFileSync(normalizedFile, 'utf-8')
    : undefined;

  const directRequestPath = directModule.id
    ? getFilenameFromPath(directModule.id)
    : undefined;
  const sourcePath = directRequestPath
    ? (stylesheetRegistry?.resolveExternalSource(directRequestPath) ??
      stylesheetRegistry?.resolveExternalSource(
        directRequestPath.replace(/^\//, ''),
      ) ??
      stylesheetRegistry?.getServedSourcePath(directRequestPath) ??
      stylesheetRegistry?.getServedSourcePath(
        directRequestPath.replace(/^\//, ''),
      ))
    : normalizedFile;
  const registryCode = directRequestPath
    ? stylesheetRegistry?.getServedContent(directRequestPath)
    : undefined;
  const trackedRequestIds =
    stylesheetRegistry?.getRequestIdsForSource(sourcePath ?? '') ?? [];
  const dependencies =
    stylesheetRegistry?.getDependenciesForSource(sourcePath ?? '') ?? [];
  const diagnostics =
    stylesheetRegistry?.getDiagnosticsForSource(sourcePath ?? '') ?? [];
  const tags = stylesheetRegistry?.getTagsForSource(sourcePath ?? '') ?? [];

  const anomalies: string[] = [];
  const hints: string[] = [];

  if (!sourceExists) {
    anomalies.push('source_file_missing');
    hints.push(
      'The stylesheet watcher fired for a file that no longer exists on disk.',
    );
  }

  if (!registryCode) {
    anomalies.push('registry_content_missing');
    hints.push(
      'The stylesheet registry has no served content for the direct module request path.',
    );
  }

  if (sourceCode && registryCode) {
    // Compare against the same served representation that the registry stores,
    // not the raw file on disk. Analog intentionally prepends `@reference`
    // and rewrites relative imports before the stylesheet reaches Vite, so a
    // raw-source hash comparison would flag a false positive on every healthy
    // update.
    let expectedRegistryCode = preprocessStylesheet(
      sourceCode,
      normalizedFile,
      stylePreprocessor,
    );
    expectedRegistryCode = rewriteRelativeCssImports(
      expectedRegistryCode,
      normalizedFile,
    );
    const sourceDigest = describeStylesheetContent(expectedRegistryCode).digest;
    const registryDigest = describeStylesheetContent(registryCode).digest;
    if (sourceDigest !== registryDigest) {
      anomalies.push('source_registry_mismatch');
      hints.push(
        'The source file changed, but the served stylesheet content in the registry is still stale.',
      );
    }
  }

  if (trackedRequestIds.length === 0) {
    anomalies.push('no_tracked_requests');
    hints.push(
      'No live stylesheet requests are tracked for this source file, so HMR has no browser-facing target.',
    );
  }

  if (
    trackedRequestIds.some((id) => id.includes('?ngcomp=')) &&
    wrapperModules.length === 0
  ) {
    anomalies.push('tracked_wrapper_missing_from_module_graph');
    hints.push(
      'A wrapper request id is known, but Vite did not expose a live wrapper module during this HMR pass.',
    );
  }

  if (
    trackedRequestIds.every((id) => !id.includes('?ngcomp=')) &&
    wrapperModules.length === 0
  ) {
    anomalies.push('wrapper_not_yet_tracked');
    hints.push(
      'Only direct stylesheet requests were tracked during this HMR pass; the wrapper request may be appearing too late.',
    );
  }

  return {
    file: changedFile,
    sourcePath,
    source: sourceCode
      ? describeStylesheetContent(
          rewriteRelativeCssImports(
            preprocessStylesheet(sourceCode, normalizedFile, stylePreprocessor),
            normalizedFile,
          ),
        )
      : undefined,
    registry: registryCode
      ? describeStylesheetContent(registryCode)
      : undefined,
    dependencies,
    diagnostics,
    tags,
    directModuleId: directModule.id,
    directModuleUrl: directModule.url,
    trackedRequestIds,
    wrapperCount: wrapperModules.length,
    anomalies,
    hints,
  };
}

export async function findComponentStylesheetWrapperModules(
  server: ViteDevServer,
  changedFile: string,
  directModule: ModuleNode,
  fileModules: ModuleNode[],
  stylesheetRegistry?: AnalogStylesheetRegistry,
): Promise<ModuleNode[]> {
  const wrapperModules = new Map<string, ModuleNode>();

  // Fast path: if the wrapper JS module is already present in the resolved
  // fileModules set for this HMR cycle, use it directly.
  for (const mod of fileModules) {
    if (
      mod.id &&
      mod.type === 'js' &&
      isComponentStyleSheet(mod.id) &&
      isModuleForChangedResource(mod, changedFile, stylesheetRegistry)
    ) {
      wrapperModules.set(mod.id, mod);
    }
  }

  const directRequestIds = new Set<string>();
  if (directModule.id) {
    directRequestIds.add(directModule.id);
  }
  if (directModule.url) {
    directRequestIds.add(directModule.url);
  }

  const requestPath = directModule.id
    ? getFilenameFromPath(directModule.id)
    : undefined;
  const sourcePath = requestPath
    ? (stylesheetRegistry?.resolveExternalSource(requestPath) ??
      stylesheetRegistry?.resolveExternalSource(
        requestPath.replace(/^\//, ''),
      ) ??
      stylesheetRegistry?.getServedSourcePath(requestPath) ??
      stylesheetRegistry?.getServedSourcePath(requestPath.replace(/^\//, '')))
    : undefined;

  // HMR timing matters here. On a pure CSS edit, the browser often already has
  // the `?ngcomp=...` wrapper module loaded, but the registry may only know
  // about the `?direct&ngcomp=...` request at the moment the file watcher
  // fires. Pull in any already-tracked wrapper ids for the same source file,
  // then derive wrapper candidates from the known direct request ids.
  for (const requestId of stylesheetRegistry?.getRequestIdsForSource(
    sourcePath ?? '',
  ) ?? []) {
    if (requestId.includes('?ngcomp=')) {
      directRequestIds.add(requestId);
    }
  }

  const candidateWrapperIds = [...directRequestIds]
    .filter((id) => id.includes('?direct&ngcomp='))
    .map((id) => id.replace('?direct&ngcomp=', '?ngcomp='));

  const lookupHits: Array<{
    candidate: string;
    via?: 'url' | 'id';
    moduleId?: string;
    moduleType?: string;
  }> = [];

  for (const candidate of candidateWrapperIds) {
    // Wrapper modules are served by URL and can be absent from a straight
    // module-id lookup during HMR. Prefer URL resolution first, then fall back
    // to id lookup for compatibility with simpler module graph states.
    const mod =
      (await server.moduleGraph.getModuleByUrl(candidate)) ??
      server.moduleGraph.getModuleById(candidate);
    lookupHits.push({
      candidate,
      via: mod?.url === candidate ? 'url' : mod ? 'id' : undefined,
      moduleId: mod?.id,
      moduleType: mod?.type,
    });
    if (
      mod?.id &&
      mod.type === 'js' &&
      isComponentStyleSheet(mod.id) &&
      isModuleForChangedResource(mod, changedFile, stylesheetRegistry)
    ) {
      wrapperModules.set(mod.id, mod);
    }
  }

  debugHmrV('component stylesheet wrapper lookup', {
    file: changedFile,
    sourcePath,
    directModuleId: directModule.id,
    directModuleUrl: directModule.url,
    candidateWrapperIds,
    lookupHits,
  });

  if (wrapperModules.size === 0) {
    debugHmrV('component stylesheet wrapper lookup empty', {
      file: changedFile,
      sourcePath,
      directModuleId: directModule.id,
      directModuleUrl: directModule.url,
      candidateWrapperIds,
    });
  }

  return [...wrapperModules.values()];
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

function sendCssUpdate(
  server: ViteDevServer,
  update: {
    path: string;
    acceptedPath: string;
  },
) {
  const timestamp = Date.now();
  debugHmrV('ws send: css-update', {
    ...update,
    timestamp,
  });
  server.ws.send({
    type: 'update',
    updates: [
      {
        type: 'css-update',
        timestamp,
        path: update.path,
        acceptedPath: update.acceptedPath,
      },
    ],
  });
}

function sendFullReload(
  server: ViteDevServer,
  details: Record<string, unknown>,
) {
  debugHmrV('ws send: full-reload', details);
  server.ws.send('analog:debug-full-reload', details);
  server.ws.send({ type: 'full-reload' });
}

function resolveComponentClassNamesForStyleOwner(
  ownerFile: string,
  sourcePath: string,
): string[] {
  if (!existsSync(ownerFile)) {
    return [];
  }

  const ownerCode = readFileSync(ownerFile, 'utf-8');
  const components = getAngularComponentMetadata(ownerCode);
  const normalizedSourcePath = normalizePath(sourcePath);

  return components
    .filter((component) =>
      component.styleUrls.some(
        (styleUrl) =>
          normalizePath(resolve(dirname(ownerFile), styleUrl)) ===
          normalizedSourcePath,
      ),
    )
    .map((component) => component.className);
}

type ComponentStylesheetHmrOutcome =
  | 'css-update'
  | 'owner-component-update'
  | 'full-reload';

function logComponentStylesheetHmrOutcome(details: {
  file: string;
  encapsulation: string;
  diagnosis: ReturnType<typeof diagnoseComponentStylesheetPipeline>;
  outcome: ComponentStylesheetHmrOutcome;
  directModuleId?: string;
  wrapperIds?: string[];
  ownerIds?: Array<string | undefined>;
  updateIds?: string[];
}) {
  const pitfalls: string[] = [];
  const rejectedPreferredPaths: string[] = [];
  const hints: string[] = [];

  if (details.encapsulation === 'shadow') {
    pitfalls.push('shadow-encapsulation');
    rejectedPreferredPaths.push('css-update');
    rejectedPreferredPaths.push('owner-component-update');
    hints.push(
      'Shadow DOM styles cannot rely on Vite CSS patching because Angular applies them inside a shadow root.',
    );
  }

  if (details.diagnosis.anomalies.includes('wrapper_not_yet_tracked')) {
    pitfalls.push('wrapper-not-yet-tracked');
    rejectedPreferredPaths.push('css-update');
    hints.push(
      'The direct stylesheet module exists, but the browser-visible Angular wrapper module was not available in the live graph during this HMR pass.',
    );
  }

  if (
    details.diagnosis.anomalies.includes(
      'tracked_wrapper_missing_from_module_graph',
    )
  ) {
    pitfalls.push('tracked-wrapper-missing-from-module-graph');
    rejectedPreferredPaths.push('css-update');
    hints.push(
      'A wrapper request id is known, but Vite could not resolve a live wrapper module for targeted CSS HMR.',
    );
  }

  if ((details.ownerIds?.filter(Boolean).length ?? 0) === 0) {
    pitfalls.push('no-owner-modules');
    if (details.outcome === 'full-reload') {
      rejectedPreferredPaths.push('owner-component-update');
      hints.push(
        'No owning TS component modules were available in the module graph for owner-based fallback.',
      );
    }
  } else if ((details.updateIds?.length ?? 0) === 0) {
    pitfalls.push('owner-modules-without-class-identities');
    if (details.outcome === 'full-reload') {
      rejectedPreferredPaths.push('owner-component-update');
      hints.push(
        'Owner modules were found, but Angular did not expose component class identities after recompilation, so no targeted component update could be sent.',
      );
    }
  }

  debugHmrV('component stylesheet hmr outcome', {
    file: details.file,
    outcome: details.outcome,
    encapsulation: details.encapsulation,
    directModuleId: details.directModuleId,
    wrapperIds: details.wrapperIds ?? [],
    ownerIds: details.ownerIds ?? [],
    updateIds: details.updateIds ?? [],
    preferredPath:
      details.encapsulation === 'shadow' ? 'full-reload' : 'css-update',
    rejectedPreferredPaths: [...new Set(rejectedPreferredPaths)],
    pitfalls: [...new Set(pitfalls)],
    anomalies: details.diagnosis.anomalies,
    hints: [...new Set([...details.diagnosis.hints, ...hints])],
  });
}

export function findTemplateOwnerModules(
  server: ViteDevServer,
  resourceFile: string,
): ModuleNode[] {
  const normalizedResourceFile = normalizePath(resourceFile.split('?')[0]);
  const candidateTsFiles = [
    normalizedResourceFile.replace(/\.(html|htm)$/i, '.ts'),
  ];

  const modules = new Map<string, ModuleNode>();
  for (const candidate of candidateTsFiles) {
    const owners = server.moduleGraph.getModulesByFile(candidate);
    owners?.forEach((mod) => {
      if (mod.id) {
        modules.set(mod.id, mod);
      }
    });
  }

  return [...modules.values()];
}

function findStyleOwnerModules(
  server: ViteDevServer,
  resourceFile: string,
  styleSourceOwners: Map<string, Set<string>>,
): ModuleNode[] {
  const normalizedResourceFile = normalizePath(resourceFile.split('?')[0]);
  const candidateOwnerFiles = [
    ...(styleSourceOwners.get(normalizedResourceFile) ?? []),
  ];
  const modules = new Map<string, ModuleNode>();

  for (const ownerFile of candidateOwnerFiles) {
    const owners = server.moduleGraph.getModulesByFile(ownerFile);
    owners?.forEach((mod) => {
      if (mod.id) {
        modules.set(mod.id, mod);
      }
    });
  }

  return [...modules.values()];
}

export function getFileMetadata(
  program: ts.BuilderProgram,
  angularCompiler?: NgtscProgram['compiler'],
  hmrEnabled?: boolean,
  disableTypeChecking?: boolean,
) {
  const ts = require('typescript');
  return (
    file: string,
  ): {
    errors?: string[];
    warnings?: (string | ts.DiagnosticMessageChain)[];
    hmrUpdateCode?: string | null;
    hmrEligible?: boolean;
  } => {
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
        if (ts.isClassDeclaration(node) && (node as any).name != null) {
          hmrUpdateCode = angularCompiler?.emitHmrUpdateModule(node as any);
          if (hmrUpdateCode) {
            const className = (node as any).name.getText();
            classNames.set(file, className);
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
) {
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

function markModuleSelfAccepting(mod: ModuleNode): ModuleNode {
  // support Vite 6
  if ('_clientModule' in mod) {
    (mod as any)['_clientModule'].isSelfAccepting = true;
  }

  return {
    ...mod,
    isSelfAccepting: true,
  } as ModuleNode;
}

/**
 * Removes leading / and query string from a url path
 * e.g. /foo.scss?direct&ngcomp=ng-c3153525609&e=0 returns foo.scss
 * @param id
 */
function getFilenameFromPath(id: string): string {
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

/**
 * Checks for vitest run from the command line
 * @returns boolean
 */

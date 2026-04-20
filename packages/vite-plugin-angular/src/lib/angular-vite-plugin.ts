import { NgtscProgram } from '@angular/compiler-cli';
import { union } from 'es-toolkit';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  promises as fsPromises,
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
import { type createAngularCompilation as createAngularCompilationType } from '@angular/build/private';

import * as ngCompiler from '@angular/compiler';
import { globSync } from 'tinyglobby';
import {
  defaultClientConditions,
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
import {
  composeStylePreprocessors,
  normalizeStylesheetDependencies,
} from './style-preprocessor.js';
import type {
  StylePreprocessor,
  StylesheetDependency,
} from './style-preprocessor.js';

import { fastCompilePlugin } from './fast-compile-plugin.js';
import { angularVitestPlugins } from './angular-vitest-plugin.js';
import {
  createAngularCompilation,
  createJitResourceTransformer,
  SourceFileCache,
  angularFullVersion,
} from './utils/devkit.js';
import {
  activateDeferredDebug,
  applyDebugOption,
  debugCompilationApi,
  debugCompiler,
  debugCompilerV,
  debugEmit,
  debugEmitV,
  debugHmr,
  debugHmrV,
  debugStyles,
  debugStylesV,
  debugTailwind,
  debugTailwindV,
  type DebugOption,
} from './utils/debug.js';
import {
  createTsConfigGetter,
  getTsConfigPath,
  TS_EXT_REGEX,
  type TsConfigResolutionContext,
} from './utils/plugin-config.js';
import { getJsTransformConfigKey, isRolldown } from './utils/rolldown.js';
import {
  inspectCssTailwindDirectives,
  isTailwindReferenceError,
  throwTailwindReferenceTextError,
} from './utils/tailwind-reference.js';
import {
  toVirtualRawId,
  toVirtualStyleId,
  VIRTUAL_RAW_PREFIX,
  VIRTUAL_STYLE_PREFIX,
} from './utils/virtual-ids.js';
import {
  loadVirtualRawModule,
  loadVirtualStyleModule,
  shouldPreprocessTestCss,
} from './utils/virtual-resources.js';
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
  preprocessStylesheetResult,
  registerStylesheetContent,
  rewriteRelativeCssImports,
} from './stylesheet-registry.js';
import {
  AngularStylePipelineOptions,
  stylePipelinePreprocessorFromPlugins,
  configureStylePipelineRegistry,
} from './style-pipeline.js';

export enum DiagnosticModes {
  None = 0,
  Option = 1 << 0,
  Syntactic = 1 << 1,
  Semantic = 1 << 2,
  All = Option | Syntactic | Semantic,
}

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

export function normalizeIncludeGlob(
  workspaceRoot: string,
  glob: string,
): string {
  const normalizedWorkspaceRoot = normalizePath(resolve(workspaceRoot));
  const normalizedGlob = normalizePath(glob);

  if (
    normalizedGlob === normalizedWorkspaceRoot ||
    normalizedGlob.startsWith(`${normalizedWorkspaceRoot}/`)
  ) {
    return normalizedGlob;
  }

  if (normalizedGlob.startsWith('/')) {
    return `${normalizedWorkspaceRoot}${normalizedGlob}`;
  }

  return normalizePath(resolve(normalizedWorkspaceRoot, normalizedGlob));
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

export function injectViteIgnoreForHmrMetadata(code: string): string {
  let patched = code.replace(
    /\bimport\(([a-zA-Z_$][\w$]*\.\u0275\u0275getReplaceMetadataURL)/g,
    'import(/* @vite-ignore */ $1',
  );

  if (patched === code) {
    patched = patched.replace(
      /import\((\S+getReplaceMetadataURL)/g,
      'import(/* @vite-ignore */ $1',
    );
  }

  return patched;
}

export function isIgnoredHmrFile(file: string): boolean {
  return file.endsWith('.tsbuildinfo');
}

interface DeclarationFile {
  declarationFileDir: string;
  declarationPath: string;
  data: string;
}

/**
 * Builds a resolved stylePreprocessor function from plugin options.
 *
 * When `tailwindCss` is configured, creates an injector that prepends
 * `@reference "<rootStylesheet>"` into component CSS that uses Tailwind
 * utilities. Uses absolute paths because Angular's externalRuntimeStyles
 * serves component CSS as virtual modules (hash-based IDs) with no
 * meaningful directory — relative paths can't resolve from a hash.
 *
 * If both `tailwindCss` and `stylePreprocessor` are provided, they are
 * chained: Tailwind reference injection runs first, then the user's
 * custom preprocessor.
 */
export function buildStylePreprocessor(
  options?: PluginOptions,
): StylePreprocessor | undefined {
  const userPreprocessor = options?.stylePreprocessor;
  const stylePipelinePreprocessor = stylePipelinePreprocessorFromPlugins(
    options?.stylePipeline,
  );
  const tw = options?.tailwindCss;

  if (!tw && !userPreprocessor && !stylePipelinePreprocessor) {
    return undefined;
  }

  let tailwindPreprocessor:
    | ((code: string, filename: string) => string)
    | undefined;

  if (tw) {
    const rootStylesheet = tw.rootStylesheet;
    const prefixes = tw.prefixes;
    debugTailwind('configured', { rootStylesheet, prefixes });

    if (!existsSync(rootStylesheet)) {
      console.warn(
        `[@analogjs/vite-plugin-angular] tailwindCss.rootStylesheet not found ` +
          `at "${rootStylesheet}". @reference directives will point to a ` +
          `non-existent file, which will cause Tailwind CSS errors. ` +
          `Ensure the path is absolute and the file exists.`,
      );
    }

    tailwindPreprocessor = (code: string, filename: string): string => {
      const directiveState = inspectCssTailwindDirectives(code);

      // Skip files that already define the Tailwind config
      if (
        directiveState.hasReferenceDirective ||
        directiveState.hasTailwindImportDirective
      ) {
        debugTailwindV('skip (already has @reference or is root)', {
          filename,
        });
        return code;
      }

      const needsReference = prefixes
        ? prefixes.some((prefix) =>
            directiveState.commentlessCode.includes(prefix),
          )
        : directiveState.commentlessCode.includes('@apply');

      if (!needsReference) {
        debugTailwindV('skip (no Tailwind usage detected)', { filename });
        return code;
      }

      if (directiveState.hasReferenceText) {
        throwTailwindReferenceTextError(filename, rootStylesheet);
      }

      debugTailwind('injected @reference via preprocessor', { filename });

      // Absolute path — required for virtual modules (see JSDoc above).
      // Convert backslashes to forward slashes so Windows paths don't break
      // Tailwind CSS's @reference resolution. Vite's normalizePath only
      // converts on Windows, so we use an explicit replace for all platforms.
      return `@reference "${rootStylesheet.replace(/\\/g, '/')}";\n${code}`;
    };
  }

  if (tailwindPreprocessor && (stylePipelinePreprocessor || userPreprocessor)) {
    debugTailwind('chained with style pipeline or user stylePreprocessor');
  }

  return composeStylePreprocessors([
    tailwindPreprocessor,
    stylePipelinePreprocessor,
    userPreprocessor,
  ]);
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
  // Caches (always rebuild Angular program per user request)
  const tsconfigOptionsCache = new Map<
    string,
    { options: ts.CompilerOptions; rootNames: string[] }
  >();
  const tsconfigGraphRootCache = new Map<string, string[]>();
  let cachedHost: ts.CompilerHost | undefined;
  let cachedHostKey: string | undefined;
  let includeCache: string[] = [];
  function invalidateFsCaches() {
    includeCache = [];
  }
  function invalidateTsconfigCaches() {
    // `readConfiguration` caches the root file list, so hot-added pages can be
    // missing from Angular's compilation program until we clear this state.
    tsconfigOptionsCache.clear();
    tsconfigGraphRootCache.clear();
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

  /**
   * Validates the Tailwind CSS integration configuration and emits actionable
   * warnings for common misconfigurations that cause silent failures.
   *
   * Called once during `configResolved` when `tailwindCss` is configured.
   */
  function validateTailwindConfig(
    config: ResolvedConfig,
    isWatchMode: boolean,
  ): void {
    const PREFIX = '[@analogjs/vite-plugin-angular]';
    const tw = pluginOptions.tailwindCss;

    if (!tw) return;

    // rootStylesheet must be absolute — relative paths break when Angular
    // externalizes styles as hash-based virtual modules.
    if (!isAbsolute(tw.rootStylesheet)) {
      console.warn(
        `${PREFIX} tailwindCss.rootStylesheet must be an absolute path. ` +
          `Got: "${tw.rootStylesheet}". Use path.resolve(__dirname, '...') ` +
          `in your vite.config to convert it.`,
      );
    }

    // Dev: @tailwindcss/vite must be registered, otherwise component CSS
    // with @apply/@reference silently fails.
    const resolvedPlugins = config.plugins;
    const hasTailwindPlugin = resolvedPlugins.some(
      (p) =>
        p.name.startsWith('@tailwindcss/vite') ||
        p.name.startsWith('tailwindcss'),
    );

    if (isWatchMode && !hasTailwindPlugin) {
      throw new Error(
        `${PREFIX} tailwindCss is configured but no @tailwindcss/vite ` +
          `plugin was found. Component CSS with @apply directives will ` +
          `not be processed.\n\n` +
          `  Fix: npm install @tailwindcss/vite --save-dev\n` +
          `  Then add tailwindcss() to your vite.config plugins array.\n`,
      );
    }

    // Monorepo: rootStylesheet outside project root needs server.fs.allow
    if (isWatchMode && tw.rootStylesheet) {
      const projectRoot = normalizePath(config.root);
      const normalizedRootStylesheet = normalizePath(tw.rootStylesheet);
      if (!normalizedRootStylesheet.startsWith(projectRoot)) {
        const fsAllow = config.server?.fs?.allow ?? [];
        const isAllowed = fsAllow.some((allowed) =>
          normalizedRootStylesheet.startsWith(normalizePath(allowed)),
        );
        if (!isAllowed) {
          console.warn(
            `${PREFIX} tailwindCss.rootStylesheet is outside the Vite ` +
              `project root. The dev server may reject it with 403.\n\n` +
              `  Root: ${projectRoot}\n` +
              `  Stylesheet: ${tw.rootStylesheet}\n\n` +
              `  Fix: server.fs.allow: ['${dirname(tw.rootStylesheet)}']\n`,
          );
        }
      }
    }

    // Empty prefixes array means no component stylesheets get @reference
    if (tw.prefixes !== undefined && tw.prefixes.length === 0) {
      console.warn(
        `${PREFIX} tailwindCss.prefixes is an empty array. No component ` +
          `stylesheets will receive @reference injection. Either remove ` +
          `the prefixes option (to use @apply detection) or specify your ` +
          `prefixes: ['tw:']\n`,
      );
    }

    /**
     * Duplicate analog() registrations are a real bug for the non-SSR/client
     * build because each plugin instance creates its own component-style state.
     *
     * That state includes the style maps/registries used to:
     * - track transformed component styles
     * - map owner components back to stylesheet requests
     * - coordinate Tailwind/@reference processing and style reload behavior
     *
     * If two plugin instances are active for the same client build, one
     * instance can record stylesheet metadata while the other services the
     * request. The result is "missing" component CSS even though compilation
     * appeared to succeed.
     *
     * SSR is different. Analog's Nitro/SSR build path reuses the already
     * resolved plugin graph and then runs an additional `build.ssr === true`
     * pass for the server bundle. In that flow Vite can expose multiple
     * `@analogjs/vite-plugin-angular` entries in `config.plugins`, but that is
     * not the same failure mode as a duplicated client build. The server build
     * does not rely on the client-side style maps that this guard is protecting.
     *
     * Because of that, we only throw for duplicate registrations on non-SSR
     * builds. Throwing during SSR would be a false positive that breaks valid
     * Analog SSR/Nitro builds.
     */
    const analogInstances = resolvedPlugins.filter(
      (p) => p.name === '@analogjs/vite-plugin-angular',
    );
    if (analogInstances.length > 1 && !config.build?.ssr) {
      throw new Error(
        `${PREFIX} analog() is registered ${analogInstances.length} times. ` +
          `Each instance creates separate style maps, causing component ` +
          `styles to be lost. Remove duplicate registrations.`,
      );
    }

    // rootStylesheet content must contain @import "tailwindcss"
    if (existsSync(tw.rootStylesheet)) {
      try {
        const rootContent = readFileSync(tw.rootStylesheet, 'utf-8');
        if (
          !rootContent.includes('@import "tailwindcss"') &&
          !rootContent.includes("@import 'tailwindcss'")
        ) {
          console.warn(
            `${PREFIX} tailwindCss.rootStylesheet does not contain ` +
              `@import "tailwindcss". The @reference directive will ` +
              `point to a file without Tailwind configuration.\n\n` +
              `  File: ${tw.rootStylesheet}\n`,
          );
        }
      } catch {
        // Silently skip — existence check already warned in buildStylePreprocessor.
      }
    }
  }

  function isLikelyPageOnlyComponent(id: string): boolean {
    return (
      id.includes('/pages/') ||
      /\.page\.[cm]?[jt]sx?$/i.test(id) ||
      /\([^/]+\)\.page\.[cm]?[jt]sx?$/i.test(id)
    );
  }

  function removeActiveGraphMetadata(file: string) {
    const previous = activeGraphComponentMetadata.get(file);
    if (!previous) {
      return;
    }

    for (const record of previous) {
      const location = `${record.file}#${record.className}`;
      if (record.selector) {
        const selectorSet = selectorOwners.get(record.selector);
        selectorSet?.delete(location);
        if (selectorSet?.size === 0) {
          selectorOwners.delete(record.selector);
        }
      }

      const classNameSet = classNameOwners.get(record.className);
      classNameSet?.delete(location);
      if (classNameSet?.size === 0) {
        classNameOwners.delete(record.className);
      }
    }

    activeGraphComponentMetadata.delete(file);
  }

  function registerActiveGraphMetadata(
    file: string,
    records: ActiveGraphComponentRecord[],
  ) {
    removeActiveGraphMetadata(file);

    if (records.length === 0) {
      return;
    }

    activeGraphComponentMetadata.set(file, records);

    for (const record of records) {
      const location = `${record.file}#${record.className}`;

      if (record.selector) {
        let selectorSet = selectorOwners.get(record.selector);
        if (!selectorSet) {
          selectorSet = new Set<string>();
          selectorOwners.set(record.selector, selectorSet);
        }
        selectorSet.add(location);
      }

      let classNameSet = classNameOwners.get(record.className);
      if (!classNameSet) {
        classNameSet = new Set<string>();
        classNameOwners.set(record.className, classNameSet);
      }
      classNameSet.add(location);
    }
  }

  function removeStyleOwnerMetadata(file: string) {
    const previous = transformedStyleOwnerMetadata.get(file);
    if (!previous) {
      return;
    }

    for (const record of previous) {
      const owners = styleSourceOwners.get(record.sourcePath);
      owners?.delete(record.ownerFile);
      if (owners?.size === 0) {
        styleSourceOwners.delete(record.sourcePath);
      }
    }

    transformedStyleOwnerMetadata.delete(file);
  }

  function registerStyleOwnerMetadata(file: string, styleUrls: string[]) {
    removeStyleOwnerMetadata(file);

    const records = styleUrls
      .map((urlSet) => {
        const [, absoluteFileUrl] = urlSet.split('|');
        return absoluteFileUrl
          ? {
              ownerFile: file,
              sourcePath: normalizePath(absoluteFileUrl),
            }
          : undefined;
      })
      .filter((record): record is StyleOwnerRecord => !!record);

    if (records.length === 0) {
      return;
    }

    transformedStyleOwnerMetadata.set(file, records);

    for (const record of records) {
      let owners = styleSourceOwners.get(record.sourcePath);
      if (!owners) {
        owners = new Set<string>();
        styleSourceOwners.set(record.sourcePath, owners);
      }
      owners.add(record.ownerFile);
    }
  }

  let stylesheetRegistry: AnalogStylesheetRegistry | undefined;
  const sourceFileCache: SourceFileCacheType = new SourceFileCache();
  const isTest = process.env['NODE_ENV'] === 'test' || !!process.env['VITEST'];
  const isVitestVscode = !!process.env['VITEST_VSCODE'];
  const isStackBlitz = !!process.versions['webcontainer'];
  const isAstroIntegration = process.env['ANALOG_ASTRO'] === 'true';

  const jit =
    typeof pluginOptions?.jit !== 'undefined' ? pluginOptions.jit : isTest;
  let viteServer: ViteDevServer | undefined;

  const styleUrlsResolver = new StyleUrlsResolver();
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
  // Persistent Angular Compilation API instance. Kept alive across rebuilds so
  // Angular can diff previous state and emit `templateUpdates` for HMR.
  // Previously the compilation was recreated on every pass, which meant Angular
  // never had prior state and could never produce HMR payloads.
  let angularCompilation:
    | Awaited<ReturnType<typeof createAngularCompilationType>>
    | undefined;

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

    // HMR and fileReplacements guards were previously here and forced
    // both options off when useAngularCompilationAPI was enabled. Those guards
    // have been removed because:
    //  - HMR: the persistent compilation instance (above) now gives
    //    Angular the prior state it needs to emit `templateUpdates` for HMR
    //  - fileReplacements: Angular's AngularHostOptions already accepts a
    //    `fileReplacements` record — we now convert and pass it through in
    //    `performAngularCompilation` via `toAngularCompilationFileReplacements`
    if (pluginOptions.useAngularCompilationAPI) {
      if (angularFullVersion < 200100) {
        pluginOptions.useAngularCompilationAPI = false;
        debugCompilationApi(
          'disabled: Angular version %s < 20.1',
          angularFullVersion,
        );
        console.warn(
          '[@analogjs/vite-plugin-angular]: The Angular Compilation API is only available with Angular v20.1 and later',
        );
      } else {
        debugCompilationApi('enabled (Angular %s)', angularFullVersion);
      }
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

        const esbuild = pluginOptions.useAngularCompilationAPI
          ? undefined
          : (config.esbuild ?? false);
        const oxc = pluginOptions.useAngularCompilationAPI
          ? undefined
          : (config.oxc ?? false);
        if (pluginOptions.useAngularCompilationAPI) {
          debugCompilationApi(
            'esbuild/oxc disabled, Angular handles transforms',
          );
        }

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
          resolve: {
            conditions: [
              'style',
              ...(config.resolve?.conditions || defaultClientConditions),
            ],
          },
        };
      },
      configResolved(config) {
        resolvedConfig = config;

        if (pluginOptions.hasTailwindCss) {
          validateTailwindConfig(config, watchMode);
        }

        if (pluginOptions.useAngularCompilationAPI) {
          stylesheetRegistry = new AnalogStylesheetRegistry();
          configureStylePipelineRegistry(
            pluginOptions.stylePipeline,
            stylesheetRegistry,
            {
              workspaceRoot: pluginOptions.workspaceRoot,
            },
          );
          debugStyles(
            'stylesheet registry initialized (Angular Compilation API)',
          );
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
            removeActiveGraphMetadata,
            removeStyleOwnerMetadata,
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
          if (/\.(css|less|sass|scss)$/.test(ctx.file)) {
            refreshStylesheetRegistryForFile(
              ctx.file,
              stylesheetRegistry,
              pluginOptions.stylePreprocessor,
            );
          }
          if (
            /\.(css|less|sass|scss)$/.test(ctx.file) &&
            existsSync(ctx.file)
          ) {
            try {
              const rawResource = readFileSync(ctx.file, 'utf-8');
              debugHmrV('resource source snapshot', {
                file: ctx.file,
                mtimeMs: safeStatMtimeMs(ctx.file),
                ...describeStylesheetContent(rawResource),
              });
            } catch (error) {
              debugHmrV('resource source snapshot failed', {
                file: ctx.file,
                error: String(error),
              });
            }
          }
          // Angular component resources frequently enter HMR with incomplete
          // watcher context. In practice `ctx.modules` may only contain the
          // source file, only the `?direct` module, or nothing at all after a
          // TS-driven component refresh. Resolve the full live module set from
          // Vite's module graph and our stylesheet registry before deciding how
          // to hot update the resource.
          const fileModules = await getModulesForChangedFile(
            ctx.server,
            ctx.file,
            ctx.modules,
            stylesheetRegistry,
          );
          debugHmrV('resource modules resolved', {
            file: ctx.file,
            eventModuleCount: ctx.modules.length,
            fileModuleCount: fileModules.length,
            modules: fileModules.map((mod) => ({
              id: mod.id,
              file: mod.file,
              type: mod.type,
              url: mod.url,
            })),
          });
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
        if (
          id.startsWith(VIRTUAL_STYLE_PREFIX) ||
          id.startsWith(VIRTUAL_RAW_PREFIX)
        ) {
          return `\0${id}`;
        }

        if (jit && id.startsWith('angular:jit:')) {
          const path = id.split(';')[1];
          const resolved = normalizePath(
            resolve(dirname(importer as string), path),
          );
          if (id.includes(':style')) {
            return toVirtualStyleId(resolved);
          }
          return toVirtualRawId(resolved);
        }

        // Intercept .html?raw imports to bypass Vite server.fs restrictions
        if (id.includes('.html?raw')) {
          const filePath = id.split('?')[0];
          const resolved = isAbsolute(filePath)
            ? normalizePath(filePath)
            : importer
              ? normalizePath(resolve(dirname(importer), filePath))
              : undefined;
          if (resolved) {
            return toVirtualRawId(resolved);
          }
        }

        // Intercept style ?inline imports to bypass Vite server.fs restrictions
        if (/\.(css|scss|sass|less)\?inline$/.test(id)) {
          const filePath = id.split('?')[0];
          const resolved = isAbsolute(filePath)
            ? normalizePath(filePath)
            : importer
              ? normalizePath(resolve(dirname(importer), filePath))
              : undefined;
          if (resolved) {
            return toVirtualStyleId(resolved);
          }
        }

        // Map angular component stylesheets. Prefer registry-served CSS
        // (preprocessed, with @reference) over external raw file mappings.
        if (isComponentStyleSheet(id)) {
          const filename = getFilenameFromPath(id);

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
        // Both virtual raw (templates) and virtual style (external styles)
        // ids come in from two paths: the transform-time substitution below
        // (dev + production) and the resolveId rewrite for user `.html?raw`
        // / `.scss?inline` imports. The virtual ids carry no file extension,
        // so Vite's built-in asset/CSS plugins never pick them up and we
        // never see the Denied ID check that blocks `?raw`/`?inline`.
        // (#2263, #2283)
        const styleModule = await loadVirtualStyleModule(
          this,
          id,
          resolvedConfig,
        );
        if (styleModule !== undefined) return styleModule;

        const rawModule = await loadVirtualRawModule(this, id);
        if (rawModule !== undefined) return rawModule;

        // Vitest fallback: the module-runner calls ensureEntryFromUrl before
        // transformRequest, which skips pluginContainer.resolveId entirely,
        // so a user `import foo from './a.scss?inline'` reaches load as the
        // bare query form. Handle it here so tests still resolve.
        if (/\.(css|scss|sass|less)\?inline$/.test(id)) {
          const filePath = id.split('?')[0];
          const code = await fsPromises.readFile(filePath, 'utf-8');
          // In tests, mirror Vitest's `test.css` rules — defaults to no
          // preprocessing (matches Vite's CSS pipeline behavior). (#2297)
          if (!shouldPreprocessTestCss(resolvedConfig, filePath)) {
            return `export default ${JSON.stringify(code)}`;
          }
          const result = await preprocessCSS(code, filePath, resolvedConfig);
          return `export default ${JSON.stringify(result.code)}`;
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
                ),
              trackedRequestIds:
                stylesheetRegistry?.getRequestIdsForSource(
                  stylesheetRegistry?.resolveExternalSource(filename) ??
                    stylesheetRegistry?.resolveExternalSource(
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

          if (pluginOptions.useAngularCompilationAPI) {
            const isAngular =
              /(Component|Directive|Pipe|Injectable|NgModule)\(/.test(code);

            if (!isAngular) {
              debugCompilationApi('transform skip (non-Angular file)', { id });
              return;
            }
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

          // Detect whether the source still contains a raw Angular
          // `@Component` decorator.
          //
          // With `useAngularCompilationAPI`, Angular compiles TypeScript before
          // this Vite hook runs, so real component files reach this point with
          // `ɵɵdefineComponent()` output instead of `@Component(...)`. In that
          // mode, `hasComponent === false` is expected.
          //
          // Value: this comment explains why the transform hook intentionally
          // stops using decorator detection as a signal for Compilation API
          // builds.
          //
          // Effect: external template/style files are no longer registered via
          // `addWatchFile()` on this path, so those edits may fall back to full
          // reload more often. Angular's own invalidation still handles
          // recompilation correctly.
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

            // Emit safe resource ids directly in the transformed JS so Vite
            // never sees the dangerous ?raw / ?inline form during
            // loadAndTransform. Both templates and external styles use
            // virtual module ids with no file extension so neither the
            // vite:css plugin nor the vite:asset plugin picks them up
            // based on the extension.
            //
            // Why this matters: Vite's Denied ID check fires for any id
            // matching that regex whose path is outside server.fs.allow,
            // and it runs *before* pluginContainer.load. Vitest's worker
            // fetchModule path also bypasses pluginContainer.resolveId
            // (it calls moduleGraph.ensureEntryFromUrl first, which makes
            // the resolveId chain a no-op for the module-runner). So
            // neither the resolveId-based rewrites nor the load-hook
            // fallback (added in 2.4.4) get a chance to run for
            // cross-library imports — the security check has already thrown
            // by then. Emitting the safe ids directly in transform is the
            // only place we can guarantee Vite never sees the dangerous
            // form. (#2263)
            templateUrls.forEach((templateUrlSet) => {
              const [templateFile, resolvedTemplateUrl] =
                templateUrlSet.split('|');
              data = data.replace(
                `angular:jit:template:file;${templateFile}`,
                toVirtualRawId(resolvedTemplateUrl),
              );
            });

            styleUrls.forEach((styleUrlSet) => {
              const [styleFile, resolvedStyleUrl] = styleUrlSet.split('|');
              data = data.replace(
                `angular:jit:style:file;${styleFile}`,
                toVirtualStyleId(resolvedStyleUrl),
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
        // Tear down the persistent compilation instance at end of build so it
        // does not leak memory across unrelated Vite invocations.
        angularCompilation?.close?.();
        angularCompilation = undefined;
      },
    };
  }

  const compilationPlugin = pluginOptions.fastCompile
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
    {
      name: '@analogjs/vite-plugin-angular:template-class-binding-guard',
      enforce: 'pre',
      transform(code: string, id: string) {
        if (id.includes('node_modules')) {
          return;
        }

        const cleanId = id.split('?')[0];

        if (/\.(html|htm)$/i.test(cleanId)) {
          const staticClassIssue =
            findStaticClassAndBoundClassConflicts(code)[0];
          if (staticClassIssue) {
            throwTemplateClassBindingConflict(cleanId, staticClassIssue);
          }

          const mixedClassIssue = findBoundClassAndNgClassConflicts(code)[0];
          if (mixedClassIssue) {
            this.warn(
              [
                '[Analog Angular] Conflicting class composition.',
                `File: ${cleanId}:${mixedClassIssue.line}:${mixedClassIssue.column}`,
                'This element mixes `[class]` and `[ngClass]`.',
                'Prefer a single class-binding strategy so class merging stays predictable.',
                'Use one `[ngClass]` expression or explicit `[class.foo]` bindings.',
                `Snippet: ${mixedClassIssue.snippet}`,
              ].join('\n'),
            );
          }
          return;
        }

        if (TS_EXT_REGEX.test(cleanId)) {
          const rawStyleUrls = styleUrlsResolver.resolve(code, cleanId);
          registerStyleOwnerMetadata(cleanId, rawStyleUrls);
          debugHmrV('component stylesheet owner metadata registered', {
            file: cleanId,
            styleUrlCount: rawStyleUrls.length,
            styleUrls: rawStyleUrls,
            ownerSources: [
              ...(transformedStyleOwnerMetadata
                .get(cleanId)
                ?.map((record) => record.sourcePath) ?? []),
            ],
          });

          // Parse raw component decorators before Angular compilation strips
          // them. This lets Analog fail fast on template/class-footguns and
          // keep a lightweight active-graph index for duplicate selector/class
          // diagnostics without requiring a full compiler pass first.
          const components = getAngularComponentMetadata(code);

          const inlineTemplateIssue = components.flatMap((component) =>
            component.inlineTemplates.flatMap((template) =>
              findStaticClassAndBoundClassConflicts(template),
            ),
          )[0];

          if (inlineTemplateIssue) {
            throwTemplateClassBindingConflict(cleanId, inlineTemplateIssue);
          }

          const mixedInlineClassIssue = components.flatMap((component) =>
            component.inlineTemplates.flatMap((template) =>
              findBoundClassAndNgClassConflicts(template),
            ),
          )[0];

          if (mixedInlineClassIssue) {
            this.warn(
              [
                '[Analog Angular] Conflicting class composition.',
                `File: ${cleanId}:${mixedInlineClassIssue.line}:${mixedInlineClassIssue.column}`,
                'This element mixes `[class]` and `[ngClass]`.',
                'Prefer a single class-binding strategy so class merging stays predictable.',
                'Use one `[ngClass]` expression or explicit `[class.foo]` bindings.',
                `Snippet: ${mixedInlineClassIssue.snippet}`,
              ].join('\n'),
            );
          }

          const activeGraphRecords = components.map((component) => ({
            file: cleanId,
            className: component.className,
            selector: component.selector,
          }));

          registerActiveGraphMetadata(cleanId, activeGraphRecords);

          for (const component of components) {
            if (!component.selector && !isLikelyPageOnlyComponent(cleanId)) {
              throw new Error(
                [
                  '[Analog Angular] Selectorless component detected.',
                  `File: ${cleanId}`,
                  `Component: ${component.className}`,
                  'This component has no `selector`, so Angular will render it as `ng-component`.',
                  'That increases the chance of component ID collisions and makes diagnostics harder to interpret.',
                  'Add an explicit selector for reusable components.',
                  'Selectorless components are only supported for page and route-only files.',
                ].join('\n'),
              );
            }

            if (component.selector) {
              const selectorEntries = selectorOwners.get(component.selector);
              if (selectorEntries && selectorEntries.size > 1) {
                throw new Error(
                  [
                    '[Analog Angular] Duplicate component selector detected.',
                    `Selector: ${component.selector}`,
                    'Multiple components in the active application graph use the same selector.',
                    'Selectors must be unique within the active graph to avoid ambiguous rendering and confusing diagnostics.',
                    `Locations:\n${formatActiveGraphLocations(selectorEntries)}`,
                  ].join('\n'),
                );
              }
            }

            const classNameEntries = classNameOwners.get(component.className);
            if (classNameEntries && classNameEntries.size > 1) {
              this.warn(
                [
                  '[Analog Angular] Duplicate component class name detected.',
                  `Class name: ${component.className}`,
                  'Two or more Angular components in the active graph share the same exported class name.',
                  'Rename one of them to keep HMR, stack traces, and compiler diagnostics unambiguous.',
                  `Locations:\n${formatActiveGraphLocations(classNameEntries)}`,
                ].join('\n'),
              );
            }
          }
        }
      },
    } satisfies Plugin,
    // Tailwind CSS v4 @reference injection for direct-file-loaded CSS.
    // Catches CSS files loaded from disk (not virtual modules) that need
    // @reference before @tailwindcss/vite processes them.
    pluginOptions.hasTailwindCss &&
      ({
        name: '@analogjs/vite-plugin-angular:tailwind-reference',
        enforce: 'pre',
        transform(code: string, id: string) {
          const tw = pluginOptions.tailwindCss;
          if (!tw || !id.includes('.css')) return;

          const cleanId = id.split('?')[0];
          if (cleanId === tw.rootStylesheet) return;

          const directiveState = inspectCssTailwindDirectives(code);

          if (
            directiveState.hasReferenceDirective ||
            directiveState.hasTailwindImportDirective
          ) {
            return;
          }

          // Skip entry stylesheets that @import the root config
          const rootBasename = basename(tw.rootStylesheet);
          if (directiveState.commentlessCode.includes(rootBasename)) return;

          const prefixes = tw.prefixes;
          const needsRef = prefixes
            ? prefixes.some((p) => directiveState.commentlessCode.includes(p))
            : directiveState.commentlessCode.includes('@apply');

          if (needsRef && directiveState.hasReferenceText) {
            throwTailwindReferenceTextError(id, tw.rootStylesheet);
          }

          if (needsRef) {
            debugTailwind('injected @reference via pre-transform', {
              id: id.split('/').slice(-2).join('/'),
            });
            return `@reference "${tw.rootStylesheet.replace(/\\/g, '/')}";\n${code}`;
          }
        },
      } satisfies Plugin),
    angularPlugin(),
    pluginOptions.liveReload && liveReloadPlugin({ classNames, fileEmitter }),
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
    // Encapsulation runs in enforce: 'post' so that @tailwindcss/vite
    // (enforce: 'pre') fully resolves @apply directives — including those
    // inside :host {} — before Angular's ShadowCss rewrites selectors.
    // Previously this ran in the main plugin's normal-phase transform,
    // which could race with @tailwindcss/vite depending on plugin
    // registration order. (#2293)
    {
      name: '@analogjs/vite-plugin-angular:encapsulation',
      enforce: 'post',
      transform(code: string, id: string) {
        if (shouldExternalizeStyles() && isComponentStyleSheet(id)) {
          const { encapsulation, componentId } = getComponentStyleSheetMeta(id);
          if (encapsulation === 'emulated' && componentId) {
            debugStylesV('applying emulated view encapsulation (post)', {
              stylesheet: id.split('?')[0],
              componentId,
            });
            const encapsulated = ngCompiler.encapsulateStyle(code, componentId);
            return {
              code: encapsulated,
              map: null,
            };
          }
        }
      },
    } satisfies Plugin,
  ].filter(Boolean) as Plugin[];

  function findIncludes() {
    // Map include patterns to absolute workspace paths
    const globs = pluginOptions.include.map((glob) =>
      normalizeIncludeGlob(pluginOptions.workspaceRoot, glob),
    );

    // Discover TypeScript files using tinyglobby
    const files = globSync(globs, {
      dot: true,
      absolute: true,
    });

    debugEmit('include discovery', {
      patternCount: globs.length,
      fileCount: files.length,
    });
    debugEmitV('include discovery files', {
      globs,
      files: files.map((file) => normalizePath(file)),
    });

    return files;
  }

  function ensureIncludeCache(): string[] {
    if (pluginOptions.include.length > 0 && includeCache.length === 0) {
      includeCache = findIncludes();
      debugEmit('include cache populated', {
        fileCount: includeCache.length,
      });
    }

    return includeCache;
  }

  function getTsconfigCacheKey(
    resolvedTsConfigPath: string,
    config: ResolvedConfig,
  ): string {
    const isProd = config.mode === 'production';

    return [
      resolvedTsConfigPath,
      isProd ? 'prod' : 'dev',
      isTest ? 'test' : 'app',
      config.build?.lib ? 'lib' : 'nolib',
      pluginOptions.liveReload ? 'live-reload' : 'no-live-reload',
      pluginOptions.hasTailwindCss ? 'tw' : 'notw',
    ].join('|');
  }

  function readAngularTsconfigConfiguration(
    resolvedTsConfigPath: string,
    config: ResolvedConfig,
  ) {
    const isProd = config.mode === 'production';
    return compilerCli.readConfiguration(resolvedTsConfigPath, {
      suppressOutputPathCheck: true,
      outDir: undefined,
      sourceMap: false,
      inlineSourceMap: !isProd,
      inlineSources: !isProd,
      declaration: false,
      declarationMap: false,
      allowEmptyCodegenFiles: false,
      annotationsAs: 'decorators',
      enableResourceInlining: false,
      noEmitOnError: false,
      mapRoot: undefined,
      sourceRoot: undefined,
      supportTestBed: false,
      supportJitMode: false,
    });
  }

  function getCachedTsconfigOptions(
    resolvedTsConfigPath: string,
    config: ResolvedConfig,
  ): { options: ts.CompilerOptions; rootNames: string[] } {
    const tsconfigKey = getTsconfigCacheKey(resolvedTsConfigPath, config);
    let cached = tsconfigOptionsCache.get(tsconfigKey);

    if (!cached) {
      const read = readAngularTsconfigConfiguration(
        resolvedTsConfigPath,
        config,
      );
      cached = { options: read.options, rootNames: read.rootNames };
      tsconfigOptionsCache.set(tsconfigKey, cached);
      debugEmit('tsconfig root names loaded', {
        resolvedTsConfigPath,
        rootNameCount: read.rootNames.length,
      });
      debugEmitV('tsconfig root names', {
        resolvedTsConfigPath,
        rootNames: read.rootNames.map((file) => normalizePath(file)),
      });
    }

    return cached;
  }

  function resolveReferenceTsconfigPath(
    referencePath: string,
    ownerTsconfigPath: string,
  ): string | undefined {
    const ownerDir = dirname(ownerTsconfigPath);
    const resolvedReference = normalizePath(
      isAbsolute(referencePath)
        ? referencePath
        : resolve(ownerDir, referencePath),
    );

    if (existsSync(resolvedReference)) {
      try {
        if (statSync(resolvedReference).isDirectory()) {
          const nestedTsconfig = join(resolvedReference, 'tsconfig.json');
          return existsSync(nestedTsconfig)
            ? normalizePath(nestedTsconfig)
            : undefined;
        }
      } catch {
        return undefined;
      }

      return resolvedReference;
    }

    if (!resolvedReference.endsWith('.json')) {
      const asJson = `${resolvedReference}.json`;
      if (existsSync(asJson)) {
        return normalizePath(asJson);
      }

      const nestedTsconfig = join(resolvedReference, 'tsconfig.json');
      if (existsSync(nestedTsconfig)) {
        return normalizePath(nestedTsconfig);
      }
    }

    return undefined;
  }

  function collectTsconfigPathRoots(
    resolvedTsConfigPath: string,
    options: ts.CompilerOptions,
    rawTsconfig: {
      compilerOptions?: {
        baseUrl?: unknown;
        paths?: Record<string, string[]>;
      };
    },
  ): string[] {
    const tsPaths = rawTsconfig.compilerOptions?.paths ?? options.paths;
    if (!tsPaths) {
      return [];
    }

    const tsconfigDir = dirname(resolvedTsConfigPath);
    const configuredBaseUrl =
      typeof options.baseUrl === 'string'
        ? options.baseUrl
        : typeof rawTsconfig.compilerOptions?.baseUrl === 'string'
          ? rawTsconfig.compilerOptions.baseUrl
          : undefined;
    const resolvedBaseUrl = configuredBaseUrl
      ? isAbsolute(configuredBaseUrl)
        ? configuredBaseUrl
        : resolve(tsconfigDir, configuredBaseUrl)
      : tsconfigDir;
    const discoveredRoots = new Set<string>();
    const addDiscoveredFiles = (pattern: string) => {
      for (const match of globSync(pattern, {
        dot: true,
        absolute: true,
        onlyFiles: true,
      })) {
        discoveredRoots.add(normalizePath(match));
      }
    };

    for (const targets of Object.values(tsPaths)) {
      for (const target of targets) {
        const resolvedTarget = normalizePath(
          isAbsolute(target) ? target : resolve(resolvedBaseUrl, target),
        );

        if (target.includes('*')) {
          addDiscoveredFiles(resolvedTarget);
          continue;
        }

        if (existsSync(resolvedTarget)) {
          if (statSync(resolvedTarget).isDirectory()) {
            addDiscoveredFiles(
              normalizePath(join(resolvedTarget, '**/*.{ts,tsx,js,jsx}')),
            );
          } else {
            discoveredRoots.add(normalizePath(resolvedTarget));
          }
        }
      }
    }

    return [...discoveredRoots];
  }

  function collectExpandedTsconfigRoots(
    resolvedTsConfigPath: string,
    config: ResolvedConfig,
    visited = new Set<string>(),
  ): string[] {
    const normalizedTsConfigPath = normalizePath(resolvedTsConfigPath);
    if (visited.has(normalizedTsConfigPath)) {
      return [];
    }

    const tsconfigKey = `${getTsconfigCacheKey(normalizedTsConfigPath, config)}|graph`;
    const cached = tsconfigGraphRootCache.get(tsconfigKey);
    if (cached) {
      return cached;
    }

    visited.add(normalizedTsConfigPath);

    const read = readAngularTsconfigConfiguration(
      normalizedTsConfigPath,
      config,
    );
    const rawTsconfig = (ts.readConfigFile(
      normalizedTsConfigPath,
      ts.sys.readFile,
    ).config ?? {}) as {
      compilerOptions?: {
        baseUrl?: unknown;
        paths?: Record<string, string[]>;
      };
      references?: Array<{ path?: unknown }>;
    };

    const expandedRoots = new Set(
      read.rootNames.map((file) => normalizePath(file)),
    );
    const pathRoots = collectTsconfigPathRoots(
      normalizedTsConfigPath,
      read.options,
      rawTsconfig,
    );
    for (const pathRoot of pathRoots) {
      expandedRoots.add(pathRoot);
    }

    const referenceConfigs = (rawTsconfig.references ?? [])
      .flatMap((reference) =>
        typeof reference.path === 'string'
          ? [
              resolveReferenceTsconfigPath(
                reference.path,
                normalizedTsConfigPath,
              ),
            ]
          : [],
      )
      .filter((reference): reference is string => !!reference);

    for (const referenceConfig of referenceConfigs) {
      for (const referenceRoot of collectExpandedTsconfigRoots(
        referenceConfig,
        config,
        visited,
      )) {
        expandedRoots.add(referenceRoot);
      }
    }

    const expandedRootList = [...expandedRoots];
    tsconfigGraphRootCache.set(tsconfigKey, expandedRootList);
    debugEmit('expanded tsconfig graph roots', {
      resolvedTsConfigPath: normalizedTsConfigPath,
      directRootNameCount: read.rootNames.length,
      pathRootCount: pathRoots.length,
      referenceConfigCount: referenceConfigs.length,
      expandedRootCount: expandedRootList.length,
    });
    debugEmitV('expanded tsconfig graph root files', {
      resolvedTsConfigPath: normalizedTsConfigPath,
      pathRoots,
      referenceConfigs,
      rootNames: expandedRootList,
    });

    return expandedRootList;
  }

  function resolveCompilationApiTsConfigPath(
    resolvedTsConfigPath: string,
    config: ResolvedConfig,
  ): string {
    // Angular's Compilation API accepts one tsconfig path. When Analog needs
    // extra roots beyond the app tsconfig's direct rootNames, emit a tiny
    // wrapper config that extends the user's tsconfig and enumerates the
    // merged root set.
    //
    // Value: workspace sources discovered through Analog `include`, tsconfig
    // `references`, and explicit `compilerOptions.paths` entry points all land
    // in Angular's program without asking users to hand-maintain a duplicate
    // debug tsconfig.
    const includedFiles = ensureIncludeCache();
    const cached = getCachedTsconfigOptions(resolvedTsConfigPath, config);
    const expandedGraphRoots = collectExpandedTsconfigRoots(
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
    // TypeScript does not inherit top-level `references` through `extends`, so
    // carry them forward explicitly when Analog emits a wrapper tsconfig.
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
    debugEmit('wrapper tsconfig root merge', {
      originalTsconfig: resolvedTsConfigPath,
      wrapperTsconfig: wrapperPath,
      baseRootNameCount: cached.rootNames.length,
      expandedGraphRootCount: expandedGraphRoots.length,
      includeCount: includedFiles.length,
      mergedRootNameCount: mergedRootNames.length,
      referenceCount: rawTsconfig.references?.length ?? 0,
    });
    debugEmitV('wrapper tsconfig root names', {
      wrapperTsconfig: wrapperPath,
      rootNames: mergedRootNames,
    });

    return wrapperPath;
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

  /**
   * Perform compilation using Angular's private Compilation API.
   *
   * Key differences from the standard `performCompilation` path:
   *  1. The compilation instance is reused across rebuilds (nullish-coalescing
   *     assignment below) so Angular retains prior state and can diff it to
   *     produce `templateUpdates` for HMR.
   *  2. `ids` (modified files) are forwarded to both the source-file cache and
   *     `angularCompilation.update()` so that incremental re-analysis is
   *     scoped to what actually changed.
   *  3. `fileReplacements` are converted and passed into Angular's host via
   *     `toAngularCompilationFileReplacements`.
   *  4. `templateUpdates` from the compilation result are mapped back to
   *     file-level HMR metadata (`hmrUpdateCode`, `hmrEligible`, `classNames`).
   */
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
    // Notify Angular of modified files before re-initialization so it can
    // scope its incremental analysis.
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
        // Convert Analog's browser-style `{ replace, with }` entries into the
        // `Record<string, string>` shape that Angular's AngularHostOptions
        // expects. SSR-only replacements (`{ replace, ssr }`) are intentionally
        // excluded — they stay on the Vite runtime side.
        fileReplacements: toAngularCompilationFileReplacements(
          pluginOptions.fileReplacements,
          pluginOptions.workspaceRoot,
        ),
        modifiedFiles,
        async transformStylesheet(
          data,
          containingFile,
          resourceFile,
          order,
          className,
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

          // Populate classNames during initial compilation so HMR for
          // HTML template changes can find the parent TS module.
          if (shouldEnableLiveReload() && className && containingFile) {
            classNames.set(normalizePath(containingFile), className as string);
          }

          if (shouldExternalizeStyles()) {
            // Store preprocessed CSS so Vite's serve-time pipeline handles
            // PostCSS / Tailwind processing when the load hook returns it.
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
            debugStylesV('stylesheet deferred content snapshot', {
              stylesheetId,
              filename,
              resourceFile: resourceFile ?? '(inline)',
              dependencies: preprocessed.dependencies,
              diagnostics: preprocessed.diagnostics,
              tags: preprocessed.tags,
              ...describeStylesheetContent(preprocessed.code),
            });

            return stylesheetId;
          }

          // Non-externalized: CSS is returned directly to the Angular compiler
          // and never re-enters Vite's pipeline, so run preprocessCSS() eagerly.
          debugStyles('stylesheet processed inline via preprocessCSS', {
            filename,
            resourceFile: resourceFile ?? '(inline)',
            dataLength: preprocessed.code.length,
          });
          // In tests, mirror Vitest's `test.css` rules — defaults to no
          // preprocessing (matches Vite's CSS pipeline behavior). (#2297)
          if (!shouldPreprocessTestCss(resolvedConfig, filename)) {
            return '';
          }

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
        processWebWorker(workerFile, containingFile) {
          return '';
        },
      },
      (tsCompilerOptions) => {
        if (shouldExternalizeStyles()) {
          tsCompilerOptions['externalRuntimeStyles'] = true;
        }

        if (shouldEnableLiveReload()) {
          tsCompilerOptions['_enableHmr'] = true;
          // Workaround for https://github.com/angular/angular/issues/59310
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

        if (tsCompilerOptions.compilationMode === 'partial') {
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

        return tsCompilerOptions;
      },
    );
    // -------------------------------------------------------------------
    // Preprocess external stylesheets for Tailwind CSS @reference
    //
    // Angular's Compilation API with externalRuntimeStyles does NOT call
    // transformStylesheet for external styleUrls (files referenced via
    // `styleUrls: ['./foo.component.css']`). Angular's angular-host.js
    // asserts this explicitly:
    //
    //   assert(!resourceFile || !hostOptions.externalStylesheets?.has(resourceFile),
    //     'External runtime stylesheets should not be transformed')
    //
    // Only inline styles (`styles: [...]`) go through transformStylesheet,
    // which is where buildStylePreprocessor injects `@reference` for
    // Tailwind CSS. External component CSS files are instead reported in
    // compilationResult.externalStylesheets as Map<absolutePath, sha256Hash>.
    //
    // Without intervention, the resolveId hook maps Angular's hash to the
    // raw file path, the load hook reads the raw file from disk, and
    // @tailwindcss/vite processes CSS without @reference — causing:
    //
    //   "Cannot apply utility class 'sa:grid' because the 'sa'
    //    variant does not exist"
    //
    // Fix: for each external stylesheet, read the file from disk, run the
    // style preprocessor (which injects @reference), and store the result
    // in the stylesheet registry under Angular's hash. The resolveId hook
    // then finds it on the first lookup, the load hook serves the
    // @reference-injected version, and @tailwindcss/vite compiles correctly.
    // -------------------------------------------------------------------
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

      // Read the raw CSS file from disk, run the style preprocessor
      // (which injects @reference for Tailwind), and store the result
      // in the stylesheet registry under Angular's hash. This way
      // resolveId finds the preprocessed version on the first lookup
      // and the load hook serves CSS that @tailwindcss/vite can compile.
      //
      // After preprocessing, resolve relative @import paths to absolute
      // paths. When @tailwindcss/vite processes the CSS, the virtual
      // hash-based module ID has no meaningful directory, so relative
      // imports like `@import './submenu/submenu.component.css'` would
      // fail to resolve from `/`. Converting to absolute paths ensures
      // Tailwind's enhanced-resolve can find the imported files.
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
          debugStylesV('external stylesheet raw snapshot', {
            angularHash,
            resolvedPath: key,
            mtimeMs: safeStatMtimeMs(key),
            ...describeStylesheetContent(rawCss),
          });
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
            debugStylesV(
              'preprocessed external stylesheet for Tailwind @reference',
              {
                angularHash,
                resolvedPath: key,
                mtimeMs: safeStatMtimeMs(key),
                raw: describeStylesheetContent(rawCss),
                served: describeStylesheetContent(servedCss),
                dependencies: preprocessed.dependencies,
                diagnostics: preprocessed.diagnostics,
                tags: preprocessed.tags,
              },
            );
          } else {
            preprocessStats.skipped++;
            debugStylesV('external stylesheet unchanged after preprocessing', {
              angularHash,
              resolvedPath: key,
              mtimeMs: safeStatMtimeMs(key),
              raw: describeStylesheetContent(rawCss),
              served: describeStylesheetContent(servedCss),
              dependencies: preprocessed.dependencies,
              diagnostics: preprocessed.diagnostics,
              tags: preprocessed.tags,
              hint: 'Registry mapping is still registered so Angular component stylesheet HMR can track and refresh this file even when preprocessing makes no textual changes.',
            });
          }
        } catch (e) {
          preprocessStats.errors++;
          console.warn(
            `[@analogjs/vite-plugin-angular] failed to preprocess external stylesheet: ${key}: ${e}`,
          );
          // Non-fatal: fall through to the external source mapping which
          // serves the raw file. @tailwindcss/vite will still process
          // it but without @reference (Tailwind prefix utilities won't
          // resolve).
        }
      } else {
        preprocessStats.skipped++;
        debugStylesV('external stylesheet preprocessing skipped', {
          filename: angularHash,
          resolvedPath: key,
          reason: !stylesheetRegistry
            ? 'no stylesheetRegistry'
            : !pluginOptions.stylePreprocessor
              ? 'no stylePreprocessor'
              : 'file not found on disk',
        });
      }

      debugStylesV('external stylesheet registered for resolveId mapping', {
        filename: angularHash,
        resolvedPath: key,
      });
    }
    debugStyles('external stylesheet preprocessing complete', preprocessStats);

    const diagnostics = await compilation.diagnoseFiles(
      pluginOptions.disableTypeChecking
        ? DiagnosticModes.All & ~DiagnosticModes.Semantic
        : DiagnosticModes.All,
    );

    const errors = diagnostics.errors?.length ? diagnostics.errors : [];
    const warnings = diagnostics.warnings?.length ? diagnostics.warnings : [];
    debugEmit('compilation diagnostics', {
      errorCount: errors.length,
      warningCount: warnings.length,
    });
    // Angular encodes template updates as `encodedFilePath@ClassName` keys.
    // `mapTemplateUpdatesToFiles` decodes them back to absolute file paths so
    // we can attach HMR metadata to the correct `EmitFileResult` below.
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
    debugEmitV('emitAffectedFiles files', {
      files: affectedFiles.map((file) => normalizePath(file.filename)),
    });

    for (const file of affectedFiles) {
      const normalizedFilename = normalizePath(file.filename);
      const templateUpdate = templateUpdates.get(normalizedFilename);

      if (templateUpdate) {
        classNames.set(normalizedFilename, templateUpdate.className);
      }

      // Surface Angular's HMR payloads into Analog's existing live-reload
      // flow via the `hmrUpdateCode` / `hmrEligible` fields.
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
      debugEmitV('registered compilation API output', {
        filename: normalizedFilename,
        ...describeEmitMarkers(file.contents),
        hasTemplateUpdate: !!templateUpdate,
        errorCount: errors.length,
        warningCount: warnings.length,
        knownOutputCount: outputFiles.size,
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
    // Forward `ids` (modified files) so the Compilation API path can do
    // incremental re-analysis instead of a full recompile on every change.
    if (pluginOptions.useAngularCompilationAPI) {
      debugCompilationApi('using compilation API path', {
        modifiedFiles: ids?.length ?? 0,
      });
      await performAngularCompilation(config, ids);
      return;
    }

    const isProd = config.mode === 'production';
    const modifiedFiles = new Set<string>(ids ?? []);
    sourceFileCache.invalidate(modifiedFiles);

    if (ids?.length) {
      for (const id of ids || []) {
        fileTransformMap.delete(id);
      }
    }

    const resolvedTsConfigPath = resolveTsConfigPath();
    const cached = getCachedTsconfigOptions(resolvedTsConfigPath, config);

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
    rootNames = union(rootNames, ensureIncludeCache(), replacements);
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
 * Convert Analog/Angular CLI-style file replacements into the flat record
 * expected by `AngularHostOptions.fileReplacements`.
 *
 * Only browser replacements (`{ replace, with }`) are converted. SSR-only
 * replacements (`{ replace, ssr }`) are left for the Vite runtime plugin to
 * handle — they should not be baked into the Angular compilation host because
 * that would apply them to both browser and server builds.
 *
 * Relative paths are resolved against `workspaceRoot` so that the host
 * receives the same absolute paths it would get from the Angular CLI.
 */
export function toAngularCompilationFileReplacements(
  replacements: FileReplacement[],
  workspaceRoot: string,
): Record<string, string> | undefined {
  const mappedReplacements = replacements.flatMap((replacement) => {
    // Skip SSR-only entries — they use `ssr` instead of `with`.
    if (!('with' in replacement)) {
      return [];
    }

    return [
      [
        isAbsolute(replacement.replace)
          ? replacement.replace
          : resolve(workspaceRoot, replacement.replace),
        isAbsolute(replacement.with)
          ? replacement.with
          : resolve(workspaceRoot, replacement.with),
      ] as const,
    ];
  });

  return mappedReplacements.length
    ? Object.fromEntries(mappedReplacements)
    : undefined;
}

/**
 * Map Angular's `templateUpdates` (keyed by `encodedFilePath@ClassName`)
 * back to absolute file paths with their associated HMR code and component
 * class name.
 *
 * Angular's private Compilation API emits template update keys in the form
 * `encodeURIComponent(relativePath + '@' + className)`. We decode and resolve
 * them so the caller can look up updates by the same normalized absolute path
 * used elsewhere in the plugin (`outputFiles`, `classNames`, etc.).
 */
export function mapTemplateUpdatesToFiles(
  templateUpdates: ReadonlyMap<string, string> | undefined,
): Map<
  string,
  {
    className: string;
    code: string;
  }
> {
  const updatesByFile = new Map<string, { className: string; code: string }>();

  templateUpdates?.forEach((code, encodedUpdateId) => {
    const [file, className = ''] =
      decodeURIComponent(encodedUpdateId).split('@');
    const resolvedFile = normalizePath(resolve(process.cwd(), file));

    updatesByFile.set(resolvedFile, {
      className,
      code,
    });
  });

  return updatesByFile;
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
    stylesheetRegistry?.resolveExternalSource(requestPath.replace(/^\//, ''));

  return (
    normalizePath((sourcePath ?? '').split('?')[0]) === normalizedChangedFile
  );
}

function describeStylesheetContent(code: string): {
  length: number;
  digest: string;
  preview: string;
} {
  return {
    length: code.length,
    digest: createHash('sha256').update(code).digest('hex').slice(0, 12),
    preview: code.replace(/\s+/g, ' ').trim().slice(0, 160),
  };
}

function safeStatMtimeMs(file: string): number | undefined {
  try {
    return statSync(file).mtimeMs;
  } catch {
    return undefined;
  }
}

/**
 * Refreshes any already-served stylesheet records that map back to a changed
 * source file.
 *
 * This is the critical bridge for externalized Angular component styles during
 * HMR. Angular's resource watcher can notice that `/src/...component.css`
 * changed before Angular recompilation has had a chance to repopulate the
 * stylesheet registry. If we emit a CSS update against the existing virtual
 * stylesheet id without first refreshing the registry content, the browser gets
 * a hot update containing stale CSS. By rewriting the existing served records
 * from disk up front, HMR always pushes the latest source content.
 */
export function refreshStylesheetRegistryForFile(
  file: string,
  stylesheetRegistry?: AnalogStylesheetRegistry,
  stylePreprocessor?: StylePreprocessor,
): void {
  const normalizedFile = normalizePath(file.split('?')[0]);
  if (!stylesheetRegistry || !existsSync(normalizedFile)) {
    return;
  }

  const publicIds = stylesheetRegistry.getPublicIdsForSource(normalizedFile);
  if (publicIds.length === 0) {
    return;
  }

  const rawCss = readFileSync(normalizedFile, 'utf-8');
  const preprocessed = preprocessStylesheetResult(
    rawCss,
    normalizedFile,
    stylePreprocessor,
  );
  const servedCss = rewriteRelativeCssImports(
    preprocessed.code,
    normalizedFile,
  );

  for (const publicId of publicIds) {
    stylesheetRegistry.registerServedStylesheet(
      {
        publicId,
        sourcePath: normalizedFile,
        originalCode: rawCss,
        normalizedCode: servedCss,
        dependencies: normalizeStylesheetDependencies(
          preprocessed.dependencies,
        ),
        diagnostics: preprocessed.diagnostics,
        tags: preprocessed.tags,
      },
      [
        normalizedFile,
        normalizePath(normalizedFile),
        basename(normalizedFile),
        normalizedFile.replace(/^\//, ''),
      ],
    );
  }

  debugStylesV('stylesheet registry refreshed from source file', {
    file: normalizedFile,
    publicIds,
    dependencies: preprocessed.dependencies,
    diagnostics: preprocessed.diagnostics,
    tags: preprocessed.tags,
    source: describeStylesheetContent(rawCss),
    served: describeStylesheetContent(servedCss),
  });
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
      stylesheetRegistry?.resolveExternalSource(requestPath.replace(/^\//, '')))
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

interface TemplateClassBindingIssue {
  line: number;
  column: number;
  snippet: string;
}

interface ActiveGraphComponentRecord {
  file: string;
  className: string;
  selector?: string;
}

interface StyleOwnerRecord {
  sourcePath: string;
  ownerFile: string;
}

type ComponentStylesheetHmrOutcome =
  | 'css-update'
  | 'owner-component-update'
  | 'full-reload';

export function findStaticClassAndBoundClassConflicts(
  template: string,
): TemplateClassBindingIssue[] {
  const issues: TemplateClassBindingIssue[] = [];

  for (const { index, snippet } of findOpeningTagSnippets(template)) {
    if (!snippet.includes('[class]')) {
      continue;
    }

    const hasStaticClass = /\sclass\s*=\s*(['"])(?:(?!\1)[\s\S])*\1/.test(
      snippet,
    );
    const hasBoundClass = /\s\[class\]\s*=\s*(['"])(?:(?!\1)[\s\S])*\1/.test(
      snippet,
    );

    if (hasStaticClass && hasBoundClass) {
      const prefix = template.slice(0, index);
      const line = prefix.split('\n').length;
      const lastNewline = prefix.lastIndexOf('\n');
      const column = index - lastNewline;
      issues.push({
        line,
        column,
        snippet: snippet.replace(/\s+/g, ' ').trim(),
      });
    }
  }

  return issues;
}

function throwTemplateClassBindingConflict(
  id: string,
  issue: TemplateClassBindingIssue,
): never {
  throw new Error(
    [
      '[Analog Angular] Invalid template class binding.',
      `File: ${id}:${issue.line}:${issue.column}`,
      'The same element uses both a static `class="..."` attribute and a whole-element `[class]="..."` binding.',
      'That pattern can replace or conflict with static Tailwind classes, which makes styles appear to stop applying.',
      'Use `[ngClass]` or explicit `[class.foo]` bindings instead of `[class]` when the element also has static classes.',
      `Snippet: ${issue.snippet}`,
    ].join('\n'),
  );
}

export function findBoundClassAndNgClassConflicts(
  template: string,
): TemplateClassBindingIssue[] {
  const issues: TemplateClassBindingIssue[] = [];
  const hasWholeElementClassBinding = /\[class\]\s*=/.test(template);

  if (!hasWholeElementClassBinding || !template.includes('[ngClass]')) {
    return issues;
  }

  for (const { index, snippet } of findOpeningTagSnippets(template)) {
    if (!/\[class\]\s*=/.test(snippet) || !snippet.includes('[ngClass]')) {
      continue;
    }

    const prefix = template.slice(0, index);
    const line = prefix.split('\n').length;
    const lastNewline = prefix.lastIndexOf('\n');
    const column = index - lastNewline;
    issues.push({
      line,
      column,
      snippet: snippet.replace(/\s+/g, ' ').trim(),
    });
  }

  return issues;
}

function findOpeningTagSnippets(
  template: string,
): Array<{ index: number; snippet: string }> {
  const matches: Array<{ index: number; snippet: string }> = [];

  for (let index = 0; index < template.length; index++) {
    if (template[index] !== '<') {
      continue;
    }

    const tagStart = template[index + 1];
    if (!tagStart || !/[a-zA-Z]/.test(tagStart)) {
      continue;
    }

    let quote: '"' | "'" | null = null;

    for (let end = index + 1; end < template.length; end++) {
      const char = template[end];

      if (quote) {
        if (char === quote) {
          quote = null;
        }
        continue;
      }

      if (char === '"' || char === "'") {
        quote = char;
        continue;
      }

      if (char === '>') {
        matches.push({
          index,
          snippet: template.slice(index, end + 1),
        });
        index = end;
        break;
      }
    }
  }

  return matches;
}

function formatActiveGraphLocations(entries: Iterable<string>): string {
  return [...entries]
    .sort()
    .map((entry) => `- ${entry}`)
    .join('\n');
}

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

function isComponentStyleSheet(id: string): boolean {
  return id.includes('ngcomp=');
}

function getComponentStyleSheetMeta(id: string): {
  componentId: string;
  encapsulation: 'emulated' | 'shadow' | 'none';
} {
  const params = new URL(id, 'http://localhost').searchParams;
  const encapsulationMapping = {
    '0': 'emulated',
    '2': 'none',
    '3': 'shadow',
  };
  return {
    componentId: params.get('ngcomp')!,
    encapsulation: encapsulationMapping[
      params.get('e') as keyof typeof encapsulationMapping
    ] as 'emulated' | 'shadow' | 'none',
  };
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
export function isTestWatchMode(args: string[] = process.argv): boolean {
  // vitest --run
  const hasRun = args.find((arg) => arg.includes('--run'));
  if (hasRun) {
    return false;
  }

  // vitest --no-run
  const hasNoRun = args.find((arg) => arg.includes('--no-run'));
  if (hasNoRun) {
    return true;
  }

  // check for --watch=false or --no-watch
  const hasWatch = args.find((arg) => arg.includes('watch'));
  if (hasWatch && ['false', 'no'].some((neg) => hasWatch.includes(neg))) {
    return false;
  }

  // check for --watch false
  const watchIndex = args.findIndex((arg) => arg.includes('watch'));
  const watchArg = args[watchIndex + 1];
  if (watchArg && watchArg === 'false') {
    return false;
  }

  return true;
}

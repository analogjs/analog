import { NgtscProgram } from '@angular/compiler-cli';
import { mkdirSync, writeFileSync, promises as fsPromises } from 'node:fs';
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
  StyleUrlsResolver,
  TemplateUrlsResolver,
} from './component-resolvers.js';
import {
  augmentHostWithCaching,
  augmentHostWithResources,
  augmentProgramWithVersioning,
  mergeTransformers,
} from './host.js';

import { angularVitestPlugins } from './angular-vitest-plugin.js';
import {
  createAngularCompilation,
  createJitResourceTransformer,
  SourceFileCache,
  angularFullVersion,
} from './utils/devkit.js';
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
import { createHash } from 'node:crypto';
import { fastCompilePlugin } from './fast-compile-plugin.js';
import { oxcLinkerPlugin } from './compiler/oxc-linker-plugin.js';
import {
  TS_EXT_REGEX,
  createTsConfigGetter,
  getTsConfigPath,
  createDepOptimizerConfig,
  type TsConfigResolutionContext,
} from './utils/plugin-config.js';
import { VIRTUAL_RAW_PREFIX, toVirtualRawId } from './utils/virtual-ids.js';
import {
  loadVirtualRawModule,
  rewriteHtmlRawImport,
} from './utils/virtual-resources.js';
import { markStylePathSafe } from './utils/safe-module-paths.js';

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
  /**
   * Which compiler backs `fastCompile`.
   * - `'ts'` (default): the in-process TS/OXC-AST compiler shipped with this
   *   package.
   * - `'oxc'`: experimental — route component compilation through the native
   *   Rust pipeline from `@oxc-angular/vite` (must be installed as an optional
   *   peer dependency).
   *
   * Can also be enabled with the `ANALOG_OXC=true` environment variable when
   * this option is left unset (explicit values here take precedence).
   */
  fastCompileEngine?: 'ts' | 'oxc';
  experimental?: {
    useAngularCompilationAPI?: boolean;
  };
}

const classNames = new Map();

interface DeclarationFile {
  declarationFileDir: string;
  declarationPath: string;
  data: string;
}

/**
 * Subset of the esbuild-style `PartialMessage` that `@angular/build`'s
 * `diagnoseFiles()` returns. Only the fields the plugin reads are modeled.
 */
export interface AngularDiagnostic {
  text?: string;
  location?: {
    file?: string;
    line?: number;
    column?: number;
  } | null;
}

export function angular(options?: PluginOptions): Plugin[] {
  /**
   * Normalize plugin options so defaults
   * are used for values not provided.
   */
  // Allow enabling the experimental OXC engine from the environment (e.g. in
  // CI) without editing config. Explicit plugin options take precedence.
  const oxcEngineFromEnv = process.env['ANALOG_OXC'] === 'true';

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
    liveReload: options?.liveReload ?? false,
    disableTypeChecking: options?.disableTypeChecking ?? true,
    fileReplacements: options?.fileReplacements ?? [],
    useAngularCompilationAPI:
      options?.experimental?.useAngularCompilationAPI ?? false,
    fastCompile: options?.fastCompile ?? oxcEngineFromEnv,
    fastCompileMode: options?.fastCompileMode ?? 'full',
    fastCompileEngine:
      options?.fastCompileEngine ?? (oxcEngineFromEnv ? 'oxc' : 'ts'),
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
    cachedHost = undefined;
    cachedHostKey = undefined;
  }
  let watchMode = false;
  let testWatchMode = isTestWatchMode();
  let inlineComponentStyles: Map<string, string> | undefined;
  let externalComponentStyles: Map<string, string> | undefined;
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
  const fileEmitter = (file: string) => {
    outputFile?.(file);
    return outputFiles.get(normalizePath(file));
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

    if (angularFullVersion < 190000 || isTest) {
      pluginOptions.liveReload = false;
    }

    // liveReload and fileReplacements guards were previously here and forced
    // both options off when useAngularCompilationAPI was enabled. Those guards
    // have been removed because:
    //  - liveReload: the persistent compilation instance (above) now gives
    //    Angular the prior state it needs to emit `templateUpdates` for HMR
    //  - fileReplacements: Angular's AngularHostOptions already accepts a
    //    `fileReplacements` record — we now convert and pass it through in
    //    `performAngularCompilation` via `toAngularCompilationFileReplacements`
    if (pluginOptions.useAngularCompilationAPI) {
      if (angularFullVersion < 200100) {
        pluginOptions.useAngularCompilationAPI = false;
        console.warn(
          '[@analogjs/vite-plugin-angular]: The Angular Compilation API is only available with Angular v20.1 and later',
        );
      }
    }

    return {
      name: '@analogjs/vite-plugin-angular',
      async config(config, { command }) {
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

        const depOptimizer = createDepOptimizerConfig({
          tsconfig: preliminaryTsConfigPath,
          isProd,
          jit,
          watchMode,
          isTest,
          isAstroIntegration,
        });

        return {
          ...(vite.rolldownVersion ? { oxc } : { esbuild }),
          ...depOptimizer,
          resolve: {
            conditions: [
              ...depOptimizer.resolve.conditions,
              ...(config.resolve?.conditions || defaultClientConditions),
            ],
          },
        };
      },
      configResolved(config) {
        resolvedConfig = config;

        if (pluginOptions.useAngularCompilationAPI) {
          externalComponentStyles = new Map();
          inlineComponentStyles = new Map();
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
        server.watcher.on('unlink', invalidateCompilationOnFsChange);
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
      buildEnd() {
        // Report diagnostics for production builds. Watch/serve already report
        // per-module from `transform`; build mode defers to here so a single
        // errored file no longer aborts the build before the rest are checked
        // — every file's diagnostics are aggregated and reported together.
        // Which diagnostics exist is governed by `disableTypeChecking` inside
        // `getDiagnosticsForSourceFile` (syntactic-only by default, full
        // semantic + Angular template diagnostics when type checking is on),
        // so reporting itself is unconditional.
        if (watchMode) {
          return;
        }

        const { errors, warnings } = collectEmittedDiagnostics(outputFiles);

        if (warnings.length > 0) {
          this.warn(warnings.join('\n'));
        }

        if (errors.length > 0) {
          this.error(errors.join('\n\n'));
        }
      },
      async handleHotUpdate(ctx) {
        if (TS_EXT_REGEX.test(ctx.file)) {
          let [fileId] = ctx.file.split('?');

          pendingCompilation = performCompilation(resolvedConfig, [fileId]);

          let result;

          if (pluginOptions.liveReload) {
            await pendingCompilation;
            pendingCompilation = null;
            result = fileEmitter(fileId);
          }

          if (
            pluginOptions.liveReload &&
            result?.hmrEligible &&
            classNames.get(fileId)
          ) {
            const relativeFileId = `${normalizePath(
              relative(process.cwd(), fileId),
            )}@${classNames.get(fileId)}`;

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
          fileTransformMap.delete(ctx.file.split('?')[0]);

          /**
           * Check to see if this was a direct request
           * for an external resource (styles, html).
           */
          const isDirect = ctx.modules.find(
            (mod) => ctx.file === mod.file && mod.id?.includes('?direct'),
          );
          const isInline = ctx.modules.find(
            (mod) => ctx.file === mod.file && mod.id?.includes('?inline'),
          );

          if (isDirect || isInline) {
            if (pluginOptions.liveReload && isDirect?.id && isDirect.file) {
              const isComponentStyle =
                isDirect.type === 'css' && isComponentStyleSheet(isDirect.id);
              if (isComponentStyle) {
                const { encapsulation } = getComponentStyleSheetMeta(
                  isDirect.id,
                );

                // Track if the component uses ShadowDOM encapsulation
                // Shadow DOM components currently require a full reload.
                // Vite's CSS hot replacement does not support shadow root searching.
                if (encapsulation !== 'shadow') {
                  ctx.server.ws.send({
                    type: 'update',
                    updates: [
                      {
                        type: 'css-update',
                        timestamp: Date.now(),
                        path: isDirect.url,
                        acceptedPath: isDirect.file,
                      },
                    ],
                  });

                  return ctx.modules
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
                    }) as ModuleNode[];
                }
              }
            }
            return ctx.modules;
          }

          const mods: ModuleNode[] = [];
          const updates: string[] = [];
          ctx.modules.forEach((mod) => {
            mod.importers.forEach((imp) => {
              ctx.server.moduleGraph.invalidateModule(imp);

              if (pluginOptions.liveReload && classNames.get(imp.id)) {
                updates.push(imp.id as string);
              } else {
                mods.push(imp);
              }
            });
          });

          pendingCompilation = performCompilation(resolvedConfig, [
            ...mods.map((mod) => mod.id as string),
            ...updates,
          ]);

          if (updates.length > 0) {
            await pendingCompilation;
            pendingCompilation = null;

            updates.forEach((updateId) => {
              const impRelativeFileId = `${normalizePath(
                relative(process.cwd(), updateId),
              )}@${classNames.get(updateId)}`;

              sendHMRComponentUpdate(ctx.server, impRelativeFileId);
            });

            return ctx.modules.map((mod) => {
              if (mod.id === ctx.file) {
                return markModuleSelfAccepting(mod);
              }

              return mod;
            });
          }

          return mods;
        }

        // clear HMR updates with a full reload
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
          const componentStyles = externalComponentStyles?.get(
            getFilenameFromPath(id),
          );
          if (componentStyles) {
            return componentStyles + new URL(id, 'http://localhost').search;
          }
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
          const componentStyles = inlineComponentStyles?.get(
            getFilenameFromPath(id),
          );
          if (componentStyles) {
            return componentStyles;
          }
        }

        return;
      },
      transform: {
        filter: {
          id: {
            include: [TS_EXT_REGEX],
            // `?raw` ids already carry Vite's native raw-loader output
            // (`export default "<source>"`). Recompiling them as Angular/TS
            // would strip that default export, so leave them to Vite (#2356).
            exclude: [
              /node_modules/,
              'type=script',
              '@ng/component',
              /[?&]raw\b/,
            ],
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
              return;
            }
          }

          /**
           * Skip transforming content files
           */
          if (id.includes('?') && id.includes('analog-content-')) {
            return;
          }

          /**
           * Encapsulate component stylesheets that use emulated encapsulation
           */
          if (pluginOptions.liveReload && isComponentStyleSheet(id)) {
            const { encapsulation, componentId } =
              getComponentStyleSheetMeta(id);
            if (encapsulation === 'emulated' && componentId) {
              const encapsulated = ngCompiler.encapsulateStyle(
                code,
                componentId,
              );
              return {
                code: encapsulated,
                map: null,
              };
            }
          }

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

          // File not in the Angular program — skip and let other plugins
          // or Vite's built-in transform handle it. Warn if it looks like
          // an Angular file that should have been compiled.
          if (!typescriptResult) {
            const isAngular =
              !id.includes('@ng/component') &&
              /(Component|Directive|Pipe|Injectable|NgModule)\(/.test(code);
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

          // In watch/serve, surface this module's errors immediately so the
          // dev overlay points at the edited file. In build mode, defer to the
          // `buildEnd` hook, which aggregates diagnostics across every file
          // instead of aborting the whole build at the first errored module.
          if (
            watchMode &&
            typescriptResult.errors &&
            typescriptResult.errors.length > 0
          ) {
            this.error(`${typescriptResult.errors.join('\n')}`);
          }

          let data = typescriptResult.content ?? '';

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

          if (typescriptResult.map) {
            // TS emits `//# sourceMappingURL=foo.js.map` at the end of the
            // .js content, but the .map file isn't served by Vite — we
            // return the map object directly. Strip the stale reference so
            // downstream tools don't see two sourceMappingURL comments.
            data = data.replace(/\s*\/\/# sourceMappingURL=[^\r\n]*\s*$/, '');
          }

          return {
            code: data,
            map: typescriptResult.map ?? null,
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
        fastCompileEngine: pluginOptions.fastCompileEngine,
      })
    : angularPlugin();

  // OXC engine only: link pre-compiled Angular libraries (`ɵɵngDeclare*`
  // → `ɵɵdefine*`) using OXC's native Rust linker. Without this, those
  // libraries fall back to runtime JIT linking which pulls
  // `@angular/compiler` into the browser bundle. Skipped on the TS
  // engine path, which has its own dts-reader covering the same need.
  const linkerPlugin =
    pluginOptions.fastCompile && pluginOptions.fastCompileEngine === 'oxc'
      ? oxcLinkerPlugin()
      : (false as unknown as Plugin);

  // Both engines use Analog's `JavaScriptTransformer`-backed optimizer.
  // OXC's `optimizeAngularPackage` leaves `@angular/core/fesm2022/core.mjs`
  // essentially untouched, so unused public re-exports (including the JIT
  // runtime) survive tree-shaking and ~150KB extra ships to the client.
  // Revisit `oxcOptimizerPlugin` once upstream closes the gap.
  const optimizerPlugin = buildOptimizerPlugin({
    supportedBrowsers: pluginOptions.supportedBrowsers,
    jit,
  });

  return [
    replaceFiles(pluginOptions.fileReplacements, pluginOptions.workspaceRoot),
    compilationPlugin,
    linkerPlugin,
    !pluginOptions.fastCompile &&
      pluginOptions.liveReload &&
      liveReloadPlugin({ classNames, fileEmitter }),
    ...(isTest && !isStackBlitz
      ? angularVitestPlugins((id) => outputFiles.get(normalizePath(id))?.map)
      : []),
    (jit &&
      jitPlugin({
        inlineStylesExtension: pluginOptions.inlineStylesExtension,
      })) as Plugin,
    optimizerPlugin,
    routerPlugin(),
    angularFullVersion < 190004 && pendingTasksPlugin(),
    nxFolderPlugin(),
  ]
    .flat()
    .filter(Boolean) as Plugin[];

  function findIncludes() {
    const workspaceRoot = normalizePath(resolve(pluginOptions.workspaceRoot));

    // Map include patterns to absolute workspace paths
    const globs = [
      ...pluginOptions.include.map((glob) => `${workspaceRoot}${glob}`),
    ];

    // Discover TypeScript files using tinyglobby
    return globSync(globs, {
      dot: true,
      absolute: true,
    });
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
    // Reuse the existing instance so Angular can diff against prior state.
    angularCompilation ??= await (
      createAngularCompilation as typeof createAngularCompilationType
    )(!!pluginOptions.jit, false);
    const modifiedFiles = ids?.length
      ? new Set(ids.map((file) => normalizePath(file)))
      : undefined;
    if (modifiedFiles?.size) {
      sourceFileCache.invalidate(modifiedFiles);
    }
    // Notify Angular of modified files before re-initialization so it can
    // scope its incremental analysis.
    if (modifiedFiles?.size && angularCompilation.update) {
      await angularCompilation.update(modifiedFiles);
    }

    const resolvedTsConfigPath = resolveTsConfigPath();
    const compilationResult = await angularCompilation.initialize(
      resolvedTsConfigPath,
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
          if (pluginOptions.liveReload) {
            const id = createHash('sha256')
              .update(containingFile)
              .update(className as string)
              .update(String(order))
              .update(data)
              .digest('hex');
            const filename = id + '.' + pluginOptions.inlineStylesExtension;
            inlineComponentStyles!.set(filename, data);
            return filename;
          }

          const filename =
            resourceFile ??
            containingFile.replace('.ts', `.${options?.inlineStylesExtension}`);

          let stylesheetResult;

          try {
            stylesheetResult = await preprocessCSS(
              data,
              `${filename}?direct`,
              resolvedConfig,
            );
          } catch (e) {
            console.error(`${e}`);
          }

          return stylesheetResult?.code || '';
        },
        processWebWorker(workerFile, containingFile) {
          return '';
        },
      },
      (tsCompilerOptions) => {
        if (pluginOptions.liveReload && watchMode) {
          tsCompilerOptions['_enableHmr'] = true;
          tsCompilerOptions['externalRuntimeStyles'] = true;
          // Workaround for https://github.com/angular/angular/issues/59310
          // Force extra instructions to be generated for HMR w/defer
          tsCompilerOptions['supportTestBed'] = true;
        }

        if (tsCompilerOptions.compilationMode === 'partial') {
          // These options can't be false in partial mode
          tsCompilerOptions['supportTestBed'] = true;
          tsCompilerOptions['supportJitMode'] = true;
        }

        // The Angular Compilation API path must NOT enable declaration emit for
        // library builds. Unlike the legacy path, it has no mechanism to write
        // `.d.ts` files to disk, and `@angular/build`'s `emitAffectedFiles()`
        // keys outputs by source file (last-write-wins) — so a `.d.ts` would
        // overwrite the `.js` content for the same source, feeding declaration
        // text back to Vite as if it were the module source. Enabling
        // `inlineSources` here is also invalid: this path forces `sourceMap`
        // off, so an unpaired `inlineSources` trips TS5051. Because declaration
        // emit never runs here, an explicit `declaration: false` (#2348/#2352)
        // is already the effective state. See #2324.

        // Force whole-program TypeScript transpilation. `@angular/build`'s
        // `emitAffectedFiles()` skips full TS emit when `isolatedModules` is on
        // and no sourcemap is set, instead printing Angular-only transforms that
        // leave TS type annotations in the output. Analog returns that emitted
        // content to Vite/Rolldown as the module source, so the leftover types
        // (e.g. `App_Factory(__ngFactoryType__: any)`) fail to parse. Disabling
        // `isolatedModules` for emit makes TypeScript strip types, matching the
        // legacy path. Currently-working builds are unaffected (they already
        // have it off); only the otherwise-broken `isolatedModules: true` case
        // changes. The user's editor/`tsc` still enforces it. See #2324.
        if (!isTest) {
          tsCompilerOptions['isolatedModules'] = false;
        }

        if (isTest) {
          // Allow `TestBed.overrideXXX()` APIs.
          tsCompilerOptions['supportTestBed'] = true;
        }

        return tsCompilerOptions;
      },
    );

    compilationResult.externalStylesheets?.forEach((value, key) => {
      externalComponentStyles?.set(`${value}.css`, key);
    });

    const diagnostics = await angularCompilation.diagnoseFiles(
      pluginOptions.disableTypeChecking
        ? DiagnosticModes.All & ~DiagnosticModes.Semantic
        : DiagnosticModes.All,
    );

    // `diagnoseFiles()` returns whole-program diagnostics. Group them by the
    // source file they point at so each is attached to its own emitted file and
    // reported exactly once — on that file's transform — instead of duplicating
    // the entire global list across every emitted file (an N×M explosion, e.g.
    // 485 warnings × 85 files). `groupDiagnosticsByFile` also folds the
    // `file:line:column` from `location` into each message, which was
    // previously discarded. #2317
    const { errorsByFile, warningsByFile, globalErrors, globalWarnings } =
      groupDiagnosticsByFile(diagnostics);

    // Angular encodes template updates as `encodedFilePath@ClassName` keys.
    // `mapTemplateUpdatesToFiles` decodes them back to absolute file paths so
    // we can attach HMR metadata to the correct `EmitFileResult` below.
    const templateUpdates = mapTemplateUpdatesToFiles(
      compilationResult.templateUpdates,
    );

    let globalsAttached = false;
    for (const file of await angularCompilation.emitAffectedFiles()) {
      const normalizedFilename = normalizePath(file.filename);
      const templateUpdate = templateUpdates.get(normalizedFilename);

      if (templateUpdate) {
        classNames.set(normalizedFilename, templateUpdate.className);
      }

      const fileErrors = errorsByFile.get(normalizedFilename) ?? [];
      const fileWarnings = warningsByFile.get(normalizedFilename) ?? [];

      // Location-less diagnostics (e.g. program-wide errors) have no owning
      // file, so surface them once on the first emitted file.
      if (!globalsAttached) {
        fileErrors.push(...globalErrors);
        fileWarnings.push(...globalWarnings);
        globalsAttached = true;
      }

      // Surface Angular's HMR payloads into Analog's existing live-reload
      // flow via the `hmrUpdateCode` / `hmrEligible` fields.
      outputFiles.set(normalizedFilename, {
        content: file.contents,
        dependencies: [],
        errors: fileErrors,
        warnings: fileWarnings,
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

    // Cached include discovery (invalidated only on FS events)
    if (pluginOptions.include.length > 0 && includeCache.length === 0) {
      includeCache = findIncludes();
    }

    const resolvedTsConfigPath = resolveTsConfigPath();
    const tsconfigKey = [
      resolvedTsConfigPath,
      isProd ? 'prod' : 'dev',
      isTest ? 'test' : 'app',
      config.build?.lib ? 'lib' : 'nolib',
    ].join('|');
    let cached = tsconfigOptionsCache.get(tsconfigKey);

    if (!cached) {
      const read = compilerCli.readConfiguration(resolvedTsConfigPath, {
        suppressOutputPathCheck: true,
        outDir: undefined,
        sourceMap: !isProd,
        inlineSourceMap: false,
        inlineSources: !isProd,
        // Don't force-override `declaration`/`declarationMap` here — the
        // user's tsconfig value is respected below so that app builds running
        // through Vite's library mode (e.g. WXT entrypoints) can opt out of
        // declaration emit. See #2348.
        allowEmptyCodegenFiles: false,
        annotationsAs: 'decorators',
        enableResourceInlining: false,
        noEmitOnError: false,
        mapRoot: '',
        sourceRoot: '',
        supportTestBed: false,
        supportJitMode: false,
      });
      cached = { options: read.options, rootNames: read.rootNames };
      tsconfigOptionsCache.set(tsconfigKey, cached);
    }

    // Clone options before mutation (preserve cache purity)
    const tsCompilerOptions = { ...cached.options };
    let rootNames = [...cached.rootNames];

    if (pluginOptions.liveReload && watchMode) {
      tsCompilerOptions['_enableHmr'] = true;
      tsCompilerOptions['externalRuntimeStyles'] = true;
      // Workaround for https://github.com/angular/angular/issues/59310
      // Force extra instructions to be generated for HMR w/defer
      tsCompilerOptions['supportTestBed'] = true;
    }

    if (tsCompilerOptions['compilationMode'] === 'partial') {
      // These options can't be false in partial mode
      tsCompilerOptions['supportTestBed'] = true;
      tsCompilerOptions['supportJitMode'] = true;
    }

    // Library builds emit `.d.ts` by default, but an explicit
    // `declaration: false` in the user's tsconfig is respected — this prevents
    // declaration emit for app builds that run through Vite's library mode
    // (e.g. WXT extension entrypoints). Every other build never emits. #2348
    if (
      !isTest &&
      config.build?.lib &&
      tsCompilerOptions['declaration'] !== false
    ) {
      tsCompilerOptions['declaration'] = true;
      tsCompilerOptions['declarationMap'] = watchMode;
      // `inlineSources` is only valid alongside a sourcemap option — an
      // unpaired `inlineSources` trips TS5051. In production this path leaves
      // both `sourceMap` and `inlineSourceMap` off, so only enable it when one
      // is set (e.g. dev/watch builds). See #2324.
      if (
        tsCompilerOptions['inlineSourceMap'] ||
        tsCompilerOptions['sourceMap']
      ) {
        tsCompilerOptions['inlineSources'] = true;
      }
    } else {
      tsCompilerOptions['declaration'] = false;
      tsCompilerOptions['declarationMap'] = false;
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
    rootNames = [...new Set([...rootNames, ...includeCache, ...replacements])];
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
      inlineComponentStyles = tsCompilerOptions['externalRuntimeStyles']
        ? new Map()
        : undefined;
      externalComponentStyles = tsCompilerOptions['externalRuntimeStyles']
        ? new Map()
        : undefined;
      augmentHostWithResources(host, styleTransform, {
        inlineStylesExtension: pluginOptions.inlineStylesExtension,
        isProd,
        inlineComponentStyles,
        externalComponentStyles,
        sourceFileCache,
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

      // Collect diagnostics for every emitted file in both watch/serve (for
      // the dev overlay and HMR metadata) and build, so the `buildEnd` hook
      // can report them aggregated across every file instead of aborting at
      // the first error. `getDiagnosticsForSourceFile` honours
      // `disableTypeChecking`, returning syntactic-only diagnostics by default
      // and the full semantic + Angular template set when type checking is on.
      const metadata = fileMetadata(filename);
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
    };

    const writeOutputFile = (id: string) => {
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
            !watchMode &&
            !isTest &&
            config.build?.lib &&
            /\.d\.ts/.test(filename) &&
            !filename.includes('.ngtypecheck.')
          ) {
            const relativeToRoot = relative(config.root, filename);

            // Never write declarations for source files that live outside the
            // project root (e.g. a path-mapped workspace library imported from
            // the entrypoint). Their relative path would escape `outDir` and
            // land back in the app source tree. See #2348.
            if (relativeToRoot.startsWith('..') || isAbsolute(relativeToRoot)) {
              return;
            }

            // output to library root instead /src
            const declarationPath = resolve(
              config.root,
              config.build.outDir,
              relativeToRoot,
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
) {
  return async () => {
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
/**
 * Group `@angular/build` `diagnoseFiles()` diagnostics by the source file they
 * point at, folding the esbuild-style `location` into each message as
 * `file:line:column`. Diagnostics without a file location are collected into
 * the `globalErrors` / `globalWarnings` buckets.
 *
 * Grouping lets the caller attach each diagnostic to its own emitted file so it
 * is reported exactly once, rather than duplicating the whole global list
 * across every emitted file (the N×M explosion in #2317).
 */
export function groupDiagnosticsByFile(diagnostics: {
  errors?: AngularDiagnostic[];
  warnings?: AngularDiagnostic[];
}): {
  errorsByFile: Map<string, string[]>;
  warningsByFile: Map<string, string[]>;
  globalErrors: string[];
  globalWarnings: string[];
} {
  const errorsByFile = new Map<string, string[]>();
  const warningsByFile = new Map<string, string[]>();
  const globalErrors: string[] = [];
  const globalWarnings: string[] = [];

  const group = (
    list: AngularDiagnostic[] | undefined,
    byFile: Map<string, string[]>,
    global: string[],
  ) => {
    for (const diagnostic of list ?? []) {
      const location = diagnostic.location;
      const message = location?.file
        ? `${location.file}:${location.line ?? 0}:${location.column ?? 0}: ${
            diagnostic.text ?? ''
          }`
        : (diagnostic.text ?? '');

      if (location?.file) {
        const key = normalizePath(location.file);
        const bucket = byFile.get(key);
        if (bucket) {
          bucket.push(message);
        } else {
          byFile.set(key, [message]);
        }
      } else {
        global.push(message);
      }
    }
  };

  group(diagnostics.errors, errorsByFile, globalErrors);
  group(diagnostics.warnings, warningsByFile, globalWarnings);

  return { errorsByFile, warningsByFile, globalErrors, globalWarnings };
}

export function mapTemplateUpdatesToFiles(
  templateUpdates: ReadonlyMap<string, string> | undefined,
) {
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

function sendHMRComponentUpdate(server: ViteDevServer, id: string) {
  server.ws.send('angular:component-update', {
    id: encodeURIComponent(id),
    timestamp: Date.now(),
  });

  classNames.delete(id);
}

/**
 * Flatten the per-file diagnostics accumulated on the emitted output files
 * into a single list of error and warning strings.
 *
 * Each {@link EmitFileResult} carries the diagnostics for its own source file
 * (populated as the file is emitted). The build-mode `buildEnd` hook drains
 * them here so it can report every file's diagnostics together instead of
 * throwing on the first errored file — which would otherwise abort the build
 * before the remaining files are ever checked.
 */
export function collectEmittedDiagnostics(
  outputFiles: Map<string, EmitFileResult>,
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const result of outputFiles.values()) {
    if (result.errors?.length) {
      errors.push(...result.errors.map(diagnosticMessageToString));
    }
    if (result.warnings?.length) {
      warnings.push(...result.warnings.map(diagnosticMessageToString));
    }
  }

  return { errors, warnings };
}

function diagnosticMessageToString(
  message: string | ts.DiagnosticMessageChain,
): string {
  return typeof message === 'string'
    ? message
    : ts.flattenDiagnosticMessageText(message, '\n');
}

/**
 * Format a TypeScript/Angular diagnostic as `file:line:column: message`.
 *
 * This mirrors the Compilation API path's `groupDiagnosticsByFile` output so
 * both compilation paths report diagnostics in the same shape — the default
 * path previously discarded the location and emitted only the message text.
 * Line/column are 1-based (matching `tsc` and editor gutters). Diagnostics
 * without a source location (program-wide / option diagnostics) fall back to
 * the bare flattened message.
 */
export function formatDiagnosticWithLocation(
  diagnostic: ts.Diagnostic,
): string {
  const text = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');

  if (!diagnostic.file || diagnostic.start == null) {
    return text;
  }

  const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(
    diagnostic.start,
  );

  return `${normalizePath(diagnostic.file.fileName)}:${line + 1}:${
    character + 1
  }: ${text}`;
}

export function getFileMetadata(
  program: ts.BuilderProgram,
  angularCompiler?: NgtscProgram['compiler'],
  liveReload?: boolean,
  disableTypeChecking?: boolean,
) {
  const ts = require('typescript');
  return (file: string) => {
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
      .map(formatDiagnosticWithLocation);

    const warnings = diagnostics
      .filter((d) => d.category === ts.DiagnosticCategory?.Warning)
      .map(formatDiagnosticWithLocation);

    let hmrUpdateCode: string | null | undefined = undefined;

    let hmrEligible = false;
    if (liveReload) {
      for (const node of sourceFile.statements) {
        if (ts.isClassDeclaration(node) && (node as any).name != null) {
          hmrUpdateCode = angularCompiler?.emitHmrUpdateModule(node as any);
          if (!!hmrUpdateCode) {
            classNames.set(file, (node as any).name.getText());
            hmrEligible = true;
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
  return new URL(id, 'http://localhost').pathname.replace(/^\//, '');
}

/**
 * Checks for vitest run from the command line
 * @returns boolean
 */
export function isTestWatchMode(args = process.argv) {
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

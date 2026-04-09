import { NgtscProgram } from '@angular/compiler-cli';
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  promises as fsPromises,
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
  experimental?: {
    useAngularCompilationAPI?: boolean;
  };
}

/**
 * TypeScript file extension regex
 * Match .(c or m)ts, .ts extensions with an optional ? for query params
 * Ignore .tsx extensions
 */
const TS_EXT_REGEX = /\.[cm]?(ts)[^x]?\??/;
const classNames = new Map();

interface DeclarationFile {
  declarationFileDir: string;
  declarationPath: string;
  data: string;
}

export function angular(options?: PluginOptions): Plugin[] {
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
    liveReload: options?.liveReload ?? false,
    disableTypeChecking: options?.disableTypeChecking ?? true,
    fileReplacements: options?.fileReplacements ?? [],
    useAngularCompilationAPI:
      options?.experimental?.useAngularCompilationAPI ?? false,
  };

  let resolvedConfig: ResolvedConfig;
  // Store config context needed for getTsConfigPath resolution
  let tsConfigResolutionContext: {
    root: string;
    isProd: boolean;
    isLib: boolean;
  } | null = null;

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

        const defineOptions = {
          ngJitMode: 'false',
          ngI18nClosureMode: 'false',
          ...(watchMode ? {} : { ngDevMode: 'false' }),
        };

        const rolldownOptions: vite.DepOptimizationOptions['rolldownOptions'] =
          {
            plugins: [
              createRolldownCompilerPlugin({
                tsconfig: preliminaryTsConfigPath,
                sourcemap: !isProd,
                advancedOptimizations: isProd,
                jit,
                incremental: watchMode,
              }),
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
          ...(vite.rolldownVersion ? { oxc } : { esbuild }),
          optimizeDeps: {
            include: ['rxjs/operators', 'rxjs'],
            exclude: ['@angular/platform-server'],
            ...(vite.rolldownVersion
              ? { rolldownOptions }
              : { esbuildOptions }),
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
        if (jit && id.startsWith('angular:jit:')) {
          const path = id.split(';')[1];
          return `${normalizePath(
            resolve(dirname(importer as string), path),
          )}?${id.includes(':style') ? 'analog-inline' : 'analog-raw'}`;
        }

        // Intercept .html?raw imports to bypass Vite 7.3.2+ server.fs restrictions
        // These are generated by JIT template transforms and would otherwise be
        // blocked by Vite's stricter ?raw query parameter security checks
        if (id.includes('.html?raw')) {
          const filePath = id.split('?')[0];
          const resolved = isAbsolute(filePath)
            ? normalizePath(filePath)
            : importer
              ? normalizePath(resolve(dirname(importer), filePath))
              : undefined;
          if (resolved) {
            return resolved + '?analog-raw';
          }
        }

        // Intercept style ?inline imports to bypass Vite 8.0.5+ server.fs
        // restrictions. Vite's security check matches /[?&]inline\b/ so we
        // use ?analog-inline which avoids the regex while we handle CSS
        // preprocessing and inline export ourselves in the load hook.
        if (/\.(css|scss|sass|less)\?inline$/.test(id)) {
          const filePath = id.split('?')[0];
          const resolved = isAbsolute(filePath)
            ? normalizePath(filePath)
            : importer
              ? normalizePath(resolve(dirname(importer), filePath))
              : undefined;
          if (resolved) {
            return resolved + '?analog-inline';
          }
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
        // Handle Angular template raw imports directly to bypass Vite server.fs
        // restrictions on ?raw query parameters (Vite 7.3.2+)
        if (id.endsWith('?analog-raw')) {
          const filePath = id.slice(0, -'?analog-raw'.length);
          const content = await fsPromises.readFile(filePath, 'utf-8');
          return `export default ${JSON.stringify(content)}`;
        }

        // Handle Angular style imports directly, bypassing Vite 8.0.5+
        // server.fs security check which blocks IDs matching /[?&]inline\b/.
        // Compile via preprocessCSS and return as inline string export.
        //
        // We accept both ?analog-inline (rewritten by resolveId for the
        // browser dev-server path) and ?inline (the original query) because
        // Vitest's fetchModule path calls moduleGraph.ensureEntryFromUrl
        // before transformRequest, which means pluginContainer.resolveId is
        // never invoked for module-runner imports — so the resolveId-based
        // rewrite never runs in the test path. Handling ?inline here covers
        // both paths.
        if (
          id.includes('?analog-inline') ||
          /\.(css|scss|sass|less)\?inline$/.test(id)
        ) {
          const filePath = id.split('?')[0];
          const code = await fsPromises.readFile(filePath, 'utf-8');
          const result = await preprocessCSS(code, filePath, resolvedConfig);
          return `export default ${JSON.stringify(result.code)}`;
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

          if (
            typescriptResult?.warnings &&
            typescriptResult?.warnings.length > 0
          ) {
            this.warn(`${typescriptResult.warnings.join('\n')}`);
          }

          if (typescriptResult?.errors && typescriptResult?.errors.length > 0) {
            this.error(`${typescriptResult.errors.join('\n')}`);
          }

          // return fileEmitter
          let data = typescriptResult?.content ?? '';

          if (jit && data.includes('angular:jit:')) {
            data = data.replace(
              /angular:jit:style:inline;/g,
              'virtual:angular:jit:style:inline;',
            );

            templateUrls.forEach((templateUrlSet) => {
              const [templateFile, resolvedTemplateUrl] =
                templateUrlSet.split('|');
              data = data.replace(
                `angular:jit:template:file;${templateFile}`,
                `${resolvedTemplateUrl}?raw`,
              );
            });

            styleUrls.forEach((styleUrlSet) => {
              const [styleFile, resolvedStyleUrl] = styleUrlSet.split('|');
              data = data.replace(
                `angular:jit:style:file;${styleFile}`,
                `${resolvedStyleUrl}?inline`,
              );
            });
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

  return [
    replaceFiles(pluginOptions.fileReplacements, pluginOptions.workspaceRoot),
    angularPlugin(),
    pluginOptions.liveReload && liveReloadPlugin({ classNames, fileEmitter }),
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
  ].filter(Boolean) as Plugin[];

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

  function createTsConfigGetter(tsconfigOrGetter?: string | (() => string)) {
    if (typeof tsconfigOrGetter === 'function') {
      return tsconfigOrGetter;
    }

    return () => tsconfigOrGetter || '';
  }

  function getTsConfigPath(
    root: string,
    tsconfig: string,
    isProd: boolean,
    isTest: boolean,
    isLib: boolean,
  ) {
    if (tsconfig && isAbsolute(tsconfig)) {
      if (!existsSync(tsconfig)) {
        console.error(
          `[@analogjs/vite-plugin-angular]: Unable to resolve tsconfig at ${tsconfig}. This causes compilation issues. Check the path or set the "tsconfig" property with an absolute path.`,
        );
      }

      return tsconfig;
    }

    let tsconfigFilePath = './tsconfig.app.json';

    if (isLib) {
      tsconfigFilePath = isProd
        ? './tsconfig.lib.prod.json'
        : './tsconfig.lib.json';
    }

    if (isTest) {
      tsconfigFilePath = './tsconfig.spec.json';
    }

    if (tsconfig) {
      tsconfigFilePath = tsconfig;
    }

    const resolvedPath = resolve(root, tsconfigFilePath);

    if (!existsSync(resolvedPath)) {
      console.error(
        `[@analogjs/vite-plugin-angular]: Unable to resolve tsconfig at ${resolvedPath}. This causes compilation issues. Check the path or set the "tsconfig" property with an absolute path.`,
      );
    }

    return resolvedPath;
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

    compilationResult.externalStylesheets?.forEach((value, key) => {
      externalComponentStyles?.set(`${value}.css`, key);
    });

    const diagnostics = await angularCompilation.diagnoseFiles(
      pluginOptions.disableTypeChecking
        ? DiagnosticModes.All & ~DiagnosticModes.Semantic
        : DiagnosticModes.All,
    );

    const errors = diagnostics.errors?.length ? diagnostics.errors : [];
    const warnings = diagnostics.warnings?.length ? diagnostics.warnings : [];
    // Angular encodes template updates as `encodedFilePath@ClassName` keys.
    // `mapTemplateUpdatesToFiles` decodes them back to absolute file paths so
    // we can attach HMR metadata to the correct `EmitFileResult` below.
    const templateUpdates = mapTemplateUpdatesToFiles(
      compilationResult.templateUpdates,
    );

    for (const file of await angularCompilation.emitAffectedFiles()) {
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

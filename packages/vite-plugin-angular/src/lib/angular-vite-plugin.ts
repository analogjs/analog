import { CompilerHost, NgtscProgram } from '@angular/compiler-cli';
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

import * as compilerCli from '@angular/compiler-cli';
import * as ts from 'typescript';
import { createRequire } from 'node:module';
import { globSync } from 'tinyglobby';

import {
  ModuleNode,
  normalizePath,
  Plugin,
  ViteDevServer,
  preprocessCSS,
  ResolvedConfig,
} from 'vite';
import * as ngCompiler from '@angular/compiler';

import { createCompilerPlugin } from './compiler-plugin.js';
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
import { jitPlugin } from './angular-jit-plugin.js';
import { buildOptimizerPlugin } from './angular-build-optimizer-plugin.js';

import {
  createJitResourceTransformer,
  SourceFileCache,
  angularMajor,
} from './utils/devkit.js';
import { angularVitestPlugins } from './angular-vitest-plugin.js';
import { angularStorybookPlugin } from './angular-storybook-plugin.js';

const require = createRequire(import.meta.url);

import { getFrontmatterMetadata } from './authoring/frontmatter.js';
import {
  defaultMarkdownTemplateTransforms,
  MarkdownTemplateTransform,
} from './authoring/markdown-transform.js';
import { routerPlugin } from './router-plugin.js';
import { pendingTasksPlugin } from './angular-pending-tasks.plugin.js';
import { EmitFileResult } from './models.js';
import { liveReloadPlugin } from './live-reload-plugin.js';
import { nxFolderPlugin } from './nx-folder-plugin.js';

export interface PluginOptions {
  tsconfig?: string;
  workspaceRoot?: string;
  inlineStylesExtension?: string;
  jit?: boolean;
  advanced?: {
    /**
     * Custom TypeScript transformers that are run before Angular compilation
     */
    tsTransformers?: ts.CustomTransformers;
  };
  experimental?: {
    /**
     * Enable experimental support for Analog file extension
     */
    supportAnalogFormat?:
      | boolean
      | {
          include: string[];
        };
    markdownTemplateTransforms?: MarkdownTemplateTransform[];
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
}

/**
 * TypeScript file extension regex
 * Match .(c or m)ts, .ts extensions with an optional ? for query params
 * Ignore .tsx extensions
 */
const TS_EXT_REGEX = /\.[cm]?(ts|analog|ag)[^x]?\??/;
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
    tsconfig: options?.tsconfig || '',
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
    jit: options?.experimental?.supportAnalogFormat ? false : options?.jit,
    supportAnalogFormat: options?.experimental?.supportAnalogFormat ?? false,
    markdownTemplateTransforms: options?.experimental
      ?.markdownTemplateTransforms?.length
      ? options.experimental.markdownTemplateTransforms
      : defaultMarkdownTemplateTransforms,
    include: options?.include ?? [],
    additionalContentDirs: options?.additionalContentDirs ?? [],
    liveReload: options?.liveReload ?? false,
    disableTypeChecking: options?.disableTypeChecking ?? true,
  };

  let resolvedConfig: ResolvedConfig;
  let nextProgram: NgtscProgram | undefined | ts.Program;
  let builderProgram: ts.EmitAndSemanticDiagnosticsBuilderProgram;
  let watchMode = false;
  let testWatchMode = isTestWatchMode();
  let inlineComponentStyles: Map<string, string> | undefined;
  let externalComponentStyles: Map<string, string> | undefined;
  const sourceFileCache = new SourceFileCache();
  const isTest = process.env['NODE_ENV'] === 'test' || !!process.env['VITEST'];
  const isVitestVscode = !!process.env['VITEST_VSCODE'];
  const isStackBlitz = !!process.versions['webcontainer'];
  const isAstroIntegration = process.env['ANALOG_ASTRO'] === 'true';
  const isStorybook =
    process.env['npm_lifecycle_script']?.includes('storybook') ||
    process.env['_']?.includes('storybook') ||
    process.env['NX_TASK_TARGET_TARGET']?.includes('storybook') ||
    process.env['ANALOG_STORYBOOK'] === 'true';

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

  function angularPlugin(): Plugin {
    let isProd = false;

    if (angularMajor < 19 || isTest) {
      pluginOptions.liveReload = false;
    }

    return {
      name: '@analogjs/vite-plugin-angular',
      async config(config, { command }) {
        watchMode = command === 'serve';
        isProd =
          config.mode === 'production' ||
          process.env['NODE_ENV'] === 'production';
        pluginOptions.tsconfig = getTsConfigPath(
          config.root || '.',
          pluginOptions,
          isProd,
          isTest,
          !!config?.build?.lib,
        );

        return {
          esbuild: config.esbuild ?? false,
          optimizeDeps: {
            include: ['rxjs/operators', 'rxjs'],
            exclude: ['@angular/platform-server'],
            esbuildOptions: {
              plugins: [
                createCompilerPlugin(
                  {
                    tsconfig: pluginOptions.tsconfig,
                    sourcemap: !isProd,
                    advancedOptimizations: isProd,
                    jit,
                    incremental: watchMode,
                  },
                  isTest,
                  !isAstroIntegration,
                ),
              ],
              define: {
                ngJitMode: 'false',
                ngI18nClosureMode: 'false',
                ...(watchMode ? {} : { ngDevMode: 'false' }),
              },
            },
          },
          resolve: {
            conditions: ['style'],
          },
        };
      },
      configResolved(config) {
        resolvedConfig = config;

        if (isTest) {
          // set test watch mode
          // - vite override from vitest-angular
          // - @nx/vite executor set server.watch explicitly to undefined (watch)/null (watch=false)
          // - vite config for test.watch variable
          // - vitest watch mode detected from the command line
          testWatchMode =
            !(config.server.watch === null) ||
            config.test?.watch === true ||
            testWatchMode;
        }
      },
      configureServer(server) {
        viteServer = server;
        server.watcher.on('add', async () => {
          await performCompilation(resolvedConfig);
        });
        server.watcher.on('unlink', async () => {
          await performCompilation(resolvedConfig);
        });
      },
      async buildStart() {
        // Defer the first compilation in test mode
        if (!isVitestVscode) {
          const { host } = await performCompilation(resolvedConfig);

          initialCompilation = true;

          // Only store cache if in watch mode
          if (watchMode) {
            augmentHostWithCaching(host, sourceFileCache);
          }
        }
      },
      async handleHotUpdate(ctx) {
        if (TS_EXT_REGEX.test(ctx.file)) {
          let [fileId] = ctx.file.split('?');

          if (
            pluginOptions.supportAnalogFormat &&
            ['ag', 'analog', 'agx'].some((ext) => fileId.endsWith(ext))
          ) {
            fileId += '.ts';
          }

          await performCompilation(resolvedConfig, [fileId]);

          const result = fileEmitter(fileId);

          if (
            pluginOptions.liveReload &&
            result?.hmrEligible &&
            classNames.get(fileId)
          ) {
            const relativeFileId = `${relative(
              process.cwd(),
              fileId,
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
              sourceFileCache.invalidate([imp.id]);
              ctx.server.moduleGraph.invalidateModule(imp);

              if (pluginOptions.liveReload && classNames.get(imp.id)) {
                updates.push(imp.id as string);
              } else {
                mods.push(imp);
              }
            });
          });

          await performCompilation(resolvedConfig, [
            ...mods.map((mod) => mod.id as string),
            ...updates,
          ]);

          if (updates.length > 0) {
            updates.forEach((updateId) => {
              const impRelativeFileId = `${relative(
                process.cwd(),
                updateId,
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
        if (id.startsWith('angular:jit:')) {
          const path = id.split(';')[1];
          return `${normalizePath(
            resolve(dirname(importer as string), path),
          )}?raw`;
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
      async transform(code, id) {
        // Skip transforming node_modules
        if (id.includes('node_modules')) {
          return;
        }

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
         * Check for .ts extenstions for inline script files being
         * transformed (Astro).
         *
         * Example ID:
         *
         * /src/pages/index.astro?astro&type=script&index=0&lang.ts
         */
        if (id.includes('type=script')) {
          return;
        }

        /**
         * Skip transforming content files
         */
        if (id.includes('analog-content-')) {
          return;
        }

        /**
         * Encapsulate component stylesheets that use emulated encapsulation
         */
        if (pluginOptions.liveReload && isComponentStyleSheet(id)) {
          const { encapsulation, componentId } = getComponentStyleSheetMeta(id);
          if (encapsulation === 'emulated' && componentId) {
            const encapsulated = ngCompiler.encapsulateStyle(code, componentId);
            return {
              code: encapsulated,
              map: null,
            };
          }
        }

        if (TS_EXT_REGEX.test(id)) {
          if (id.includes('.ts?')) {
            // Strip the query string off the ID
            // in case of a dynamically loaded file
            id = id.replace(/\?(.*)/, '');
          }

          /**
           * Re-analyze on each transform
           * for test(Vitest)
           */
          if (isTest) {
            if (isVitestVscode && !initialCompilation) {
              // Do full initial compilation
              await performCompilation(resolvedConfig);
              initialCompilation = true;
            }

            const tsMod = viteServer?.moduleGraph.getModuleById(id);
            if (tsMod) {
              const invalidated = tsMod.lastInvalidationTimestamp;

              if (testWatchMode && invalidated) {
                sourceFileCache.invalidate([id]);

                await performCompilation(resolvedConfig, [id]);
              }
            }
          }

          const templateUrls = templateUrlsResolver.resolve(code, id);
          const styleUrls = styleUrlsResolver.resolve(code, id);

          if (watchMode) {
            for (const urlSet of [...templateUrls, ...styleUrls]) {
              // `urlSet` is a string where a relative path is joined with an
              // absolute path using the `|` symbol.
              // For example: `./app.component.html|/home/projects/analog/src/app/app.component.html`.
              const [, absoluteFileUrl] = urlSet.split('|');
              this.addWatchFile(absoluteFileUrl);
            }
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

          if (jit) {
            return {
              code: data,
              map: null,
            };
          }

          if (
            (id.endsWith('.analog') ||
              id.endsWith('.agx') ||
              id.endsWith('.ag')) &&
            pluginOptions.supportAnalogFormat &&
            fileEmitter
          ) {
            sourceFileCache.invalidate([`${id}.ts`]);
            const ngFileResult = fileEmitter(`${id}.ts`);
            data = ngFileResult?.content || '';

            if (id.includes('.agx')) {
              const metadata = await getFrontmatterMetadata(
                code,
                id,
                pluginOptions.markdownTemplateTransforms || [],
              );
              data += metadata;
            }
          }

          return {
            code: data,
            map: null,
          };
        }

        return undefined;
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

  return [
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
    (isStorybook && angularStorybookPlugin()) as Plugin,
    routerPlugin(),
    pendingTasksPlugin(),
    nxFolderPlugin(),
  ].filter(Boolean) as Plugin[];

  /**
   * Discovers Analog format files (.analog, .agx, .ag) for compilation.
   *
   * This function:
   * 1. Discovers all Analog format files in the app root and additional directories
   * 2. Supports multiple file extensions: .analog, .agx, .ag
   * 3. Handles custom include patterns and additional content directories
   * 4. Returns TypeScript file paths for virtual compilation
   *
   * @param config The Vite resolved configuration
   * @returns Array of TypeScript file paths for virtual compilation
   *
   * Example usage:
   * const analogFiles = findAnalogFiles(config);
   *
   * Sample discovered file paths:
   * - /workspace/apps/analog-app/src/app/pages/goodbye.page.analog
   * - /workspace/apps/ng-app/src/app/pages/about.page.ag
   * - /workspace/libs/shared/feature/src/content/test.agx
   * - /workspace/apps/ng-app/src/content/post.agx
   *
   * tinyglobby vs fast-glob comparison:
   * - Both support the same glob patterns for file discovery
   * - Both are efficient for finding Analog format files
   * - tinyglobby is now used instead of fast-glob
   * - tinyglobby provides similar functionality with smaller bundle size
   * - tinyglobby's globSync returns absolute paths when absolute: true is set
   *
   * Glob patterns explained:
   * - Finds all Analog files in app root and additional directories
   * - Supports custom include patterns and content directories
   * - Converts include patterns from .ts to .analog extensions
   *
   * File format examples:
   * - .analog: Single File Components with Angular syntax
   * - .agx: Content files with front matter (similar to MDX)
   * - .ag: Alternative Angular component format
   */
  function findAnalogFiles(config: ResolvedConfig) {
    const analogConfig = pluginOptions.supportAnalogFormat;
    if (!analogConfig) {
      return [];
    }

    let extraGlobs: string[] = [];

    if (typeof analogConfig === 'object') {
      if (analogConfig.include) {
        extraGlobs = analogConfig.include;
      }
    }

    const appRoot = normalizePath(
      resolve(pluginOptions.workspaceRoot, config.root || '.'),
    );
    const workspaceRoot = normalizePath(resolve(pluginOptions.workspaceRoot));

    // Construct glob patterns for discovering Analog format files
    const globs = [
      `${appRoot}/**/*.{analog,agx,ag}`, // Find all Analog files in app root
      ...extraGlobs.map((glob) => `${workspaceRoot}${glob}.{analog,agx,ag}`), // Custom include patterns
      ...(pluginOptions.additionalContentDirs || []).map(
        (glob) => `${workspaceRoot}${glob}/**/*.agx`, // Additional content directories
      ),
      ...pluginOptions.include.map(
        (glob) => `${workspaceRoot}${glob}`.replace(/\.ts$/, '.analog'), // Include patterns converted to .analog
      ),
    ];

    // Discover files and convert to TypeScript paths for virtual compilation
    return globSync(globs, {
      dot: true,
      absolute: true,
    }).map((file: string) => `${file}.ts`); // Append .ts for virtual compilation
  }

  /**
   * Discovers additional TypeScript files to include in compilation.
   *
   * This function:
   * 1. Discovers all TypeScript files specified in pluginOptions.include
   * 2. Maps include patterns to workspace-relative paths
   * 3. Returns absolute file paths for TypeScript compilation
   *
   * @returns Array of absolute TypeScript file paths for compilation
   *
   * Example usage:
   * const includeFiles = findIncludes();
   *
   * Sample discovered file paths:
   * - /workspace/apps/analog-app/src/app/shared/utils.ts
   * - /workspace/libs/shared/feature/src/lib/feature.ts
   * - /workspace/apps/ng-app/src/app/services/api.ts
   *
   * tinyglobby vs fast-glob comparison:
   * - Both support the same glob patterns for file discovery
   * - Both are efficient for finding TypeScript files
   * - tinyglobby is now used instead of fast-glob
   * - tinyglobby provides similar functionality with smaller bundle size
   * - tinyglobby's globSync returns absolute paths when absolute: true is set
   *
   * Include pattern processing:
   * - Maps relative include patterns to absolute workspace paths
   * - Supports glob patterns for flexible file discovery
   * - Returns absolute paths for TypeScript compiler
   */
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

  function getTsConfigPath(
    root: string,
    options: PluginOptions,
    isProd: boolean,
    isTest: boolean,
    isLib: boolean,
  ) {
    if (options.tsconfig && isAbsolute(options.tsconfig)) {
      return options.tsconfig;
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

    if (options.tsconfig) {
      tsconfigFilePath = options.tsconfig;
    }

    return resolve(root, tsconfigFilePath);
  }

  async function performCompilation(config: ResolvedConfig, ids?: string[]) {
    const isProd = config.mode === 'production';
    const analogFiles = findAnalogFiles(config);
    const includeFiles = findIncludes();

    let { options: tsCompilerOptions, rootNames } =
      compilerCli.readConfiguration(pluginOptions.tsconfig, {
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

    if (pluginOptions.supportAnalogFormat) {
      // Experimental Local Compilation is necessary
      // for the Angular compiler to work with
      // AOT and virtually compiled .analog files.
      tsCompilerOptions.compilationMode = 'experimental-local';
    }

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

    rootNames = rootNames.concat(analogFiles, includeFiles);
    const ts = require('typescript');
    const host = ts.createIncrementalCompilerHost(tsCompilerOptions);

    if (!jit) {
      const styleTransform = (code: string, filename: string) =>
        preprocessCSS(code, filename, config);
      inlineComponentStyles = tsCompilerOptions['externalRuntimeStyles']
        ? new Map()
        : undefined;
      externalComponentStyles = tsCompilerOptions['externalRuntimeStyles']
        ? new Map()
        : undefined;
      augmentHostWithResources(host, styleTransform, {
        inlineStylesExtension: pluginOptions.inlineStylesExtension,
        supportAnalogFormat: pluginOptions.supportAnalogFormat,
        isProd,
        markdownTemplateTransforms: pluginOptions.markdownTemplateTransforms,
        inlineComponentStyles,
        externalComponentStyles,
      });
    }

    /**
     * Creates a new NgtscProgram to analyze/re-analyze
     * the source files and create a file emitter.
     * This is shared between an initial build and a hot update.
     */
    let builder:
      | ts.BuilderProgram
      | ts.EmitAndSemanticDiagnosticsBuilderProgram;
    let typeScriptProgram: ts.Program;
    let angularCompiler: NgtscProgram['compiler'];

    if (!jit) {
      // Create the Angular specific program that contains the Angular compiler
      const angularProgram: NgtscProgram = new compilerCli.NgtscProgram(
        ids && ids.length > 0 ? ids : rootNames,
        tsCompilerOptions,
        host as CompilerHost,
        nextProgram as any,
      );
      angularCompiler = angularProgram.compiler;
      typeScriptProgram = angularProgram.getTsProgram();
      augmentProgramWithVersioning(typeScriptProgram);

      builder = ts.createEmitAndSemanticDiagnosticsBuilderProgram(
        typeScriptProgram,
        host,
        builderProgram,
      );

      await angularCompiler.analyzeAsync();

      nextProgram = angularProgram;
      builderProgram =
        builder as unknown as ts.EmitAndSemanticDiagnosticsBuilderProgram;
    } else {
      builder = ts.createEmitAndSemanticDiagnosticsBuilderProgram(
        rootNames,
        tsCompilerOptions,
        host,
        nextProgram,
      );

      typeScriptProgram = builder.getProgram();
    }

    if (!watchMode) {
      // When not in watch mode, the startup cost of the incremental analysis can be avoided by
      // using an abstract builder that only wraps a TypeScript program.
      builder = ts.createAbstractBuilder(typeScriptProgram, host);
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

    return { host };
  }
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

import { CompilerHost, NgtscProgram } from '@angular/compiler-cli';
import { transformAsync } from '@babel/core';
import angularApplicationPreset from '@angular-devkit/build-angular/src/babel/presets/application';
import { requiresLinking } from '@angular-devkit/build-angular/src/babel/webpack-loader';
import * as ts from 'typescript';
import { ModuleNode, Plugin, ViteDevServer } from 'vite';
import { Plugin as ESBuildPlugin } from 'esbuild';
import { createCompilerPlugin } from '@angular-devkit/build-angular/src/builders/browser-esbuild/compiler-plugin';
import { loadEsmModule } from '@angular-devkit/build-angular/src/utils/load-esm';
import {
  hasStyleUrls,
  hasTemplateUrl,
  resolveStyleUrls,
  resolveTemplateUrl,
} from './component-resolvers';
import { componentAssetsPlugin } from './component-assets-plugin';

interface PluginOptions {
  tsconfig?: string;
  workspaceRoot?: string;
  inlineStylesExtension?: string;
}

interface EmitFileResult {
  content?: string;
  map?: string;
  dependencies: readonly string[];
  hash?: Uint8Array;
}
type FileEmitter = (file: string) => Promise<EmitFileResult | undefined>;

export function angular(options?: PluginOptions): Plugin[] {
  /**
   * Normalize plugin options so defaults
   * are used for values not provided.
   */
  const pluginOptions = {
    tsconfig:
      options?.tsconfig ?? process.env['NODE_ENV'] === 'test'
        ? './tsconfig.spec.json'
        : './tsconfig.app.json',
    workspaceRoot: options?.workspaceRoot ?? process.cwd(),
    inlineStylesExtension: options?.inlineStylesExtension ?? '',
  };

  // The file emitter created during `onStart` that will be used during the build in `onLoad` callbacks for TS files
  let fileEmitter: FileEmitter | undefined;
  let compilerOptions = {};
  // Temporary deep import for transformer support
  const {
    mergeTransformers,
    replaceBootstrap,
  } = require('@ngtools/webpack/src/ivy/transformation');
  const {
    replaceResources,
  } = require('@ngtools/webpack/src/transformers/replace_resources');
  const {
    augmentProgramWithVersioning,
    augmentHostWithCaching,
  } = require('@ngtools/webpack/src/ivy/host');
  const { SourceFileCache } = require('@ngtools/webpack/src/ivy/cache');
  let compilerCli: typeof import('@angular/compiler-cli');
  let rootNames: string[];
  let host: ts.CompilerHost;
  let nextProgram: NgtscProgram;
  let builderProgram: ts.EmitAndSemanticDiagnosticsBuilderProgram;
  let watchMode: boolean = false;
  let sourceFileCache = new SourceFileCache();
  let isProd = process.env['NODE_ENV'] === 'production';
  let isTest = process.env['NODE_ENV'] === 'test' || !!process.env['VITEST'];
  let viteServer: ViteDevServer;

  return [
    {
      name: '@analogjs/vite-plugin-angular',
      async config(config, { command }) {
        watchMode = command === 'serve';

        compilerCli = await loadEsmModule<
          typeof import('@angular/compiler-cli')
        >('@angular/compiler-cli');

        return {
          optimizeDeps: {
            esbuildOptions: {
              plugins: [
                createCompilerPlugin(
                  {
                    tsconfig: pluginOptions.tsconfig,
                    sourcemap: !isProd,
                    advancedOptimizations: isProd,
                  },
                  {
                    workspaceRoot: pluginOptions.workspaceRoot,
                    sourcemap: !isProd,
                    optimization: isProd,
                  }
                ) as ESBuildPlugin as any,
              ],
              define: {
                ngDevMode: watchMode ? JSON.stringify({}) : 'false',
                ngJitMode: 'false',
                ngI18nClosureMode: 'false',
              },
            },
          },
        };
      },
      configureServer(server) {
        viteServer = server;
        server.watcher.on('add', setupCompilation);
        server.watcher.on('unlink', setupCompilation);
      },
      async buildStart() {
        setupCompilation();

        // Only store cache if in watch mode
        if (watchMode) {
          augmentHostWithCaching(host, sourceFileCache);
        }

        await buildAndAnalyze();
      },
      async handleHotUpdate(ctx) {
        if (/\.[cm]?ts([^x])?\??$/.test(ctx.file)) {
          sourceFileCache.invalidate(ctx.file.replace(/\?(.*)/, ''));
          await buildAndAnalyze();
        }

        if (/\.(html|htm|css|less|sass|scss)$/.test(ctx.file)) {
          /**
           * Check to see if this was a direct request
           * for an external resource (styles, html).
           */
          const isDirect = ctx.modules.find(
            (mod) => ctx.file === mod.file && mod.id?.includes('?direct')
          );

          if (isDirect) {
            return ctx.modules;
          }

          let mods: ModuleNode[] = [];
          ctx.modules.forEach((mod) => {
            mod.importers.forEach((imp) => {
              sourceFileCache.invalidate(imp.id);
              ctx.server.moduleGraph.invalidateModule(imp);
              mods.push(imp);
            });
          });

          await buildAndAnalyze();
          return mods;
        }

        return ctx.modules;
      },
      async transform(code, id) {
        // Skip transforming node_modules
        if (id.includes('node_modules')) {
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

        if (/\.[cm]?ts([^x])?\??$/.test(id)) {
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
            const tsMod = viteServer.moduleGraph.getModuleById(id);
            if (tsMod) {
              sourceFileCache.invalidate(id);
              await buildAndAnalyze();
            }
          }

          if (watchMode) {
            if (hasTemplateUrl(code)) {
              const templateUrl = resolveTemplateUrl(code, id);

              if (templateUrl) {
                this.addWatchFile(templateUrl);
              }
            }

            if (hasStyleUrls(code)) {
              const styleUrls = resolveStyleUrls(code, id);

              styleUrls.forEach((styleUrl) => {
                this.addWatchFile(styleUrl);
              });
            }
          }

          const typescriptResult = await fileEmitter!(id);

          // return fileEmitter
          const data = typescriptResult?.content ?? '';
          const forceAsyncTransformation =
            /for\s+await\s*\(|async\s+function\s*\*/.test(data);
          const useInputSourcemap = (!isProd ? undefined : false) as undefined;

          if (!forceAsyncTransformation && !isProd) {
            return {
              code: isProd
                ? data.replace(/^\/\/# sourceMappingURL=[^\r\n]*/gm, '')
                : data,
            };
          }

          const babelResult = await transformAsync(data, {
            filename: id,
            inputSourceMap: (useInputSourcemap
              ? undefined
              : false) as undefined,
            sourceMaps: !isProd ? 'inline' : false,
            compact: false,
            configFile: false,
            babelrc: false,
            browserslistConfigFile: false,
            plugins: [],
            presets: [
              [
                angularApplicationPreset,
                {
                  forceAsyncTransformation,
                  optimize: isProd && {},
                },
              ],
            ],
          });

          return {
            code: babelResult?.code ?? '',
            map: babelResult?.map,
          };
        }

        return undefined;
      },
    },
    {
      name: '@analogjs/vite-plugin-angular-optimizer',
      apply: 'build',
      config() {
        return {
          esbuild: {
            legalComments: 'none',
            keepNames: false,
            define: isProd
              ? {
                  ngDevMode: 'false',
                  ngJitMode: 'false',
                  ngI18nClosureMode: 'false',
                }
              : undefined,
            supported: {
              // Native async/await is not supported with Zone.js. Disabling support here will cause
              // esbuild to downlevel async/await to a Zone.js supported form.
              'async-await': false,
              // Zone.js also does not support async generators or async iterators. However, esbuild does
              // not currently support downleveling either of them. Instead babel is used within the JS/TS
              // loader to perform the downlevel transformation. They are both disabled here to allow
              // esbuild to handle them in the future if support is ever added.
              // NOTE: If esbuild adds support in the future, the babel support for these can be disabled.
              'async-generator': false,
              'for-await': false,
            },
          },
        };
      },
      async transform(code, id) {
        if (/\.[cm]?js$/.test(id)) {
          const angularPackage = /[\\/]node_modules[\\/]@angular[\\/]/.test(id);

          const linkerPluginCreator = (
            await loadEsmModule<
              typeof import('@angular/compiler-cli/linker/babel')
            >('@angular/compiler-cli/linker/babel')
          ).createEs2015LinkerPlugin;

          const forceAsyncTransformation =
            !/[\\/][_f]?esm2015[\\/]/.test(id) &&
            /for\s+await\s*\(|async\s+function\s*\*/.test(code);
          const shouldLink = await requiresLinking(id, code);
          const useInputSourcemap = (!isProd ? undefined : false) as undefined;

          if (!forceAsyncTransformation && !isProd && !shouldLink) {
            return {
              code: isProd
                ? code.replace(/^\/\/# sourceMappingURL=[^\r\n]*/gm, '')
                : code,
            };
          }

          const result = await transformAsync(code, {
            filename: id,
            inputSourceMap: useInputSourcemap,
            sourceMaps: !isProd ? 'inline' : false,
            compact: false,
            configFile: false,
            babelrc: false,
            browserslistConfigFile: false,
            plugins: [],
            presets: [
              [
                angularApplicationPreset,
                {
                  angularLinker: {
                    shouldLink,
                    jitMode: false,
                    linkerPluginCreator,
                  },
                  forceAsyncTransformation,
                  optimize: isProd && {
                    looseEnums: angularPackage,
                    pureTopLevel: angularPackage,
                  },
                },
              ],
            ],
          });

          return {
            code: result?.code || '',
            map: result?.map as any,
          };
        }

        return;
      },
    },
    ...componentAssetsPlugin(pluginOptions.inlineStylesExtension),
  ];

  function setupCompilation() {
    const { options: tsCompilerOptions, rootNames: rn } =
      compilerCli.readConfiguration(pluginOptions.tsconfig, {
        enableIvy: true,
        noEmitOnError: false,
        suppressOutputPathCheck: true,
        outDir: undefined,
        inlineSources: !isProd,
        inlineSourceMap: !isProd,
        sourceMap: false,
        mapRoot: undefined,
        sourceRoot: undefined,
        declaration: false,
        declarationMap: false,
        allowEmptyCodegenFiles: false,
        annotationsAs: 'decorators',
        enableResourceInlining: false,
      });

    rootNames = rn;
    compilerOptions = tsCompilerOptions;
    host = ts.createIncrementalCompilerHost(compilerOptions);
  }

  /**
   * Creates a new NgtscProgram to analyze/re-analyze
   * the source files and create a file emitter.
   * This is shared between an initial build and a hot update.
   */
  async function buildAndAnalyze() {
    // Create the Angular specific program that contains the Angular compiler
    const angularProgram: NgtscProgram = new compilerCli.NgtscProgram(
      rootNames,
      compilerOptions,
      host as CompilerHost,
      nextProgram
    );
    const angularCompiler = angularProgram.compiler;
    const typeScriptProgram = angularProgram.getTsProgram();
    augmentProgramWithVersioning(typeScriptProgram);

    let builder:
      | ts.BuilderProgram
      | ts.EmitAndSemanticDiagnosticsBuilderProgram;

    if (watchMode) {
      builder = builderProgram =
        ts.createEmitAndSemanticDiagnosticsBuilderProgram(
          typeScriptProgram,
          host,
          builderProgram
        );

      nextProgram = angularProgram;
    } else {
      // When not in watch mode, the startup cost of the incremental analysis can be avoided by
      // using an abstract builder that only wraps a TypeScript program.
      builder = ts.createAbstractBuilder(typeScriptProgram, host);
    }

    await angularCompiler.analyzeAsync();

    const getTypeChecker = () => builder.getProgram().getTypeChecker();
    fileEmitter = createFileEmitter(
      builder,
      mergeTransformers(
        {
          before: [
            replaceBootstrap(getTypeChecker),
            replaceResources(
              () => true,
              getTypeChecker,
              pluginOptions.inlineStylesExtension
            ),
          ],
        },
        angularCompiler.prepareEmit().transformers
      ),
      () => []
    );
  }
}

export function createFileEmitter(
  program: ts.BuilderProgram,
  transformers: ts.CustomTransformers = {},
  onAfterEmit?: (sourceFile: ts.SourceFile) => void
): FileEmitter {
  return async (file: string) => {
    const sourceFile = program.getSourceFile(file);
    if (!sourceFile) {
      return undefined;
    }

    let content: string | undefined;
    program.emit(
      sourceFile,
      (filename, data) => {
        if (/\.[cm]?js$/.test(filename)) {
          content = data;
        }
      },
      undefined /* cancellationToken */,
      undefined /* emitOnlyDtsFiles */,
      transformers
    );

    onAfterEmit?.(sourceFile);

    return { content, dependencies: [] };
  };
}

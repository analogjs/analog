import type { CompilerHost, NgtscProgram } from '@angular/compiler-cli';
import { transformAsync } from '@babel/core';
import angularApplicationPreset from '@angular-devkit/build-angular/src/babel/presets/application';
import { BundleStylesheetOptions } from '@angular-devkit/build-angular/src/builders/browser-esbuild/stylesheets';
import * as ts from 'typescript';
import { ModuleNode, Plugin } from 'vite';
import { Plugin as ESBuildPlugin } from 'esbuild';
import { createCompilerPlugin } from '@angular-devkit/build-angular/src/builders/browser-esbuild/compiler-plugin';
import { loadEsmModule } from '@angular-devkit/build-angular/src/utils/load-esm';
import { hasStyleUrls, hasTemplateUrl, resolveStyleUrls, resolveTemplateUrl } from './component-resolvers';

interface PluginOptions {
  tsconfig: string;
  mode: string;
}

interface EmitFileResult {
  content?: string;
  map?: string;
  dependencies: readonly string[];
  hash?: Uint8Array;
}
type FileEmitter = (file: string) => Promise<EmitFileResult | undefined>;

export function angular(
  pluginOptions: PluginOptions = {
    tsconfig: './tsconfig.app.json',
    mode: 'development'
  }
): Plugin {
  // The file emitter created during `onStart` that will be used during the build in `onLoad` callbacks for TS files
  let fileEmitter: FileEmitter | undefined;
  let compilerOptions = {};
  // Temporary deep import for transformer support
  const {
    mergeTransformers,
    replaceBootstrap,
  } = require('@ngtools/webpack/src/ivy/transformation');
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
  let isProd = pluginOptions.mode === 'production';

  return {
    name: '@analogjs/vite-plugin-angular',
    config(config, { command }) {
      watchMode = command === 'serve';

      return {
        esbuild: false,
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
                  sourcemap: !isProd,
                  optimization: isProd,
                }
              ) as ESBuildPlugin as any,
            ],
            define: {
              'ngDevMode': watchMode ? JSON.stringify({}) : 'false',
              'ngJitMode': 'false'
            }
          },
        },
      };
    },
    async buildStart() {
      compilerCli = await loadEsmModule<typeof import('@angular/compiler-cli')>(
        '@angular/compiler-cli'
      );

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

      // Setup source file caching and reuse cache from previous compilation if present
      let cache = new SourceFileCache();

      // Only store cache if in watch mode
      if (watchMode) {
        sourceFileCache = cache;
      }

      augmentHostWithCaching(host, cache);

      await buildAndAnalyze();
    },
    async handleHotUpdate(ctx) {
      if (/\.[cm]?tsx?$/.test(ctx.file)) {
        sourceFileCache.invalidate(ctx.file);
        await buildAndAnalyze();
      }

      if (/\.(html|htm|css|less|sass|scss)$/.test(ctx.file)) {
        let mods: ModuleNode[] = [];
        ctx.modules.forEach(mod => {
          mod.importers.forEach(imp => {
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
      
      if (hasTemplateUrl(code)) {
        const templateUrl = resolveTemplateUrl(code, id);

        if (templateUrl && templateUrl.includes('product-list')) {
          this.addWatchFile(templateUrl);
        }
      }

      if (hasStyleUrls(code)) {
        const styleUrls = resolveStyleUrls(code, id);

        styleUrls.forEach(styleUrl => {
          this.addWatchFile(styleUrl);
        });
      }

      const typescriptResult = await fileEmitter!(id);

      // return fileEmitter
      const data = typescriptResult?.content ?? '';

      if (/\.[cm]?tsx?$/.test(id)) {
        const babelResult = await transformAsync(data, {
          filename: id,
          inputSourceMap: (!isProd
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
                forceAsyncTransformation: data.includes('async'),
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
  };

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

    fileEmitter = createFileEmitter(
      builder,
      mergeTransformers(angularCompiler.prepareEmit().transformers, {
        before: [replaceBootstrap(() => builder.getProgram().getTypeChecker())],
      }),
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

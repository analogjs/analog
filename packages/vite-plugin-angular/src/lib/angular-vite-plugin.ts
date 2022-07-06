import type { CompilerHost, NgtscProgram } from '@angular/compiler-cli';
import { transformAsync } from '@babel/core';
import { promises as fs } from 'fs';
import angularApplicationPreset from '@angular-devkit/build-angular/src/babel/presets/application';
import { requiresLinking } from '@angular-devkit/build-angular/src/babel/webpack-loader';
import {
  BundleStylesheetOptions,
  bundleStylesheetText,
} from '@angular-devkit/build-angular/src/builders/browser-esbuild/stylesheets';
import * as ts from 'typescript';
import { Plugin } from 'vite';
import { Plugin as ESBuildPlugin } from 'esbuild';
import { createCompilerPlugin } from '@angular-devkit/build-angular/src/builders/browser-esbuild/compiler-plugin';
import { loadEsmModule } from '@angular-devkit/build-angular/src/utils/load-esm';

interface EmitFileResult {
  content?: string;
  map?: string;
  dependencies: readonly string[];
  hash?: Uint8Array;
}
type FileEmitter = (file: string) => Promise<EmitFileResult | undefined>;

export function angular(
  pluginOptions = {
    tsconfig: './tsconfig.app.json',
    sourcemap: false,
    advancedOptimizations: false,
  },
  styleOptions: BundleStylesheetOptions = {
    optimization: false,
    sourcemap: true,
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
  } = require('@ngtools/webpack/src/ivy/host');
  let compilerCli: typeof import('@angular/compiler-cli');
  let rootNames: string[];
  let host: ts.CompilerHost;
  let nextProgram: NgtscProgram;
  let builderProgram: ts.EmitAndSemanticDiagnosticsBuilderProgram;
  let mode: 'build' | 'serve';

  return {
    name: 'vite-plugin-angular',
    config(config, { command }) {
      mode = command;
      return {
        optimizeDeps: {
          exclude: ['rxjs'],
          esbuildOptions: {
            plugins: [
              createCompilerPlugin(
                {
                  tsconfig: pluginOptions.tsconfig,
                  sourcemap: pluginOptions.sourcemap,
                  advancedOptimizations: pluginOptions.advancedOptimizations,
                },
                {
                  sourcemap: styleOptions.sourcemap,
                  optimization: styleOptions.optimization,
                }
              ) as ESBuildPlugin as any,
            ],
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
          inlineSources: pluginOptions.sourcemap,
          inlineSourceMap: pluginOptions.sourcemap,
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
    },
    async transform(code, id) {
      // Skip transforming node_modules
      if (id.includes('node_modules')) {
        return;
      }

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

      if (mode === 'serve') {
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
          before: [
            replaceBootstrap(() => builder.getProgram().getTypeChecker()),
          ],
        }),
        () => []
      );

      if (/\.[cm]?js$/.test(id) && id.includes('@angular')) {
        const angularPackage = /[\\/]node_modules[\\/]@angular[\\/]/.test(id);

        const linkerPluginCreator = (
          await loadEsmModule<
            typeof import('@angular/compiler-cli/linker/babel')
          >('@angular/compiler-cli/linker/babel')
        ).createEs2015LinkerPlugin;

        const data = await fs.readFile(id, 'utf-8');
        const result = await transformAsync(data, {
          filename: id,
          inputSourceMap: (pluginOptions.sourcemap
            ? undefined
            : false) as undefined,
          sourceMaps: pluginOptions.sourcemap ? 'inline' : false,
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
                  shouldLink: await requiresLinking(id, data),
                  jitMode: false,
                  linkerPluginCreator,
                },
                forceAsyncTransformation:
                  !/[\\/][_f]?esm2015[\\/]/.test(id) && data.includes('async'),
                optimize: pluginOptions.advancedOptimizations && {
                  looseEnums: angularPackage,
                  pureTopLevel: angularPackage,
                },
              },
            ],
          ],
        });

        return {
          code: result?.code ?? data,
          map: result?.map,
        };
      }

      if (/\.[cm]?tsx?$/.test(id)) {
        const typescriptResult = await fileEmitter(id);

        // return fileEmitter
        const data = typescriptResult?.content ?? '';
        // console.log(id, data);
        const babelResult = await transformAsync(data, {
          filename: id,
          inputSourceMap: (pluginOptions.sourcemap
            ? undefined
            : false) as undefined,
          sourceMaps: pluginOptions.sourcemap ? 'inline' : false,
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
                optimize: pluginOptions.advancedOptimizations && {},
              },
            ],
          ],
        });

        return {
          code: babelResult?.code ?? '',
          map: babelResult?.map,
        };
      }

      return {
        code,
      };
    },
  };
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

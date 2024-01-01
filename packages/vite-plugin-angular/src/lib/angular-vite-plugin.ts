import {
  ModuleNode,
  normalizePath,
  Plugin,
  PluginContainer,
  UserConfig,
  ViteDevServer,
} from 'vite';
import { CompilerHost, NgtscProgram } from '@angular/compiler-cli';
import { transformAsync } from '@babel/core';

import * as ts from 'typescript';
import * as path from 'path';

import { createCompilerPlugin } from './compiler-plugin';
import {
  hasStyleUrls,
  hasTemplateUrl,
  StyleUrlsResolver,
  TemplateUrlsResolver,
} from './component-resolvers';
import { augmentHostWithResources } from './host';
import { jitPlugin } from './angular-jit-plugin';
import { buildOptimizerPlugin } from './angular-build-optimizer-plugin';
import {
  loadEsmModule,
  angularApplicationPreset,
  createJitResourceTransformer,
  SourceFileCache,
} from './utils/devkit';
import { angularVitestPlugin } from './angular-vitest-plugin';

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
     * Enable experimental support for .ng file format! Use as your own risk!
     */
    dangerouslySupportNgFormat?: boolean;
  };
  supportedBrowsers?: string[];
  transformFilter?: (code: string, id: string) => boolean;
}

interface EmitFileResult {
  content?: string;
  map?: string;
  dependencies: readonly string[];
  hash?: Uint8Array;
}
type FileEmitter = (file: string) => Promise<EmitFileResult | undefined>;

/**
 * TypeScript file extension regex
 * Match .(c or m)ts, .ts extensions with an optional ? for query params
 * Ignore .tsx extensions
 */
const TS_EXT_REGEX = /\.[cm]?(ts|ng)[^x]?\??/;

export function angular(options?: PluginOptions): Plugin[] {
  /**
   * Normalize plugin options so defaults
   * are used for values not provided.
   */
  const pluginOptions = {
    tsconfig:
      options?.tsconfig ??
      (process.env['NODE_ENV'] === 'test'
        ? './tsconfig.spec.json'
        : './tsconfig.app.json'),
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
    supportNgFormat: options?.experimental?.dangerouslySupportNgFormat,
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
    augmentProgramWithVersioning,
    augmentHostWithCaching,
  } = require('@ngtools/webpack/src/ivy/host');

  let compilerCli: typeof import('@angular/compiler-cli');
  let userConfig: UserConfig;
  let rootNames: string[];
  let host: ts.CompilerHost;
  let nextProgram: NgtscProgram | undefined | ts.Program;
  let builderProgram: ts.EmitAndSemanticDiagnosticsBuilderProgram;
  let watchMode = false;
  const sourceFileCache = new SourceFileCache();
  const isProd = process.env['NODE_ENV'] === 'production';
  const isTest = process.env['NODE_ENV'] === 'test' || !!process.env['VITEST'];
  const jit =
    typeof pluginOptions?.jit !== 'undefined' ? pluginOptions.jit : isTest;
  let viteServer: ViteDevServer | undefined;
  let cssPlugin: Plugin | undefined;
  let styleTransform: PluginContainer['transform'] | undefined;

  const styleUrlsResolver = new StyleUrlsResolver();
  const templateUrlsResolver = new TemplateUrlsResolver();

  function angularPlugin(): Plugin {
    return {
      name: '@analogjs/vite-plugin-angular',
      async config(config, { command }) {
        watchMode = command === 'serve';
        userConfig = config;

        pluginOptions.tsconfig =
          options?.tsconfig ??
          path.resolve(
            config.root || '.',
            process.env['NODE_ENV'] === 'test'
              ? './tsconfig.spec.json'
              : './tsconfig.app.json'
          );

        compilerCli = await loadEsmModule<
          typeof import('@angular/compiler-cli')
        >('@angular/compiler-cli');

        return {
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
                  isTest
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
      configureServer(server) {
        viteServer = server;
        server.watcher.on('add', setupCompilation);
        server.watcher.on('unlink', setupCompilation);
      },
      async buildStart({ plugins }) {
        if (Array.isArray(plugins)) {
          cssPlugin = plugins.find((plugin) => plugin.name === 'vite:css');
        }

        setupCompilation(userConfig);

        // Only store cache if in watch mode
        if (watchMode) {
          augmentHostWithCaching(host, sourceFileCache);
        }

        await buildAndAnalyze();
      },
      async handleHotUpdate(ctx) {
        // The `handleHotUpdate` hook may be called before the `buildStart`,
        // which sets the compilation. As a result, the `host` may not be available
        // yet for use, leading to build errors such as "cannot read properties of undefined"
        // (because `host` is undefined).
        if (!host) {
          return;
        }

        if (TS_EXT_REGEX.test(ctx.file)) {
          sourceFileCache.invalidate([ctx.file.replace(/\?(.*)/, '')]);
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

          const mods: ModuleNode[] = [];
          ctx.modules.forEach((mod) => {
            mod.importers.forEach((imp) => {
              sourceFileCache.invalidate([imp.id as string]);
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
         * Check for options.transformFilter
         */
        if (options?.transformFilter) {
          if (!(options?.transformFilter(code, id) ?? true)) {
            return;
          }
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
            const tsMod = viteServer?.moduleGraph.getModuleById(id);
            if (tsMod) {
              sourceFileCache.invalidate([id]);
              await buildAndAnalyze();
            }
          }

          let templateUrls: string[] = [];
          let styleUrls: string[] = [];

          if (hasTemplateUrl(code)) {
            templateUrls = templateUrlsResolver.resolve(code, id);
          }

          if (hasStyleUrls(code)) {
            styleUrls = styleUrlsResolver.resolve(code, id);
          }

          if (watchMode) {
            for (const urlSet of [...templateUrls, ...styleUrls]) {
              // `urlSet` is a string where a relative path is joined with an
              // absolute path using the `|` symbol.
              // For example: `./app.component.html|/home/projects/analog/src/app/app.component.html`.
              const [, absoluteFileUrl] = urlSet.split('|');
              this.addWatchFile(absoluteFileUrl);
            }
          }

          const typescriptResult = fileEmitter && (await fileEmitter!(id));

          // return fileEmitter
          let data = typescriptResult?.content ?? '';

          if (jit && data.includes('angular:jit:')) {
            data = data.replace(
              /angular:jit:style:inline;/g,
              'virtual:angular:jit:style:inline;'
            );

            templateUrls.forEach((templateUrlSet) => {
              const [templateFile, resolvedTemplateUrl] =
                templateUrlSet.split('|');
              data = data.replace(
                `angular:jit:template:file;${templateFile}`,
                `${resolvedTemplateUrl}?raw`
              );
            });

            styleUrls.forEach((styleUrlSet) => {
              const [styleFile, resolvedStyleUrl] = styleUrlSet.split('|');
              data = data.replace(
                `angular:jit:style:file;${styleFile}`,
                `${resolvedStyleUrl}?inline`
              );
            });
          }

          if (jit) {
            return {
              code: data.replace(/^\/\/# sourceMappingURL=[^\r\n]*/gm, ''),
              map: {
                mappings: '',
              },
            };
          }

          const forceAsyncTransformation =
            /for\s+await\s*\(|async\s+function\s*\*/.test(data);
          const useInputSourcemap = (!isProd ? undefined : false) as undefined;

          if (
            id.includes('.ng') &&
            pluginOptions.supportNgFormat &&
            fileEmitter
          ) {
            sourceFileCache.invalidate([`${id}.ts`]);
            const ngFileResult = await fileEmitter!(`${id}.ts`);
            data = ngFileResult?.content || '';
          }

          if (!forceAsyncTransformation && !isProd) {
            return {
              code: data.replace(/^\/\/# sourceMappingURL=[^\r\n]*/gm, ''),
              map: {
                mappings: '',
              },
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
                  supportedBrowsers: pluginOptions.supportedBrowsers,
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
    };
  }

  return [
    angularPlugin(),
    (isTest && angularVitestPlugin()) as Plugin,
    (jit &&
      jitPlugin({
        inlineStylesExtension: pluginOptions.inlineStylesExtension,
      })) as Plugin,
    buildOptimizerPlugin({
      isProd,
      supportedBrowsers: pluginOptions.supportedBrowsers,
    }),
  ].filter(Boolean) as Plugin[];

  function findNgFiles(config: UserConfig) {
    if (!pluginOptions.supportNgFormat) {
      return [];
    }

    const fg = require('fast-glob');
    const root = normalizePath(
      path.resolve(pluginOptions.workspaceRoot, config.root || '.')
    );
    const ngFiles: string[] = fg
      .sync([`${root}/**/*.ng`], {
        dot: true,
      })
      .map((file: string) => `${file}.ts`);

    return ngFiles;
  }

  function setupCompilation(config: UserConfig) {
    const ngFiles = findNgFiles(config);
    const { options: tsCompilerOptions, rootNames: rn } =
      compilerCli.readConfiguration(pluginOptions.tsconfig, {
        suppressOutputPathCheck: true,
        outDir: undefined,
        inlineSourceMap: !isProd,
        inlineSources: !isProd,
        declaration: false,
        declarationMap: false,
        allowEmptyCodegenFiles: false,
        annotationsAs: 'decorators',
        enableResourceInlining: false,
        supportTestBed: false,
      });

    if (pluginOptions.supportNgFormat) {
      // Experimental Local Compilation is necessary
      // for the Angular compiler to work with
      // AOT and virtually compiled .ng files.
      tsCompilerOptions.compilationMode = 'experimental-local';
    }

    rootNames = rn.concat(ngFiles);
    compilerOptions = tsCompilerOptions;
    host = ts.createIncrementalCompilerHost(compilerOptions);

    styleTransform = watchMode
      ? viteServer!.pluginContainer.transform
      : (cssPlugin!.transform as PluginContainer['transform']);

    if (!jit) {
      augmentHostWithResources(host, styleTransform, {
        inlineStylesExtension: pluginOptions.inlineStylesExtension,
        supportNgFormat: pluginOptions.supportNgFormat,
        isProd: isProd,
      });
    }
  }

  /**
   * Creates a new NgtscProgram to analyze/re-analyze
   * the source files and create a file emitter.
   * This is shared between an initial build and a hot update.
   */
  async function buildAndAnalyze() {
    let builder:
      | ts.BuilderProgram
      | ts.EmitAndSemanticDiagnosticsBuilderProgram;
    let typeScriptProgram: ts.Program;
    let angularCompiler: any;

    if (!jit) {
      // Create the Angular specific program that contains the Angular compiler
      const angularProgram: NgtscProgram = new compilerCli.NgtscProgram(
        rootNames,
        compilerOptions,
        host as CompilerHost,
        nextProgram as any
      );
      angularCompiler = angularProgram.compiler;
      typeScriptProgram = angularProgram.getTsProgram();
      augmentProgramWithVersioning(typeScriptProgram);

      builder = builderProgram =
        ts.createEmitAndSemanticDiagnosticsBuilderProgram(
          typeScriptProgram,
          host,
          builderProgram
        );

      await angularCompiler.analyzeAsync();

      nextProgram = angularProgram;
    } else {
      builder = builderProgram =
        ts.createEmitAndSemanticDiagnosticsBuilderProgram(
          rootNames,
          compilerOptions,
          host,
          nextProgram as any
        );

      typeScriptProgram = builder.getProgram();
      nextProgram = builderProgram as unknown as ts.Program;
    }

    if (!watchMode) {
      // When not in watch mode, the startup cost of the incremental analysis can be avoided by
      // using an abstract builder that only wraps a TypeScript program.
      builder = ts.createAbstractBuilder(typeScriptProgram, host);
    }

    const getTypeChecker = () => builder.getProgram().getTypeChecker();
    fileEmitter = createFileEmitter(
      builder,
      mergeTransformers(
        {
          before: [
            replaceBootstrap(getTypeChecker),
            ...(jit
              ? [
                  compilerCli.constructorParametersDownlevelTransform(
                    builder.getProgram()
                  ),
                  createJitResourceTransformer(getTypeChecker),
                ]
              : []),
            ...pluginOptions.advanced.tsTransformers.before,
          ],
          after: pluginOptions.advanced.tsTransformers.after,
          afterDeclarations:
            pluginOptions.advanced.tsTransformers.afterDeclarations,
        },
        jit ? {} : angularCompiler.prepareEmit().transformers
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

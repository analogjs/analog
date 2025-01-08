import { CompilerHost, NgtscProgram } from '@angular/compiler-cli';
import { dirname, relative, resolve } from 'node:path';

import * as compilerCli from '@angular/compiler-cli';
import * as ts from 'typescript';
import { createRequire } from 'node:module';
import { ServerResponse } from 'node:http';
import {
  ModuleNode,
  normalizePath,
  Plugin,
  ViteDevServer,
  preprocessCSS,
  ResolvedConfig,
  Connect,
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
import { analyzeFileUpdates } from './utils/hmr-candidates.js';

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

interface EmitFileResult {
  content?: string;
  map?: string;
  dependencies: readonly string[];
  hash?: Uint8Array;
  errors?: (string | ts.DiagnosticMessageChain)[];
  warnings?: (string | ts.DiagnosticMessageChain)[];
  hmrUpdateCode?: string | null;
  hmrEligible?: boolean;
}
type FileEmitter = (
  file: string,
  source?: ts.SourceFile
) => Promise<EmitFileResult | undefined>;

/**
 * TypeScript file extension regex
 * Match .(c or m)ts, .ts extensions with an optional ? for query params
 * Ignore .tsx extensions
 */
const TS_EXT_REGEX = /\.[cm]?(ts|analog|ag)[^x]?\??/;
const ANGULAR_COMPONENT_PREFIX = '/@ng/component';
const classNames = new Map();

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
    jit: options?.experimental?.supportAnalogFormat ? false : options?.jit,
    supportAnalogFormat: options?.experimental?.supportAnalogFormat ?? false,
    markdownTemplateTransforms: options?.experimental
      ?.markdownTemplateTransforms?.length
      ? options.experimental.markdownTemplateTransforms
      : defaultMarkdownTemplateTransforms,
    include: options?.include ?? [],
    additionalContentDirs: options?.additionalContentDirs ?? [],
    liveReload: options?.liveReload ?? false,
    disableTypeChecking: options?.disableTypeChecking ?? false,
  };

  // The file emitter created during `onStart` that will be used during the build in `onLoad` callbacks for TS files
  let fileEmitter: FileEmitter | undefined;
  let compilerOptions = {};
  const ts = require('typescript');

  let resolvedConfig: ResolvedConfig;
  let rootNames: string[];
  let host: ts.CompilerHost;
  let nextProgram: NgtscProgram | undefined | ts.Program;
  let builderProgram: ts.EmitAndSemanticDiagnosticsBuilderProgram;
  let watchMode = false;
  let testWatchMode = false;
  let inlineComponentStyles: Map<string, string> | undefined;
  let externalComponentStyles: Map<string, string> | undefined;
  const sourceFileCache = new SourceFileCache();
  const isTest = process.env['NODE_ENV'] === 'test' || !!process.env['VITEST'];
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
  let styleTransform: (
    code: string,
    filename: string
  ) => ReturnType<typeof preprocessCSS> | undefined;

  const styleUrlsResolver = new StyleUrlsResolver();
  const templateUrlsResolver = new TemplateUrlsResolver();

  function angularPlugin(): Plugin {
    let isProd = false;

    if (angularMajor < 19 || isTest) {
      pluginOptions.liveReload = false;
    }

    return {
      name: '@analogjs/vite-plugin-angular',
      async watchChange() {
        if (isTest) {
          await buildAndAnalyze();
        }
      },
      async config(config, { command }) {
        watchMode = command === 'serve';
        isProd =
          config.mode === 'production' ||
          process.env['NODE_ENV'] === 'production';
        pluginOptions.tsconfig =
          options?.tsconfig ??
          resolve(
            config.root || '.',
            process.env['NODE_ENV'] === 'test'
              ? './tsconfig.spec.json'
              : './tsconfig.app.json'
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
                  !isAstroIntegration
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

        // set test watch mode
        // - vite override from vitest-angular
        // - @nx/vite executor set server.watch explicitly to undefined (watch)/null (watch=false)
        // - vite config for test.watch variable
        testWatchMode =
          !(config.server.watch === null) || config.test?.watch === true;
      },
      configureServer(server) {
        viteServer = server;
        server.watcher.on('add', async () => {
          setupCompilation(resolvedConfig);
          await buildAndAnalyze();
        });
        server.watcher.on('unlink', async () => {
          setupCompilation(resolvedConfig);
          await buildAndAnalyze();
        });

        if (pluginOptions.liveReload) {
          const angularComponentMiddleware: Connect.HandleFunction = async (
            req: Connect.IncomingMessage,
            res: ServerResponse<Connect.IncomingMessage>,
            next: Connect.NextFunction
          ) => {
            if (req.url === undefined || res.writableEnded) {
              return;
            }

            if (!req.url.startsWith(ANGULAR_COMPONENT_PREFIX)) {
              next();

              return;
            }

            const requestUrl = new URL(req.url, 'http://localhost');
            const componentId = requestUrl.searchParams.get('c');

            if (!componentId) {
              res.statusCode = 400;
              res.end();

              return;
            }

            const [fileId] = decodeURIComponent(componentId).split('@');
            const resolvedId = resolve(process.cwd(), fileId);
            const invalidated =
              !!server.moduleGraph.getModuleById(resolvedId)
                ?.lastInvalidationTimestamp && classNames.get(resolvedId);

            // don't send an HMR update until the file has been invalidated
            if (!invalidated) {
              res.setHeader('Content-Type', 'text/javascript');
              res.setHeader('Cache-Control', 'no-cache');
              res.end('');
              return;
            }

            const result = await fileEmitter?.(resolvedId);
            res.setHeader('Content-Type', 'text/javascript');
            res.setHeader('Cache-Control', 'no-cache');
            res.end(`${result?.hmrUpdateCode || ''}`);
          };

          viteServer.middlewares.use(angularComponentMiddleware);
        }
      },
      async buildStart() {
        setupCompilation(resolvedConfig);

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
          let [fileId] = ctx.file.split('?');

          if (
            pluginOptions.supportAnalogFormat &&
            ['ag', 'analog', 'agx'].some((ext) => fileId.endsWith(ext))
          ) {
            fileId += '.ts';
          }

          const stale = sourceFileCache.get(fileId);
          sourceFileCache.invalidate([fileId]);
          await buildAndAnalyze();

          const result = await fileEmitter?.(fileId, stale);

          if (
            pluginOptions.liveReload &&
            !!result?.hmrEligible &&
            classNames.get(fileId)
          ) {
            const relativeFileId = `${relative(
              process.cwd(),
              fileId
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
            (mod) => ctx.file === mod.file && mod.id?.includes('?direct')
          );
          if (isDirect) {
            if (pluginOptions.liveReload && isDirect?.id && isDirect.file) {
              const isComponentStyle =
                isDirect.type === 'css' && isComponentStyleSheet(isDirect.id);
              if (isComponentStyle) {
                const { encapsulation } = getComponentStyleSheetMeta(
                  isDirect.id
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

          await buildAndAnalyze();

          if (updates.length > 0) {
            updates.forEach((updateId) => {
              const impRelativeFileId = `${relative(
                process.cwd(),
                updateId
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
            resolve(dirname(importer as string), path)
          )}?raw`;
        }

        // Map angular external styleUrls to the source file
        if (isComponentStyleSheet(id)) {
          const componentStyles = externalComponentStyles?.get(
            getFilenameFromPath(id)
          );
          if (componentStyles) {
            return componentStyles + new URL(id, 'http://localhost').search;
          }
        }

        return undefined;
      },
      async load(id, options) {
        // Map angular inline styles to the source text
        if (isComponentStyleSheet(id)) {
          const componentStyles = inlineComponentStyles?.get(
            getFilenameFromPath(id)
          );
          if (componentStyles) {
            return componentStyles;
          }
        }

        if (
          pluginOptions.liveReload &&
          options?.ssr &&
          id.startsWith(ANGULAR_COMPONENT_PREFIX)
        ) {
          const requestUrl = new URL(id.slice(1), 'http://localhost');
          const componentId = requestUrl.searchParams.get('c');

          if (!componentId) {
            return;
          }

          const result = await fileEmitter?.(
            resolve(
              process.cwd(),
              decodeURIComponent(componentId).split('@')[0]
            )
          );

          return result?.hmrUpdateCode || '';
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
            const tsMod = viteServer?.moduleGraph.getModuleById(id);
            if (tsMod) {
              const invalidated = tsMod.lastInvalidationTimestamp;

              if (testWatchMode && invalidated) {
                sourceFileCache.invalidate([id]);

                await buildAndAnalyze();
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

          const typescriptResult = await fileEmitter?.(id);

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
            const ngFileResult = await fileEmitter!(`${id}.ts`);
            data = ngFileResult?.content || '';

            if (id.includes('.agx')) {
              const metadata = await getFrontmatterMetadata(
                code,
                id,
                pluginOptions.markdownTemplateTransforms || []
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
    };
  }

  return [
    angularPlugin(),
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
  ].filter(Boolean) as Plugin[];

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

    const fg = require('fast-glob');
    const appRoot = normalizePath(
      resolve(pluginOptions.workspaceRoot, config.root || '.')
    );
    const workspaceRoot = normalizePath(resolve(pluginOptions.workspaceRoot));

    const globs = [
      `${appRoot}/**/*.{analog,agx,ag}`,
      ...extraGlobs.map((glob) => `${workspaceRoot}${glob}.{analog,agx,ag}`),
      ...(pluginOptions.additionalContentDirs || [])?.map(
        (glob) => `${workspaceRoot}${glob}/**/*.agx`
      ),
      ...pluginOptions.include.map((glob) =>
        `${workspaceRoot}${glob}`.replace(/\.ts$/, '.analog')
      ),
    ];

    return fg
      .sync(globs, {
        dot: true,
      })
      .map((file: string) => `${file}.ts`);
  }

  function findIncludes() {
    const fg = require('fast-glob');

    const workspaceRoot = normalizePath(resolve(pluginOptions.workspaceRoot));

    const globs = [
      ...pluginOptions.include.map((glob) => `${workspaceRoot}${glob}`),
    ];

    return fg.sync(globs, {
      dot: true,
    });
  }

  function setupCompilation(config: ResolvedConfig, context?: unknown) {
    const isProd = config.mode === 'production';
    const analogFiles = findAnalogFiles(config);
    const includeFiles = findIncludes();

    const { options: tsCompilerOptions, rootNames: rn } =
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

    rootNames = rn.concat(analogFiles, includeFiles);
    compilerOptions = tsCompilerOptions;
    host = ts.createIncrementalCompilerHost(compilerOptions);

    styleTransform = (code: string, filename: string) =>
      preprocessCSS(code, filename, config as any);

    if (!jit) {
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
    let angularCompiler: NgtscProgram['compiler'];

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
        jit ? {} : angularCompiler!.prepareEmit().transformers
      ),
      () => [],
      angularCompiler!,
      pluginOptions.liveReload,
      pluginOptions.disableTypeChecking
    );
  }
}

function sendHMRComponentUpdate(server: ViteDevServer, id: string) {
  server.ws.send('angular:component-update', {
    id: encodeURIComponent(id),
    timestamp: Date.now(),
  });

  classNames.delete(id);
}

export function createFileEmitter(
  program: ts.BuilderProgram,
  transformers: ts.CustomTransformers = {},
  onAfterEmit?: (sourceFile: ts.SourceFile) => void,
  angularCompiler?: NgtscProgram['compiler'],
  liveReload?: boolean,
  disableTypeChecking?: boolean
): FileEmitter {
  return async (file: string, stale?: ts.SourceFile) => {
    const sourceFile = program.getSourceFile(file);
    if (!sourceFile) {
      return undefined;
    }

    if (stale) {
      const hmrEligible = !!analyzeFileUpdates(
        stale,
        sourceFile,
        angularCompiler!
      );
      return { dependencies: [], hmrEligible };
    }

    const diagnostics = getDiagnosticsForSourceFile(
      sourceFile,
      !!disableTypeChecking,
      program,
      angularCompiler
    );

    const errors = diagnostics
      .filter((d) => d.category === ts.DiagnosticCategory?.Error)
      .map((d) => d.messageText);

    const warnings = diagnostics
      .filter((d) => d.category === ts.DiagnosticCategory?.Warning)
      .map((d) => d.messageText);

    let hmrUpdateCode: string | null | undefined = undefined;

    if (liveReload) {
      for (const node of sourceFile.statements) {
        if (ts.isClassDeclaration(node) && node.name != null) {
          hmrUpdateCode = angularCompiler?.emitHmrUpdateModule(node);
          !!hmrUpdateCode && classNames.set(file, node.name.getText());
        }
      }
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

    return { content, dependencies: [], errors, warnings, hmrUpdateCode };
  };
}

function getDiagnosticsForSourceFile(
  sourceFile: ts.SourceFile,
  disableTypeChecking: boolean,
  program: ts.BuilderProgram,
  angularCompiler?: NgtscProgram['compiler']
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

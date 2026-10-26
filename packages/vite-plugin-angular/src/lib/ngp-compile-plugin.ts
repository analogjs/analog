import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type MagicString from 'magic-string';
import * as vite from 'vite';
import {
  discoverAnalogIntegrations,
  type TransformFilter,
} from './analog-plugin-interop.js';
import type { FastCompilePluginOptions } from './fast-compile-plugin.js';
import {
  createDepOptimizerConfig,
  getTsConfigPath,
  isProdMode,
  TS_EXT_REGEX,
  type TsConfigResolutionContext,
} from './utils/plugin-config.js';
import { releaseCssPreprocessorWorkers } from './utils/css-preprocessor-workers.js';
import { angularFullVersion } from './utils/devkit.js';
import { LspTypeChecker } from './utils/lsp-type-checker.js';

// The unpublished NGP API is loaded at runtime. Model only the surface we use.
interface NgpDiagnostic {
  category: number;
  messageText: string;
}

interface NgpFile {
  filePath: string;
  diagnostics?: NgpDiagnostic[];
  classes: {
    component?: {
      templateUrl?: { resolvedPath: string };
      styleUrls?: { resolvedPath: string }[];
      stylesFromUrls?: string[];
      styles?: string[];
    };
  }[];
}

interface NgpChunk {
  files: NgpFile[];
}

interface NgpResult {
  magicString: MagicString;
  diagnostics?: NgpDiagnostic[];
  tcb?: { code: string } | null;
}

interface NgpAnalyzer {
  getFileContent(path: string): Promise<string>;
  updateFileContent(
    updates: { filePath: string; content: string }[],
  ): Promise<string[]>;
  invalidateFiles(
    updates: { filePath: string; updateType: number }[],
  ): Promise<string[]>;
  close(): void;
}

interface NgpCompiler {
  analyzeOptimized(): AsyncIterable<NgpChunk>;
  analyzeOptimizedDelta(): AsyncIterable<NgpChunk>;
  prepareChunk(chunk: NgpChunk): Promise<unknown>;
  processFile(
    path: string,
    content: string,
    ...args: [undefined, NgpFile, unknown] | [NgpFile, unknown]
  ): Promise<NgpResult>;
}

interface NgpAnalyzerOptions {
  nativeBinding?: string;
  backend?: 'wasm';
  wasmBinding?: string;
}

interface NgpApi {
  createAnalyzer(
    tsconfig: string,
    options: NgpAnalyzerOptions,
  ): Promise<NgpAnalyzer>;
  HybridCompiler: new (
    analyzer: NgpAnalyzer,
    options: { optimize: boolean },
  ) => NgpCompiler;
}

// Interim NGP build bundled with this package until @angular/ngp is published
const BUNDLED_NGP = new URL('../../ngp/', import.meta.url);

async function loadNgp(
  tsconfig: string,
): Promise<{ api: NgpApi; analyzerOptions: NgpAnalyzerOptions }> {
  const nativeBinding = process.env['ANALOG_NGP_NATIVE_BINDING'];
  let modulePath = process.env['ANALOG_NGP_COMPILER'];
  if (!modulePath) {
    try {
      modulePath = createRequire(tsconfig).resolve('@angular/ngp');
    } catch {
      if (angularFullVersion < 220200) {
        throw new Error(
          "[@analogjs/vite-plugin-angular]: compilation: 'ngp' requires Angular v22.2 or later.",
        );
      }
      return {
        api: await import(new URL('api.mjs', BUNDLED_NGP).href),
        analyzerOptions: nativeBinding
          ? { nativeBinding }
          : {
              backend: 'wasm',
              wasmBinding: fileURLToPath(
                new URL('ng_analyze.cjs', BUNDLED_NGP),
              ),
            },
      };
    }
  }
  return {
    api: await import(pathToFileURL(resolve(modulePath)).href),
    analyzerOptions: nativeBinding ? { nativeBinding } : {},
  };
}

export function ngpCompilePlugin(
  options: FastCompilePluginOptions,
): vite.Plugin {
  if (options.jit || options.fastCompileMode === 'partial') {
    throw new Error(
      "compilation: 'ngp' requires jit: false and fastCompileMode: 'full'.",
    );
  }

  let configContext: TsConfigResolutionContext;
  let resolvedConfig: vite.ResolvedConfig;
  let transformFilter: TransformFilter | undefined;
  let watchMode = false;
  let activeBuilds = 0;
  let analyzer: NgpAnalyzer | undefined;
  let compiler: NgpCompiler | undefined;
  let typeChecker: LspTypeChecker | undefined;
  let api: NgpApi;
  const filesByPath = new Map<string, { file: NgpFile; chunk: NgpChunk }>();
  const chunkContexts = new Map<NgpChunk, Promise<unknown>>();
  const output = new Map<string, Promise<NgpResult>>();
  const watchedFiles = new Set<string>();
  let pending = Promise.resolve();
  const filter = vite.createFilter(TS_EXT_REGEX, [
    /node_modules/,
    /[?&]raw\b/,
    /type=script/,
    /@ng\/component/,
  ]);

  function resolveTsConfigPath() {
    return getTsConfigPath(
      configContext.root,
      options.tsconfigGetter(),
      configContext.isProd,
      options.isTest,
      configContext.isLib,
      options.workspaceRoot,
    );
  }

  async function prepareResources(
    file: NgpFile,
    watch: (path: string) => void,
  ): Promise<NgpFile> {
    watch(file.filePath);
    return {
      ...file,
      classes: await Promise.all(
        file.classes.map(async (metadata, classIndex) => {
          const component = metadata.component;
          if (!component) return metadata;
          if (component.templateUrl) watch(component.templateUrl.resolvedPath);
          for (const style of component.styleUrls ?? [])
            watch(style.resolvedPath);
          const preprocess = async (content: string, path: string) => {
            const result = await vite.preprocessCSS(
              content,
              path,
              resolvedConfig,
            );
            result.deps?.forEach(watch);
            return result.code;
          };
          return {
            ...metadata,
            component: {
              ...component,
              styles:
                component.styles &&
                (await Promise.all(
                  component.styles.map((style, index) =>
                    preprocess(
                      style,
                      `${file.filePath}.inline-${classIndex}-${index}.${options.inlineStylesExtension}`,
                    ),
                  ),
                )),
              stylesFromUrls:
                component.stylesFromUrls &&
                (await Promise.all(
                  component.stylesFromUrls.map((style, index) =>
                    preprocess(style, component.styleUrls![index].resolvedPath),
                  ),
                )),
            },
          };
        }),
      ),
    };
  }

  async function indexChunks(update?: () => Promise<string[]>) {
    if (update) {
      const invalidated = await update();
      for (const filePath of invalidated) {
        output.delete(vite.normalizePath(filePath));
      }
      chunkContexts.clear();
    } else {
      filesByPath.clear();
      chunkContexts.clear();
      output.clear();
      compiler = new api.HybridCompiler(analyzer!, { optimize: true });
    }
    const chunks = update
      ? compiler!.analyzeOptimizedDelta()
      : compiler!.analyzeOptimized();
    for await (const chunk of chunks) {
      for (const file of chunk.files) {
        const normPath = vite.normalizePath(file.filePath);
        filesByPath.set(normPath, { file, chunk });
        output.delete(normPath);
      }
    }
  }

  function enqueueIndex(update: () => Promise<string[]>) {
    pending = pending.catch(() => {}).then(() => indexChunks(update));
    return pending;
  }

  function getChunkContext(chunk: NgpChunk): Promise<unknown> {
    let context = chunkContexts.get(chunk);
    if (!context) {
      context = compiler!.prepareChunk(chunk);
      chunkContexts.set(chunk, context);
    }
    return context;
  }

  async function checkTypes(
    filePath: string,
    sourceCode: string,
    tcbCode?: string | null,
  ) {
    typeChecker ??= new LspTypeChecker(
      resolveTsConfigPath(),
      options.typeChecker,
    );
    typeChecker.queueFile(filePath, sourceCode, tcbCode);
    if (!watchMode) return;
    const typeErrors = await typeChecker.flushQueue(true);
    if (typeErrors.length) {
      throw new Error(typeErrors.join('\n'));
    }
  }

  function compileFile(
    normPath: string,
    watch: (path: string) => void,
  ): Promise<NgpResult> | undefined {
    const entry = filesByPath.get(normPath);
    if (!entry) return undefined;
    let task = output.get(normPath);
    if (!task) {
      task = (async () => {
        const activeAnalyzer = analyzer!;
        const activeCompiler = compiler!;
        const trackWatch = (path: string) => {
          watchedFiles.add(path);
          watch(path);
        };
        const [file, context, content] = await Promise.all([
          prepareResources(entry.file, trackWatch),
          getChunkContext(entry.chunk),
          activeAnalyzer.getFileContent(entry.file.filePath),
        ]);
        const result =
          activeCompiler.processFile.length >= 5
            ? await activeCompiler.processFile(
                file.filePath,
                content,
                undefined,
                file,
                context,
              )
            : await activeCompiler.processFile(
                file.filePath,
                content,
                file,
                context,
              );
        const errors = [
          ...(file.diagnostics ?? []),
          ...(result.diagnostics ?? []),
        ].filter((diagnostic) => diagnostic.category === 1);
        if (errors.length) {
          throw new Error(
            `${file.filePath}: ${errors.map((error) => error.messageText).join('\n')}`,
          );
        }
        if (options.disableTypeChecking !== true) {
          await checkTypes(file.filePath, content, result.tcb?.code);
        }
        return result;
      })();
      output.set(normPath, task);
    }
    return task;
  }

  return {
    name: '@analogjs/vite-plugin-angular-ngp',
    enforce: 'pre',
    api: { getTsConfigPath: resolveTsConfigPath, output, ready: () => pending },
    config(config, { command }) {
      watchMode = command === 'serve';
      configContext = {
        root: config.root || '.',
        isProd: isProdMode(config.mode),
        isLib: !!config.build?.lib,
      };
      const depOptimizer = createDepOptimizerConfig({
        tsconfig: resolveTsConfigPath(),
        isProd: configContext.isProd,
        jit: false,
        watchMode,
        isTest: options.isTest,
        isAstroIntegration: options.isAstroIntegration,
      });
      return {
        ...(vite.rolldownVersion ? { oxc: {} as any } : { esbuild: false }),
        ...depOptimizer,
      };
    },
    async configResolved(config) {
      resolvedConfig = config;
      const integrations = await discoverAnalogIntegrations(config);
      transformFilter = integrations.transformFilter;
    },
    configureServer(server) {
      server.httpServer?.on('close', () => {
        typeChecker?.close();
        typeChecker = undefined;
        analyzer?.close();
        analyzer = undefined;
        compiler = undefined;
      });
    },
    async buildStart() {
      activeBuilds++;
      if (!analyzer) {
        const tsconfig = resolveTsConfigPath();
        const ngp = await loadNgp(tsconfig);
        api = ngp.api;
        analyzer = await api.createAnalyzer(tsconfig, ngp.analyzerOptions);
        pending = indexChunks();
      }
      await pending;
      for (const path of watchedFiles) {
        this.addWatchFile(path);
      }
    },
    async transform(code, id) {
      if (!filter(id) || transformFilter?.(code, id) === false) return;
      const filePath = vite.normalizePath(id.split('?')[0]);
      await pending;
      let result = await compileFile(filePath, (path) =>
        this.addWatchFile(path),
      );
      if (result && result.magicString.original !== code) {
        await enqueueIndex(() =>
          analyzer!.updateFileContent([{ filePath, content: code }]),
        );
        result = await compileFile(filePath, (path) => this.addWatchFile(path));
      } else if (!result && options.disableTypeChecking !== true) {
        await checkTypes(filePath, code);
      }
      const source = result?.magicString.toString() ?? code;
      const map = result?.magicString.generateMap({
        source: filePath,
        includeContent: true,
        hires: true,
      });
      return vite.transformWithOxc
        ? vite.transformWithOxc(
            source,
            filePath,
            { lang: 'ts', sourcemap: true },
            map,
          )
        : vite.transformWithEsbuild(
            source,
            filePath,
            { loader: 'ts', sourcemap: true },
            map,
          );
    },
    async handleHotUpdate(ctx) {
      await enqueueIndex(() =>
        analyzer!.invalidateFiles([{ filePath: ctx.file, updateType: 2 }]),
      );
      ctx.server.moduleGraph.invalidateAll();
      ctx.server.ws.send({ type: 'full-reload' });
      return [];
    },
    async buildEnd(error) {
      if (error || watchMode || !typeChecker) return;
      const typeErrors = await typeChecker.flushQueue();
      if (typeErrors.length) {
        throw new Error(typeErrors.join('\n'));
      }
    },
    async closeBundle() {
      activeBuilds = Math.max(0, activeBuilds - 1);
      if (watchMode || activeBuilds > 0) return;
      await pending.catch(() => {});
      typeChecker?.close();
      typeChecker = undefined;
      analyzer?.close();
      analyzer = undefined;
      compiler = undefined;
      filesByPath.clear();
      chunkContexts.clear();
      output.clear();
      watchedFiles.clear();
      releaseCssPreprocessorWorkers();
    },
  };
}

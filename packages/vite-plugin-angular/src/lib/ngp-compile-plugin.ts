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
import { findHmrComponentUpdates } from './utils/hmr-component-updates.js';
import {
  LspTypeChecker,
  type FileChangeType,
} from './utils/lsp-type-checker.js';
import type { ComponentUpdates } from './live-reload-plugin.js';

// The unpublished NGP API is loaded at runtime. Model only the surface we use.
interface NgpDiagnostic {
  category: number;
  messageText: string;
}

interface NgpFile {
  filePath: string;
  diagnostics?: NgpDiagnostic[];
  classes: {
    className?: string;
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
  hmrUpdateModule?: string | null;
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
  // Parsed templates by file, cleared by NGP's own update methods
  fileCache: Map<string, unknown>;
  analyzeOptimized(): AsyncIterable<NgpChunk>;
  analyzeOptimizedDelta(): AsyncIterable<NgpChunk>;
  prepareChunk(chunk: NgpChunk): Promise<unknown>;
  processFile(
    path: string,
    content: string,
    ...args: [undefined, NgpFile, unknown] | [NgpFile, unknown]
  ): Promise<NgpResult>;
}

interface ComponentUpdate {
  file: string;
  className: string;
}

interface NgpAnalyzerOptions {
  nativeBinding?: string;
  backend?: 'wasm';
  wasmBinding?: string;
  enableHmr?: boolean;
}

interface NgpApi {
  createAnalyzer(
    tsconfig: string,
    options: NgpAnalyzerOptions,
  ): Promise<NgpAnalyzer>;
  HybridCompiler: new (
    analyzer: NgpAnalyzer,
    options: { optimize: boolean; enableHmr: boolean },
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

function transpile(
  source: string,
  filePath: string,
  map?: Parameters<typeof vite.transformWithEsbuild>[3],
) {
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
  let hmr = false;
  let activeBuilds = 0;
  let analyzer: NgpAnalyzer | undefined;
  let compiler: NgpCompiler | undefined;
  let typeChecker: LspTypeChecker | undefined;
  let api: NgpApi;
  const filesByPath = new Map<string, { file: NgpFile; chunk: NgpChunk }>();
  const chunkContexts = new Map<NgpChunk, Promise<unknown>>();
  const output = new Map<string, Promise<NgpResult>>();
  // Last compiled source of each file, compared on edits for HMR
  const sources = new Map<string, string>();
  // Watched files mapped to the source files that depend on them
  const dependents = new Map<string, Set<string>>();
  const hmrUpdateCode = new Map<string, string>();
  const componentUpdates: ComponentUpdates = {
    classNames: new Map(),
    fileEmitter: (file, className) => ({
      hmrUpdateCode: hmrUpdateCode.get(`${file}@${className}`),
    }),
  };
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
        compiler!.fileCache.delete(filePath);
      }
      chunkContexts.clear();
    } else {
      filesByPath.clear();
      chunkContexts.clear();
      output.clear();
      compiler = new api.HybridCompiler(analyzer!, {
        optimize: true,
        enableHmr: hmr,
      });
    }
    const chunks = update
      ? compiler!.analyzeOptimizedDelta()
      : compiler!.analyzeOptimized();
    for await (const chunk of chunks) {
      for (const file of chunk.files) {
        const normPath = vite.normalizePath(file.filePath);
        filesByPath.set(normPath, { file, chunk });
        output.delete(normPath);
        compiler!.fileCache.delete(file.filePath);
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

  async function processFile(
    normPath: string,
    activeCompiler: NgpCompiler,
    watch: (path: string) => void,
  ) {
    const { file: analyzed, chunk } = filesByPath.get(normPath)!;
    const [file, context, content] = await Promise.all([
      prepareResources(analyzed, (path) => {
        const key = vite.normalizePath(path);
        dependents.set(key, (dependents.get(key) ?? new Set()).add(normPath));
        watch(path);
      }),
      getChunkContext(chunk),
      analyzer!.getFileContent(analyzed.filePath),
    ]);
    sources.set(normPath, content);
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
    return { file, content, result };
  }

  function compileFile(
    normPath: string,
    watch: (path: string) => void,
  ): Promise<NgpResult> | undefined {
    if (!filesByPath.has(normPath)) return undefined;
    let task = output.get(normPath);
    if (!task) {
      task = (async () => {
        const { file, content, result } = await processFile(
          normPath,
          compiler!,
          watch,
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

  function componentNames(normPath: string) {
    return (filesByPath.get(normPath)?.file.classes ?? []).flatMap(
      ({ className, component }) => (component && className ? [className] : []),
    );
  }

  // Components to update in place, following the Angular CLI's rule
  async function findComponentUpdates(
    normPath: string,
    read: () => string | Promise<string>,
  ): Promise<ComponentUpdate[]> {
    if (!TS_EXT_REGEX.test(normPath)) {
      return [...(dependents.get(normPath) ?? [])].flatMap((file) =>
        componentNames(file).map((className) => ({ file, className })),
      );
    }
    const stale = sources.get(normPath);
    if (stale === undefined) return [];
    const classNames = findHmrComponentUpdates(
      normPath,
      stale,
      await read(),
      new Set(componentNames(normPath)),
    );
    return (classNames ?? []).map((className) => ({
      file: normPath,
      className,
    }));
  }

  async function emitHmrUpdate(file: string, className: string) {
    // NGP emits only the update module of the class named by `hmrUpdateTarget`
    const target = Object.assign(
      Object.create(Object.getPrototypeOf(compiler)),
      compiler,
      { hmrUpdateTarget: className },
    );
    const { result } = await processFile(file, target, () => {});
    return (
      result.hmrUpdateModule &&
      (await transpile(result.hmrUpdateModule, file)).code
    );
  }

  async function sendComponentUpdates(
    updates: ComponentUpdate[],
    server: vite.ViteDevServer,
  ) {
    try {
      for (const file of new Set(updates.map((update) => update.file))) {
        await compileFile(file, () => {});
      }
      const codes = await Promise.all(
        updates.map(({ file, className }) => emitHmrUpdate(file, className)),
      );
      if (codes.some((code) => !code)) return false;
      updates.forEach(({ file, className }, index) => {
        hmrUpdateCode.set(`${file}@${className}`, codes[index]!);
        componentUpdates.classNames.set(file, className);
        server.moduleGraph
          .getModulesByFile(file)
          ?.forEach((mod) => server.moduleGraph.invalidateModule(mod));
        server.ws.send('angular:component-update', {
          id: encodeURIComponent(
            `${filesByPath.get(file)!.file.filePath}@${className}`,
          ),
          timestamp: Date.now(),
        });
      });
      return true;
    } catch {
      // A full reload reports the compilation error
      return false;
    }
  }

  return {
    name: '@analogjs/vite-plugin-angular-ngp',
    enforce: 'pre',
    api: {
      getTsConfigPath: resolveTsConfigPath,
      output,
      ready: () => pending,
      componentUpdates,
    },
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
      hmr =
        watchMode &&
        options.liveReload &&
        !options.isTest &&
        config.server.hmr !== false;
      const integrations = await discoverAnalogIntegrations(config);
      transformFilter = integrations.transformFilter;
    },
    configureServer(server) {
      const changeTypes: Record<string, FileChangeType> = {
        add: 1,
        change: 2,
        unlink: 3,
      };
      server.watcher.on('all', (event, path) => {
        const type = changeTypes[event];
        if (type) typeChecker?.notifyFileChanged(path, type);
      });
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
        analyzer = await api.createAnalyzer(tsconfig, {
          ...ngp.analyzerOptions,
          enableHmr: hmr,
        });
        pending = indexChunks();
      }
      await pending;
      for (const path of dependents.keys()) {
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
      return transpile(source, filePath, map);
    },
    async handleHotUpdate(ctx) {
      const normPath = vite.normalizePath(ctx.file);
      const updates = hmr ? await findComponentUpdates(normPath, ctx.read) : [];
      await enqueueIndex(() =>
        analyzer!.invalidateFiles([{ filePath: ctx.file, updateType: 2 }]),
      );
      if (updates.length && (await sendComponentUpdates(updates, ctx.server))) {
        return [];
      }
      hmrUpdateCode.clear();
      componentUpdates.classNames.clear();
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
      sources.clear();
      dependents.clear();
      releaseCssPreprocessorWorkers();
    },
  };
}

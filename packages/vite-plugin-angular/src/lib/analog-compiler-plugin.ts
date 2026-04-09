import { promises as fsPromises } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import * as vite from 'vite';

import * as compilerCli from '@angular/compiler-cli';
import {
  defaultClientConditions,
  normalizePath,
  Plugin,
  preprocessCSS,
  ResolvedConfig,
} from 'vite';

import {
  compile,
  scanFile,
  scanPackageDts,
  collectImportedPackages,
  jitTransform,
  inlineResourceUrls,
  extractInlineStyles,
  generateHmrCode,
  type ComponentRegistry,
} from '@analogjs/angular-compiler';

import {
  TS_EXT_REGEX,
  getTsConfigPath,
  createDepOptimizerConfig,
  type TsConfigResolutionContext,
} from './utils/plugin-config.js';

export interface AnalogCompilerPluginOptions {
  tsconfigGetter: () => string;
  workspaceRoot: string;
  inlineStylesExtension: string;
  jit: boolean;
  liveReload: boolean;
  supportedBrowsers: string[];
  transformFilter?: (code: string, id: string) => boolean;
  isTest: boolean;
  isAstroIntegration: boolean;
  analogCompilationMode?: 'full' | 'partial';
}

export function analogCompilerPlugin(
  pluginOptions: AnalogCompilerPluginOptions,
): Plugin {
  let resolvedConfig: ResolvedConfig;
  let tsConfigResolutionContext: TsConfigResolutionContext | null = null;
  let watchMode = false;

  // Analog compiler state
  const analogRegistry: ComponentRegistry = new Map();
  const analogResourceToSource = new Map<string, string>();
  const scannedDtsPackages = new Set<string>();
  let analogProjectRoot = '';
  let useDefineForClassFields = true;

  async function initAnalogCompiler() {
    if (pluginOptions.jit) return; // JIT: no registry scan needed

    // Scan all source files to build the registry
    analogRegistry.clear();
    scannedDtsPackages.clear();
    const resolvedTsConfigPath = resolveTsConfigPath();
    analogProjectRoot = dirname(resolvedTsConfigPath);
    const config = compilerCli.readConfiguration(resolvedTsConfigPath);
    useDefineForClassFields = config.options?.useDefineForClassFields ?? true;

    const results = await Promise.all(
      config.rootNames.map(async (file) => {
        try {
          const code = await fsPromises.readFile(file, 'utf-8');
          return scanFile(code, file);
        } catch {
          return []; // Skip unreadable files
        }
      }),
    );

    for (const entries of results) {
      for (const entry of entries) {
        analogRegistry.set(entry.className, entry);
      }
    }
  }

  function ensureDtsRegistryForSource(code: string, id: string) {
    for (const pkg of collectImportedPackages(code, id)) {
      if (scannedDtsPackages.has(pkg)) continue;
      scannedDtsPackages.add(pkg);

      try {
        const dtsEntries = scanPackageDts(pkg, analogProjectRoot);
        for (const entry of dtsEntries) {
          if (!analogRegistry.has(entry.className)) {
            analogRegistry.set(entry.className, entry);
          }
        }
      } catch {
        // Package may not have .d.ts files or may not be Angular
      }
    }
  }

  async function handleAnalogCompilerTransform(
    code: string,
    id: string,
  ): Promise<{ code: string; map: any } | undefined> {
    if (!/(Component|Directive|Pipe|Injectable|NgModule)\(/.test(code)) {
      return undefined;
    }

    // JIT mode
    if (pluginOptions.jit) {
      const result = jitTransform(code, id);
      return { code: result.code, map: result.map };
    }

    // Inline external templateUrl/styleUrl(s) into the source before compilation
    code = inlineResourceUrls(code, id);

    // Pre-resolve inline styles that need preprocessing (SCSS/Sass/Less)
    let resolvedStyles: Map<string, string> | undefined;
    let resolvedInlineStyles: Map<number, string> | undefined;

    if (pluginOptions.inlineStylesExtension !== 'css') {
      const styleStrings = extractInlineStyles(code, id);

      if (styleStrings.length > 0) {
        resolvedInlineStyles = new Map();
        for (let i = 0; i < styleStrings.length; i++) {
          try {
            const fakePath = id.replace(
              /\.ts$/,
              `.inline-${i}.${pluginOptions.inlineStylesExtension}`,
            );
            const processed = await preprocessCSS(
              styleStrings[i],
              fakePath,
              resolvedConfig,
            );
            resolvedInlineStyles.set(i, processed.code);
          } catch {
            // Skip styles that can't be preprocessed
          }
        }
        if (resolvedInlineStyles.size === 0) resolvedInlineStyles = undefined;
      }
    }

    ensureDtsRegistryForSource(code, id);

    const result = compile(code, id, {
      registry: analogRegistry,
      resolvedStyles,
      resolvedInlineStyles,
      useDefineForClassFields,
      compilationMode: pluginOptions.analogCompilationMode,
    });

    // Track resource dependencies for HMR
    for (const dep of result.resourceDependencies) {
      analogResourceToSource.set(dep, id);
    }

    // Strip TypeScript-only syntax
    const stripped = vite.transformWithOxc
      ? await vite.transformWithOxc(result.code, id, {
          lang: 'ts',
          sourcemap: false,
          decorator: { legacy: false, emitDecoratorMetadata: false },
        })
      : await vite.transformWithEsbuild(result.code, id, {
          loader: 'ts',
          sourcemap: false,
        });
    let outputCode = stripped.code;

    // Append HMR code in dev mode
    if (watchMode && pluginOptions.liveReload) {
      const fileDeclarations = [...analogRegistry.values()].filter(
        (e) => e.fileName === id,
      );
      if (fileDeclarations.length > 0) {
        const localDepClassNames = fileDeclarations.map((e) => e.className);
        outputCode += generateHmrCode(fileDeclarations, localDepClassNames);
      }
    }

    return { code: outputCode, map: result.map };
  }

  function resolveTsConfigPath() {
    const { root, isProd, isLib } = tsConfigResolutionContext!;
    return getTsConfigPath(
      root,
      pluginOptions.tsconfigGetter(),
      isProd,
      pluginOptions.isTest,
      isLib,
    );
  }

  return {
    name: '@analogjs/vite-plugin-angular-compiler',
    enforce: 'pre' as const,
    async config(config, { command }) {
      watchMode = command === 'serve';
      const isProd =
        config.mode === 'production' ||
        process.env['NODE_ENV'] === 'production';

      tsConfigResolutionContext = {
        root: config.root || '.',
        isProd,
        isLib: !!config?.build?.lib,
      };

      const preliminaryTsConfigPath = resolveTsConfigPath();

      const depOptimizer = createDepOptimizerConfig({
        tsconfig: preliminaryTsConfigPath,
        isProd,
        jit: pluginOptions.jit,
        watchMode,
        isTest: pluginOptions.isTest,
        isAstroIntegration: pluginOptions.isAstroIntegration,
      });

      return {
        ...(vite.rolldownVersion ? { oxc: {} as any } : { esbuild: false }),
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
    },
    configureServer(server) {
      // Watch for new .ts files and scan them into the registry
      server.watcher.on('add', async (filePath) => {
        if (
          filePath.endsWith('.ts') &&
          !filePath.endsWith('.spec.ts') &&
          !filePath.endsWith('.d.ts')
        ) {
          try {
            const code = await fsPromises.readFile(filePath, 'utf-8');
            const entries = scanFile(code, filePath);
            for (const entry of entries) {
              analogRegistry.set(entry.className, entry);
            }
          } catch {
            // Skip unreadable files
          }
        }
      });
    },
    async buildStart() {
      await initAnalogCompiler();
    },
    async handleHotUpdate(ctx) {
      // Resource file changes → invalidate parent .ts module
      if (analogResourceToSource.has(ctx.file)) {
        const parentSource = analogResourceToSource.get(ctx.file)!;
        const parentModule = ctx.server.moduleGraph.getModuleById(parentSource);
        if (parentModule) {
          return [parentModule];
        }
      }

      if (TS_EXT_REGEX.test(ctx.file)) {
        const [fileId] = ctx.file.split('?');
        const code = await fsPromises.readFile(fileId, 'utf-8');

        // Remove old entries from this file
        const oldEntries = [...analogRegistry.entries()]
          .filter(([_, v]) => v.fileName === fileId)
          .map(([k]) => k);
        for (const key of oldEntries) {
          analogRegistry.delete(key);
        }

        // Rescan the changed file
        const newEntries = scanFile(code, fileId);
        for (const entry of newEntries) {
          analogRegistry.set(entry.className, entry);
        }
      }

      // Let Vite handle the rest — the transform hook will recompile
      return ctx.modules;
    },
    resolveId(id, importer) {
      if (pluginOptions.jit && id.startsWith('angular:jit:')) {
        const path = id.split(';')[1];
        return `${normalizePath(
          resolve(dirname(importer as string), path),
        )}?${id.includes(':style') ? 'analog-inline' : 'analog-raw'}`;
      }

      // Intercept .html?raw imports to bypass Vite 7.3.2+ server.fs restrictions
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

      // Intercept style ?inline imports to bypass Vite 8.0.5+ server.fs restrictions
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

      return undefined;
    },
    async load(id) {
      // Handle Angular template raw imports
      if (id.endsWith('?analog-raw')) {
        const filePath = id.slice(0, -'?analog-raw'.length);
        const content = await fsPromises.readFile(filePath, 'utf-8');
        return `export default ${JSON.stringify(content)}`;
      }

      // Handle Angular style imports
      if (id.includes('?analog-inline')) {
        const filePath = id.split('?')[0];
        const code = await fsPromises.readFile(filePath, 'utf-8');
        const result = await preprocessCSS(code, filePath, resolvedConfig);
        return `export default ${JSON.stringify(result.code)}`;
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
        if (
          pluginOptions.transformFilter &&
          !(pluginOptions.transformFilter(code, id) ?? true)
        ) {
          return;
        }

        if (id.includes('.ts?')) {
          id = id.replace(/\?(.*)/, '');
        }
        return handleAnalogCompilerTransform(code, id);
      },
    },
  };
}

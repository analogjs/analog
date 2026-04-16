import { promises as fsPromises } from 'node:fs';
import { dirname, resolve } from 'node:path';
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
  collectRelativeReExports,
  jitTransform,
  inlineResourceUrls,
  extractInlineStyles,
  generateHmrCode,
  debugCompile,
  debugRegistry,
  type ComponentRegistry,
} from './compiler/index.js';

import {
  TS_EXT_REGEX,
  getTsConfigPath,
  createDepOptimizerConfig,
  type TsConfigResolutionContext,
} from './utils/plugin-config.js';
import {
  VIRTUAL_RAW_PREFIX,
  VIRTUAL_STYLE_PREFIX,
  toVirtualRawId,
  toVirtualStyleId,
} from './utils/virtual-ids.js';
import {
  loadVirtualRawModule,
  loadVirtualStyleModule,
  rewriteHtmlRawImport,
  rewriteInlineStyleImport,
  shouldPreprocessTestCss,
} from './utils/virtual-resources.js';

export interface FastCompilePluginOptions {
  tsconfigGetter: () => string;
  workspaceRoot: string;
  inlineStylesExtension: string;
  jit: boolean;
  liveReload: boolean;
  supportedBrowsers: string[];
  transformFilter?: (code: string, id: string) => boolean;
  isTest: boolean;
  isAstroIntegration: boolean;
  fastCompileMode?: 'full' | 'partial';
}

export function fastCompilePlugin(
  pluginOptions: FastCompilePluginOptions,
): Plugin {
  let resolvedConfig: ResolvedConfig;
  let tsConfigResolutionContext: TsConfigResolutionContext | null = null;
  let watchMode = false;

  // fast-compile plugin state
  const registry: ComponentRegistry = new Map();
  const resourceToSource = new Map<string, string>();
  const scannedDtsPackages = new Set<string>();
  let projectRoot = '';
  let useDefineForClassFields = true;

  /**
   * Scan a file into the registry, then recursively walk its relative
   * `export *` / `export { … } from './x'` chain so any underlying
   * directive classes also land in the registry. Used both at
   * `buildStart` (for tsconfig path entries) and at dev time (file
   * `add` and `handleHotUpdate`) so newly added barrels stay in sync
   * without requiring a server restart.
   *
   * The `visited` set prevents infinite recursion within a single
   * top-level call. Each fresh scan should pass an empty set (so HMR
   * re-scans aren't blocked by buildStart's earlier visits).
   */
  async function scanBarrelExports(
    file: string,
    visited: Set<string> = new Set(),
    overwrite = false,
  ): Promise<void> {
    if (visited.has(file)) return;
    visited.add(file);
    let code: string;
    try {
      code = await fsPromises.readFile(file, 'utf-8');
    } catch (e) {
      if (debugRegistry.enabled) {
        debugRegistry(
          'scanBarrelExports: failed to read %s: %s',
          file,
          (e as Error)?.message,
        );
      }
      return;
    }
    const entries = scanFile(code, file);
    for (const entry of entries) {
      // At buildStart we want stable registry entries (don't overwrite
      // an earlier scan with a barrel re-scan); HMR explicitly asks
      // for overwrite so updated metadata replaces stale entries.
      if (overwrite || !registry.has(entry.className)) {
        registry.set(entry.className, entry);
      }
    }
    // Collect every relative re-export specifier via OXC AST so
    // recursive scans can't trip over each other (a shared `/g` regex
    // would have its `lastIndex` reset by each recursive call and
    // silently skip half of an outer barrel's re-exports, which
    // previously left directives like `HlmRadioGroup` unregistered).
    const dir = dirname(file);
    for (const rel of collectRelativeReExports(code, file)) {
      // NodeNext-style libraries write `export * from './foo.js'`
      // even though the source is `./foo.ts`. Strip the ESM
      // extension before probing or the candidates would be
      // `foo.js.ts` / `foo.js/index.ts`, which never exist.
      const normalizedRel = rel.replace(/\.(?:js|mjs)$/u, '');
      const reExportCandidates = [
        resolve(dir, normalizedRel + '.ts'),
        resolve(dir, normalizedRel, 'index.ts'),
      ];
      let resolved = false;
      for (const candidate of reExportCandidates) {
        try {
          await fsPromises.access(candidate);
          await scanBarrelExports(candidate, visited, overwrite);
          resolved = true;
          break;
        } catch {
          // try next candidate
        }
      }
      if (!resolved && debugRegistry.enabled) {
        debugRegistry(
          'scanBarrelExports: %s re-export %s did not resolve to %o',
          file,
          rel,
          reExportCandidates,
        );
      }
    }
  }

  async function initFastCompile() {
    if (pluginOptions.jit) return; // JIT: no registry scan needed

    // Scan all source files to build the registry
    registry.clear();
    scannedDtsPackages.clear();
    const resolvedTsConfigPath = resolveTsConfigPath();
    projectRoot = dirname(resolvedTsConfigPath);
    const config = compilerCli.readConfiguration(resolvedTsConfigPath);
    useDefineForClassFields = config.options?.useDefineForClassFields ?? true;

    // Collect candidate files: tsconfig rootNames PLUS the entry points
    // named in `compilerOptions.paths`. App tsconfigs typically only
    // include the app's own sources, so workspace library entry barrels
    // (e.g. `HlmSelectImports = [HlmSelect, HlmSelectContent, ...] as
    // const`) live outside `rootNames` and would otherwise miss the
    // initial scan. The compiler then can't see that `HlmSelectImports`
    // is a tuple barrel and emits the bare identifier into the parent
    // component's `dependencies()` list, where Angular's runtime
    // silently drops it because arrays don't have a directive def.
    const candidates = new Set<string>(config.rootNames);
    const tsPaths = config.options?.paths;
    const baseUrl = (config.options?.baseUrl ?? projectRoot) as string;
    if (tsPaths) {
      for (const targets of Object.values(tsPaths)) {
        for (const target of targets as string[]) {
          // Skip wildcard patterns — entry barrels are normally exact
          // file paths like "libs/helm/select/src/index.ts".
          if (target.includes('*')) continue;
          candidates.add(resolve(baseUrl, target));
        }
      }
    }
    const results = await Promise.all(
      Array.from(candidates).map(async (file) => {
        try {
          const code = await fsPromises.readFile(file, 'utf-8');
          return scanFile(code, file);
        } catch (e) {
          if (debugRegistry.enabled) {
            debugRegistry(
              'initFastCompile: skipping unreadable %s: %s',
              file,
              (e as Error)?.message,
            );
          }
          return []; // Skip unreadable files
        }
      }),
    );

    for (const entries of results) {
      for (const entry of entries) {
        registry.set(entry.className, entry);
      }
    }

    // Library barrels typically `export * from './lib/...'` rather than
    // declaring directives directly, so the entry file alone gives us
    // the tuple consts but not the directive classes they reference.
    // Walk the relative `export *` chain so the underlying classes also
    // land in the registry. Use a SHARED visited set across all
    // barrels so recursive walks don't double-scan a file that's
    // re-exported from multiple entry points.
    const buildStartVisited = new Set<string>();
    if (tsPaths) {
      const barrelCandidates: string[] = [];
      for (const targets of Object.values(tsPaths)) {
        for (const target of targets as string[]) {
          if (target.includes('*')) continue;
          barrelCandidates.push(resolve(baseUrl, target));
        }
      }
      await Promise.all(
        barrelCandidates.map((c) => scanBarrelExports(c, buildStartVisited)),
      );
    }
    debugRegistry(
      'initFastCompile done: %d entries from %d candidate files',
      registry.size,
      candidates.size,
    );
  }

  function ensureDtsRegistryForSource(code: string, id: string) {
    for (const pkg of collectImportedPackages(code, id)) {
      if (scannedDtsPackages.has(pkg)) continue;
      scannedDtsPackages.add(pkg);

      try {
        const dtsEntries = scanPackageDts(pkg, projectRoot);
        for (const entry of dtsEntries) {
          if (!registry.has(entry.className)) {
            registry.set(entry.className, entry);
          }
        }
      } catch {
        // Package may not have .d.ts files or may not be Angular
      }
    }
  }

  async function handleFastCompileTransform(
    code: string,
    id: string,
  ): Promise<{ code: string; map: any } | undefined> {
    if (!/(Component|Directive|Pipe|Injectable|NgModule)\(/.test(code)) {
      // Non-Angular file — leave it alone so a downstream plugin (or
      // Vite's built-in TS handler) can process it.
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
            // In tests, mirror Vitest's `test.css` rules — defaults to no
            // preprocessing (matches Vite's CSS pipeline behavior). (#2297)
            if (!shouldPreprocessTestCss(resolvedConfig, fakePath)) {
              resolvedInlineStyles.set(i, styleStrings[i]);
              continue;
            }
            const processed = await preprocessCSS(
              styleStrings[i],
              fakePath,
              resolvedConfig,
            );
            resolvedInlineStyles.set(i, processed.code);
          } catch (e) {
            if (debugCompile.enabled) {
              debugCompile(
                'inline style #%d preprocessing failed in %s: %s',
                i,
                id,
                (e as Error)?.message,
              );
            }
            // Skip styles that can't be preprocessed
          }
        }
        if (resolvedInlineStyles.size === 0) resolvedInlineStyles = undefined;
      }
    }

    ensureDtsRegistryForSource(code, id);

    const result = compile(code, id, {
      registry,
      resolvedStyles,
      resolvedInlineStyles,
      useDefineForClassFields,
      compilationMode: pluginOptions.fastCompileMode,
    });

    // Track resource dependencies for HMR
    for (const dep of result.resourceDependencies) {
      resourceToSource.set(dep, id);
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
      const fileDeclarations = [...registry.values()].filter(
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
    name: '@analogjs/vite-plugin-angular-fast-compile',
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
      // Watch for new .ts files and scan them into the registry. Use
      // the barrel-aware scanner so a newly added re-export entry
      // (`export * from './x'`) also expands its underlying directive
      // classes — otherwise the registry stays stale until restart.
      server.watcher.on('add', async (filePath) => {
        if (
          filePath.endsWith('.ts') &&
          !filePath.endsWith('.spec.ts') &&
          !filePath.endsWith('.d.ts')
        ) {
          await scanBarrelExports(filePath, new Set(), true);
        }
      });
    },
    async buildStart() {
      await initFastCompile();
    },
    async handleHotUpdate(ctx) {
      // Resource file changes → invalidate parent .ts module
      if (resourceToSource.has(ctx.file)) {
        const parentSource = resourceToSource.get(ctx.file)!;
        const parentModule = ctx.server.moduleGraph.getModuleById(parentSource);
        if (parentModule) {
          return [parentModule];
        }
      }

      if (TS_EXT_REGEX.test(ctx.file)) {
        const [fileId] = ctx.file.split('?');

        // Remove old entries from this file
        const oldEntries = [...registry.entries()]
          .filter(([_, v]) => v.fileName === fileId)
          .map(([k]) => k);
        for (const key of oldEntries) {
          registry.delete(key);
        }

        // Rescan the changed file via the barrel-aware scanner so an
        // edited barrel re-export picks up newly-referenced files.
        // Pass overwrite=true so updated metadata replaces stale
        // entries from the previous scan.
        await scanBarrelExports(fileId, new Set(), true);
      }

      // Let Vite handle the rest — the transform hook will recompile
      return ctx.modules;
    },
    resolveId(id, importer) {
      if (
        id.startsWith(VIRTUAL_STYLE_PREFIX) ||
        id.startsWith(VIRTUAL_RAW_PREFIX)
      ) {
        return `\0${id}`;
      }

      if (pluginOptions.jit && id.startsWith('angular:jit:')) {
        const filePath = normalizePath(
          resolve(dirname(importer as string), id.split(';')[1]),
        );
        return id.includes(':style')
          ? toVirtualStyleId(filePath)
          : toVirtualRawId(filePath);
      }

      const rawRewrite = rewriteHtmlRawImport(id, importer);
      if (rawRewrite) return rawRewrite;

      const inlineRewrite = rewriteInlineStyleImport(id, importer);
      if (inlineRewrite) return inlineRewrite;

      return undefined;
    },
    async load(id) {
      const styleModule = await loadVirtualStyleModule(
        this,
        id,
        resolvedConfig,
      );
      if (styleModule !== undefined) return styleModule;

      const rawModule = await loadVirtualRawModule(this, id);
      if (rawModule !== undefined) return rawModule;

      // Vitest bypass: module-runner skips resolveId, so the bare `?inline`
      // query reaches load unchanged.
      if (/\.(css|scss|sass|less)\?inline$/.test(id)) {
        const filePath = id.split('?')[0];
        const code = await fsPromises.readFile(filePath, 'utf-8');
        // In tests, mirror Vitest's `test.css` rules — defaults to no
        // preprocessing (matches Vite's CSS pipeline behavior). (#2297)
        if (!shouldPreprocessTestCss(resolvedConfig, filePath)) {
          return `export default ${JSON.stringify(code)}`;
        }
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
        return handleFastCompileTransform(code, id);
      },
    },
  };
}

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
  collectRelativeReExports,
  collectAllImports,
  jitTransform,
  inlineResourceUrls,
  extractInlineStyles,
  generateHmrCode,
  debugCompile,
  debugRegistry,
  ANGULAR_DECORATOR_CALL_RE,
  type ComponentRegistry,
} from './compiler/index.js';

import {
  TS_EXT_REGEX,
  getTsConfigPath,
  createDepOptimizerConfig,
  type TsConfigResolutionContext,
} from './utils/plugin-config.js';
import { VIRTUAL_RAW_PREFIX, toVirtualRawId } from './utils/virtual-ids.js';
import {
  loadVirtualRawModule,
  rewriteHtmlRawImport,
} from './utils/virtual-resources.js';
import { markStylePathSafe } from './utils/safe-module-paths.js';

declare global {
  /**
   * Shared convention for out-of-tree compilers (e.g. `@tsrx/analog`) that
   * produce Angular Ivy definitions from a non-TS source format. Populate
   * this map with directive/component metadata for any class fastCompile
   * can't reach through its own tsconfig-driven scan, and the per-compile
   * registry lookup in `fastCompilePlugin` will merge those entries in —
   * so TS `@Component({ imports: [X] })` references to such classes
   * resolve statically instead of hitting the `_unresolved-${className}`
   * sentinel.
   */
  // eslint-disable-next-line no-var
  var __ANALOG_EXTERNAL_REGISTRY__: ComponentRegistry | undefined;
}

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

    // Walk the transitive import graph from the root files so the registry also
    // contains declarations that live in files not directly in tsconfig
    // `files`/`include` (transitively-imported app sources) and in workspace
    // libraries reached through wildcard `paths` (e.g. `@bitwarden/*`). Without
    // this, a non-standalone component's owning module can't classify its
    // declarations and `ɵɵsetComponentScope` is never emitted for it. Only
    // relative imports and `paths`-mapped (project/workspace) bare specifiers are
    // followed; true `node_modules` packages are left to the lazy `.d.ts` scanner.
    const resolvePathSpecifier = (spec: string): string | null => {
      if (!tsPaths) return null;
      for (const [key, targets] of Object.entries(tsPaths)) {
        const list = targets as string[];
        if (key.endsWith('/*')) {
          const prefix = key.slice(0, -1);
          if (spec.startsWith(prefix) && list[0]) {
            // `split('*').join(...)` substitutes the single tsconfig `*`
            // wildcard without `String.replace`'s first-match-only behavior or
            // `$`-pattern interpretation of the replacement.
            const substituted = list[0]
              .split('*')
              .join(spec.slice(prefix.length));
            return resolve(baseUrl, substituted);
          }
        } else if (key === spec && list[0]) {
          return resolve(baseUrl, list[0]);
        }
      }
      return null;
    };
    const resolveToSource = async (base: string): Promise<string | null> => {
      const candidates = base.endsWith('.ts')
        ? [base]
        : [base + '.ts', resolve(base, 'index.ts')];
      for (const candidate of candidates) {
        try {
          await fsPromises.access(candidate);
          return candidate;
        } catch {
          // try next candidate
        }
      }
      return null;
    };
    const importWalkVisited = new Set<string>();
    const walkImports = async (file: string): Promise<void> => {
      if (importWalkVisited.has(file)) return;
      importWalkVisited.add(file);
      let code: string;
      try {
        code = await fsPromises.readFile(file, 'utf-8');
      } catch {
        return;
      }
      for (const entry of scanFile(code, file)) {
        if (!registry.has(entry.className))
          registry.set(entry.className, entry);
      }
      // Pre-scan the `.d.ts` of every external package this file imports (and,
      // transitively, packages those packages' NgModules re-export — e.g.
      // BrowserModule → CommonModule → NgIf). Doing this at buildStart means the
      // registry is complete before any component transforms, so non-standalone
      // component scope resolves regardless of file transform order.
      for (const pkg of collectImportedPackages(code, file)) {
        if (scannedDtsPackages.has(pkg)) continue;
        scannedDtsPackages.add(pkg);
        try {
          for (const entry of scanPackageDts(
            pkg,
            projectRoot,
            scannedDtsPackages,
          )) {
            if (!registry.has(entry.className))
              registry.set(entry.className, entry);
          }
        } catch {
          // Package may not have .d.ts or not be Angular
        }
      }
      const dir = dirname(file);
      const targets = await Promise.all(
        collectAllImports(code, file).map((spec) => {
          if (spec.startsWith('.')) {
            return resolveToSource(
              resolve(dir, spec.replace(/\.(?:js|mjs)$/u, '')),
            );
          }
          const mapped = resolvePathSpecifier(spec);
          return mapped ? resolveToSource(mapped) : Promise.resolve(null);
        }),
      );
      await Promise.all(
        targets.filter((t): t is string => !!t).map((t) => walkImports(t)),
      );
    };
    await Promise.all(config.rootNames.map((file) => walkImports(file)));

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
        const dtsEntries = scanPackageDts(pkg, projectRoot, scannedDtsPackages);
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
    if (!ANGULAR_DECORATOR_CALL_RE.test(code)) {
      // Non-Angular file — strip TS-only syntax ourselves so barrels
      // like `export { Foo, type Bar } from './x'` and other TS-only
      // forms don't leak unstripped to Rolldown. In rolldown-vite the
      // built-in `vite:oxc` strip is registered as a Rust-side native
      // plugin (`viteTransformPlugin` from `rolldown/experimental`); if
      // its hook-filter treats files our `transform.filter.id.include`
      // claimed as already-handled, no JS-side fallback runs and raw
      // TS reaches the parser → `SyntaxError: Unexpected identifier`.
      const stripped = vite.transformWithOxc
        ? await vite.transformWithOxc(code, id, {
            lang: 'ts',
            sourcemap: true,
            decorator: { legacy: false, emitDecoratorMetadata: false },
          })
        : await vite.transformWithEsbuild(code, id, {
            loader: 'ts',
            sourcemap: true,
          });
      return { code: stripped.code, map: stripped.map };
    }

    // JIT mode
    if (pluginOptions.jit) {
      const result = jitTransform(code, id);
      // Strip TypeScript-only syntax (e.g. `readonly`, parameter property
      // modifiers, type annotations on fields) so the output is valid JS
      // for Rolldown. `angularVitestSourcemapPlugin` normally runs this
      // strip downstream in tests, but it is intentionally skipped on
      // StackBlitz / WebContainer — and the production build pipeline
      // does not register it either — so the JIT path must self-strip
      // to stay safe across environments.
      //
      // Pass the jitTransform map as `inMap` so OXC/esbuild emit a map
      // composed with the original `.ts` source — without this, debug
      // stack traces and breakpoints land on the wrong lines once the
      // strip removes any TS-only token. `jitTransform` returns
      // `map: null` for files with no Angular class (no edits made);
      // passing that to OXC/esbuild as `inMap` throws, so coerce to
      // `undefined` in that case.
      const inMap = result.map ?? undefined;
      const stripped = vite.transformWithOxc
        ? await vite.transformWithOxc(
            result.code,
            id,
            {
              lang: 'ts',
              sourcemap: true,
              decorator: { legacy: false, emitDecoratorMetadata: false },
            },
            inMap,
          )
        : await vite.transformWithEsbuild(
            result.code,
            id,
            { loader: 'ts', sourcemap: true },
            inMap,
          );
      return { code: stripped.code, map: stripped.map };
    }

    // Inline external templateUrl/styleUrl(s) into the source before compilation.
    // `styleExtensions` carries the source extension of each inlined external
    // style so it can be preprocessed by its own file type (e.g. an external
    // `.scss` styleUrl) regardless of the `inlineStylesExtension` option.
    const inlined = inlineResourceUrls(code, id);
    code = inlined.code;
    const { styleExtensions } = inlined;

    // Pre-resolve inline styles that need preprocessing (SCSS/Sass/Less). Run
    // whenever a style needs a non-`css` preprocessor — either the configured
    // `inlineStylesExtension` for truly-inline styles, or an external styleUrl's
    // own extension.
    let resolvedStyles: Map<string, string> | undefined;
    let resolvedInlineStyles: Map<number, string> | undefined;

    const inlineExt = pluginOptions.inlineStylesExtension;
    const styleNeedsPreprocess = (ext: string) => ext !== '' && ext !== 'css';

    if (styleNeedsPreprocess(inlineExt) || styleExtensions.size > 0) {
      const styleStrings = extractInlineStyles(code, id);

      if (styleStrings.length > 0) {
        resolvedInlineStyles = new Map();
        for (let i = 0; i < styleStrings.length; i++) {
          // External styleUrls are preprocessed by their own extension; truly
          // inline `styles: [...]` fall back to `inlineStylesExtension`.
          const ext = styleExtensions.get(i) ?? inlineExt;
          if (!styleNeedsPreprocess(ext)) continue;
          try {
            const fakePath = id.replace(/\.ts$/, `.inline-${i}.${ext}`);
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

    // Merge entries from the shared external-registry global into this
    // compile's lookup view. Convention: out-of-tree compilers populate
    // `globalThis.__ANALOG_EXTERNAL_REGISTRY__` with directive metadata
    // for classes fastCompile can't reach through its tsconfig-driven
    // scan (e.g. `.tsrx` files compiled by `@tsrx/analog`). Without this
    // merge, a TS `@Component({ imports: [X] })` that references such a
    // class hits `_unresolved-${className}` as its selector and the tag
    // never matches at runtime.
    let compileRegistry: ComponentRegistry = registry;
    const externalRegistry = globalThis.__ANALOG_EXTERNAL_REGISTRY__;
    if (externalRegistry && externalRegistry.size > 0) {
      compileRegistry = new Map(registry);
      for (const [k, v] of externalRegistry) compileRegistry.set(k, v);
    }

    const result = compile(code, id, {
      registry: compileRegistry,
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
      if (id.startsWith(VIRTUAL_RAW_PREFIX)) {
        return `\0${id}`;
      }

      if (pluginOptions.jit && id.startsWith('angular:jit:')) {
        const filePath = normalizePath(
          resolve(dirname(importer as string), id.split(';')[1]),
        );
        if (id.includes(':style')) {
          markStylePathSafe(resolvedConfig, filePath);
          return filePath + '?inline';
        }
        return toVirtualRawId(filePath);
      }

      const rawRewrite = rewriteHtmlRawImport(id, importer);
      if (rawRewrite) return rawRewrite;

      // User `.scss?inline` / `.css?inline` imports: resolve and mark
      // safe so Vite's native CSS pipeline handles them.
      if (/\.(css|scss|sass|less)\?inline$/.test(id) && importer) {
        const filePath = id.split('?')[0];
        const resolved = isAbsolute(filePath)
          ? normalizePath(filePath)
          : normalizePath(resolve(dirname(importer), filePath));
        markStylePathSafe(resolvedConfig, resolved);
        return resolved + '?inline';
      }

      return undefined;
    },
    async load(id) {
      const rawModule = await loadVirtualRawModule(this, id);
      if (rawModule !== undefined) return rawModule;

      // Vitest fallback: module-runner can skip resolveId, so the bare
      // ?inline query reaches load. Mark safe and let Vite handle it.
      if (/\.(css|scss|sass|less)\?inline$/.test(id)) {
        markStylePathSafe(resolvedConfig, id.split('?')[0]);
      }

      return;
    },
    transform: {
      filter: {
        id: {
          include: [TS_EXT_REGEX],
          // `?raw` ids already carry Vite's native raw-loader output
          // (`export default "<source>"`). Recompiling them as Angular/TS
          // would strip that default export, so leave them to Vite (#2356).
          exclude: [
            /node_modules/,
            'type=script',
            '@ng/component',
            /[?&]raw\b/,
          ],
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

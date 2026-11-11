import { promises as fsPromises } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { parseSync } from 'oxc-parser';
import { parseOxc } from './compiler/utils.js';
import * as vite from 'vite';

import * as compilerCli from '@angular/compiler-cli';
import { normalizePath, Plugin, preprocessCSS, ResolvedConfig } from 'vite';

import {
  createAngularBuildContext,
  isAngularBuildContext,
  type AngularBuildContext,
  type AngularBuildContextOptions,
} from './angular-build-context.js';
import {
  compile,
  scanFile,
  declaresNonStandaloneComponent,
  scanPackageDts,
  collectImportedPackages,
  collectRelativeReExports,
  collectReExports,
  collectAllImports,
  jitTransform,
  inlineResourceUrls,
  extractInlineStyles,
  generateHmrCode,
  debugRegistry,
  ANGULAR_DECORATOR_CALL_RE,
  type ComponentRegistry,
} from './compiler/index.js';
import { reportStylesheetError } from './utils/stylesheet-warning.js';

import {
  TS_EXT_REGEX,
  EXCLUDED_TS_EXT_REGEX,
  getTsConfigPath,
  createDepOptimizerConfig,
  isProdMode,
  type TsConfigResolutionContext,
} from './utils/plugin-config.js';
import { isIgnoredHmrFile } from './utils/compilation-shared.js';
import { releaseCssPreprocessorWorkers } from './utils/css-preprocessor-workers.js';
import { isRolldown } from './utils/rolldown.js';
import { TsconfigResolver } from './utils/tsconfig-resolver.js';
import type { StylePreprocessor } from './style-preprocessor.js';
import { preprocessStylesheet } from './stylesheet-registry.js';
import type { TypeCheckerOption } from './utils/lsp-type-checker.js';
import {
  discoverAnalogIntegrations,
  type ComponentRegistryEntries,
  type TransformFilter,
} from './analog-plugin-interop.js';
import {
  loadAngularVirtualModule,
  resolveAngularVirtualId,
} from './virtual-modules-plugin.js';

export interface FastCompilePluginOptions {
  tsconfigGetter: () => string;
  workspaceRoot: string;
  inlineStylesExtension: string;
  jit: boolean;
  liveReload: boolean;
  isTest: boolean;
  isAstroIntegration: boolean;
  fastCompileMode?: 'full' | 'partial';
  disableTypeChecking?: boolean;
  typeChecker?: TypeCheckerOption;
  include?: string[];
}

function isFastCompilePluginOptions(
  value: unknown,
): value is FastCompilePluginOptions {
  return (
    typeof value === 'object' &&
    value !== null &&
    !isAngularBuildContext(value) &&
    'tsconfigGetter' in value &&
    typeof (value as FastCompilePluginOptions).tsconfigGetter === 'function'
  );
}

type ResolveImport = (spec: string, importer: string) => Promise<string | null>;

/**
 * Directory that `compilerOptions.paths` targets resolve against. Mirrors
 * TypeScript: `baseUrl` when set, otherwise the directory of the config
 * that declares `paths` (`pathsBasePath`, since `baseUrl` is optional
 * from TS 4.1).
 */
export function getPathsBasePath(
  options: { baseUrl?: string; pathsBasePath?: string } | undefined,
  fallback: string,
): string {
  return options?.baseUrl ?? options?.pathsBasePath ?? fallback;
}

export function fastCompilePlugin(
  optionsOrCtx?:
    | AngularBuildContext
    | FastCompilePluginOptions
    | AngularBuildContextOptions,
): Plugin {
  const sharedCtx = isAngularBuildContext(optionsOrCtx)
    ? optionsOrCtx
    : isFastCompilePluginOptions(optionsOrCtx)
      ? undefined
      : createAngularBuildContext({
          ...optionsOrCtx,
          compilationBackend: 'fast',
        });

  const pluginOptions: FastCompilePluginOptions = sharedCtx
    ? sharedCtx.options
    : (optionsOrCtx as FastCompilePluginOptions);

  const tsconfigResolver =
    sharedCtx?.tsconfigResolver ??
    new TsconfigResolver({
      workspaceRoot: pluginOptions.workspaceRoot,
      include: pluginOptions.include ?? [],
      liveReload: pluginOptions.liveReload,
      isTest: pluginOptions.isTest,
    });

  let resolvedConfig: ResolvedConfig;
  let transformFilter: TransformFilter | undefined;
  let componentRegistries: ComponentRegistryEntries[] = [];
  let stylePreprocessor: StylePreprocessor | undefined;
  let tsConfigResolutionContext: TsConfigResolutionContext | null = null;
  let watchMode = false;

  // fast-compile plugin state
  const registry: ComponentRegistry = new Map();
  const resourceToSource = new Map<string, string>();
  const scannedDtsPackages = new Set<string>();
  const emittedMaps = new Map<string, string>();
  let projectRoot = '';
  let useDefineForClassFields = true;
  let tsConfig: ReturnType<typeof compilerCli.readConfiguration>;

  // Files scanned on demand (mapped to the barrel chain they pulled in), which
  // modules were compiled against each scanned file, and the one-time
  // whole-project scan non-standalone components fall back to.
  const lazyScans = new Map<string, Promise<Set<string>>>();
  const importersByFile = new Map<string, Set<string>>();
  let projectScan: Promise<void> | undefined;

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
   *
   * `fileContents`/`scanResults` are cold-start dedup caches scoped to a
   * single `initFastCompile` call. HMR/watcher callers must omit them so
   * an edited file is always re-read from disk.
   */
  async function scanBarrelExports(
    file: string,
    visited: Set<string> = new Set(),
    overwrite = false,
    fileContents?: Map<string, string>,
    scanResults?: Map<string, ReturnType<typeof scanFile>>,
  ): Promise<void> {
    if (visited.has(file)) return;
    visited.add(file);
    let code: string;
    try {
      code =
        fileContents?.get(file) ?? (await fsPromises.readFile(file, 'utf-8'));
      fileContents?.set(file, code);
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
    // Single parse shared by scanFile and collectRelativeReExports. On a
    // parse error each consumer re-parses on its own, preserving their
    // individual failure semantics (scanFile throws past its pre-filter;
    // collectRelativeReExports swallows and returns []).
    let program: ReturnType<typeof parseSync>['program'] | undefined;
    try {
      program = parseOxc(file, code).program;
    } catch {
      program = undefined;
    }
    let entries = scanResults?.get(file);
    if (!entries) {
      entries = scanFile(code, file, program);
      scanResults?.set(file, entries);
    }
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
    for (const rel of collectRelativeReExports(code, file, program)) {
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
          await scanBarrelExports(
            candidate,
            visited,
            overwrite,
            fileContents,
            scanResults,
          );
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

  async function initFastCompile(): Promise<void> {
    emittedMaps.clear();
    if (pluginOptions.jit) return; // JIT: no registry scan needed

    registry.clear();
    scannedDtsPackages.clear();
    lazyScans.clear();
    importersByFile.clear();
    projectScan = undefined;
    const resolvedTsConfigPath = resolveTsConfigPath();
    projectRoot = dirname(resolvedTsConfigPath);
    tsConfig = compilerCli.readConfiguration(resolvedTsConfigPath);
    useDefineForClassFields = tsConfig.options?.useDefineForClassFields ?? true;
  }

  /** Scan all source files reachable from the tsconfig into the registry. */
  async function scanProject(): Promise<void> {
    const config = tsConfig;
    const extraIncludes = tsconfigResolver.ensureIncludeCache();
    // Collect candidate files: tsconfig rootNames PLUS explicit/integration
    // include globs PLUS the entry points named in `compilerOptions.paths`.
    // App tsconfigs typically only include the app's own sources, so workspace
    // library entry barrels (e.g. `HlmSelectImports = [HlmSelect,
    // HlmSelectContent, ...] as const`) live outside `rootNames` and would
    // otherwise miss the initial scan. The compiler then can't see that
    // `HlmSelectImports` is a tuple barrel and emits the bare identifier into
    // the parent component's `dependencies()` list, where Angular's runtime
    // silently drops it because arrays don't have a directive def.
    const candidates = new Set<string>([...config.rootNames, ...extraIncludes]);
    const tsPaths = config.options?.paths;
    const baseUrl = getPathsBasePath(config.options, projectRoot);
    // Cold-start dedup caches shared by the three scan phases below
    // (candidates scan, walkImports, scanBarrelExports). Scoped to this
    // init call only — HMR/watcher re-scans must hit disk fresh.
    const fileContents = new Map<string, string>();
    const scanResults = new Map<string, ReturnType<typeof scanFile>>();
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
          fileContents.set(file, code);
          const entries = scanFile(code, file);
          scanResults.set(file, entries);
          return entries;
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
    // Return *all* candidate base paths a bare specifier maps to. A `paths`
    // entry can list several fallback targets (e.g. a built `dist` path first
    // and the workspace `src` second); the caller probes them in order.
    const resolvePathSpecifier = (spec: string): string[] => {
      if (!tsPaths) return [];
      for (const [key, targets] of Object.entries(tsPaths)) {
        const list = targets as string[];
        if (key.endsWith('/*')) {
          const prefix = key.slice(0, -1);
          if (spec.startsWith(prefix)) {
            // `split('*').join(...)` substitutes the single tsconfig `*`
            // wildcard without `String.replace`'s first-match-only behavior or
            // `$`-pattern interpretation of the replacement.
            return list.map((t) =>
              resolve(baseUrl, t.split('*').join(spec.slice(prefix.length))),
            );
          }
        } else if (key === spec) {
          return list.map((t) => resolve(baseUrl, t));
        }
      }
      return [];
    };
    const probeToSource = async (base: string): Promise<string | null> => {
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
    // Memoize fs probes per absolute base path. The cache stores the
    // Promise (not the settled value) so concurrent walks racing on the
    // same base collapse into a single probe.
    const baseResolveCache = new Map<string, Promise<string | null>>();
    const resolveToSource = (base: string): Promise<string | null> => {
      let probe = baseResolveCache.get(base);
      if (!probe) {
        probe = probeToSource(base);
        baseResolveCache.set(base, probe);
      }
      return probe;
    };
    // Probe each `paths` target in order; first one that resolves to source wins.
    const resolveFirstSource = async (
      bases: string[],
    ): Promise<string | null> => {
      for (const base of bases) {
        const resolved = await resolveToSource(base);
        if (resolved) return resolved;
      }
      return null;
    };
    const importWalkVisited = new Set<string>();
    // Paths-mapped resolution doesn't depend on the importer, so bare
    // specifiers can be memoized by their raw text. Relative specifiers
    // must NOT be — the same './foo' resolves differently per directory.
    const bareSpecResolveCache = new Map<string, Promise<string | null>>();
    const walkImports = async (file: string): Promise<void> => {
      if (importWalkVisited.has(file)) return;
      importWalkVisited.add(file);
      let code: string;
      try {
        code =
          fileContents.get(file) ?? (await fsPromises.readFile(file, 'utf-8'));
        fileContents.set(file, code);
      } catch {
        return;
      }
      // Single parse shared by scanFile, collectImportedPackages, and
      // collectAllImports. On a parse error each consumer re-parses on
      // its own, preserving their individual failure semantics.
      let program: ReturnType<typeof parseSync>['program'] | undefined;
      try {
        program = parseOxc(file, code).program;
      } catch {
        program = undefined;
      }
      let entries = scanResults.get(file);
      if (!entries) {
        entries = scanFile(code, file, program);
        scanResults.set(file, entries);
      }
      for (const entry of entries) {
        if (!registry.has(entry.className))
          registry.set(entry.className, entry);
      }
      // Pre-scan the `.d.ts` of every external package this file imports (and,
      // transitively, packages those packages' NgModules re-export — e.g.
      // BrowserModule → CommonModule → NgIf). Doing this at buildStart means the
      // registry is complete before any component transforms, so non-standalone
      // component scope resolves regardless of file transform order.
      for (const pkg of collectImportedPackages(code, file, program)) {
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
        collectAllImports(code, file, program).map((spec) => {
          if (spec.startsWith('.')) {
            return resolveToSource(
              resolve(dir, spec.replace(/\.(?:js|mjs)$/u, '')),
            );
          }
          let resolved = bareSpecResolveCache.get(spec);
          if (!resolved) {
            resolved = resolveFirstSource(resolvePathSpecifier(spec));
            bareSpecResolveCache.set(spec, resolved);
          }
          return resolved;
        }),
      );
      await Promise.all(
        targets.filter((t): t is string => !!t).map((t) => walkImports(t)),
      );
    };
    const walkRoots = [...new Set([...config.rootNames, ...extraIncludes])];
    await Promise.all(walkRoots.map((file) => walkImports(file)));

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
        barrelCandidates.map((c) =>
          scanBarrelExports(
            c,
            buildStartVisited,
            false,
            fileContents,
            scanResults,
          ),
        ),
      );
    }
    debugRegistry(
      'initFastCompile done: %d entries from %d candidate files',
      registry.size,
      candidates.size,
    );
  }

  function ensureDtsRegistryForSource(
    code: string,
    id: string,
    program?: ReturnType<typeof parseSync>['program'],
  ): void {
    for (const pkg of collectImportedPackages(code, id, program)) {
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

  /**
   * Scan the source files `id` imports into the registry on demand and record
   * `id` as their importer, so a metadata change in any of them recompiles it.
   */
  async function resolveImportedDeclarations(
    code: string,
    id: string,
    program: ReturnType<typeof parseSync>['program'],
    resolveImport: ResolveImport,
  ): Promise<void> {
    await Promise.all(
      collectAllImports(code, id, program).map(async (spec) => {
        const file = await resolveImport(spec, id);
        if (!file) return;
        for (const scanned of await scanOnDemand(file, resolveImport)) {
          let importers = importersByFile.get(scanned);
          if (!importers) {
            importers = new Set();
            importersByFile.set(scanned, importers);
          }
          importers.add(id);
        }
      }),
    );
  }

  function scanOnDemand(
    file: string,
    resolveImport: ResolveImport,
  ): Promise<Set<string>> {
    let scan = lazyScans.get(file);
    if (!scan) {
      scan = scanWithReExports(file, resolveImport);
      lazyScans.set(file, scan);
    }
    return scan;
  }

  /**
   * Scan a file and everything it re-exports, resolving specifiers through
   * Vite so path aliases work. Tuple barrels and NgModules can list classes
   * their file imports without re-exporting, so their imports are followed
   * too. Returns every file scanned.
   */
  async function scanWithReExports(
    file: string,
    resolveImport: ResolveImport,
  ): Promise<Set<string>> {
    const visited = new Set<string>();
    const visit = async (current: string): Promise<void> => {
      if (visited.has(current)) return;
      visited.add(current);
      let code: string;
      let program: ReturnType<typeof parseSync>['program'];
      try {
        code = await fsPromises.readFile(current, 'utf-8');
        program = parseOxc(current, code).program;
      } catch {
        return;
      }
      const entries = scanFile(code, current, program);
      for (const entry of entries) {
        if (!registry.has(entry.className)) {
          registry.set(entry.className, entry);
        }
      }
      ensureDtsRegistryForSource(code, current, program);
      const followsImports = entries.some(
        (e) => e.kind === 'tuple' || e.kind === 'ngmodule',
      );
      const specifiers = followsImports
        ? collectAllImports(code, current, program)
        : collectReExports(code, current, program);
      for (const spec of specifiers) {
        const dep = await resolveImport(spec, current);
        if (dep) await visit(dep);
      }
    };
    await visit(file);
    return visited;
  }

  function registryEntriesOf(file: string) {
    return [...registry.values()].filter((e) => e.fileName === file);
  }

  async function handleFastCompileTransform(
    code: string,
    id: string,
    resolveImport: ResolveImport,
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
    // `stylePaths` carries the source path of each inlined external style so
    // it is preprocessed as its own file (e.g. an external `.scss` styleUrl or
    // a relative `@import`) regardless of the `inlineStylesExtension` option.
    const inlined = await inlineResourceUrls(code, id);
    code = inlined.code;
    const { stylePaths } = inlined;

    // Track inlined resources for HMR. `compile()` only reports resources it
    // reads through its own fallback (a templateUrl/styleUrl the inliner did
    // NOT already inline), so files inlined here must be recorded here or a
    // later edit to them never invalidates the owning module.
    for (const dep of inlined.resourceDependencies) {
      resourceToSource.set(dep, id);
    }

    // Single OXC parse of the post-inline source, shared by every AST
    // consumer below. `inlineResourceUrls` parsed the PRE-inline string,
    // so its program can never be reused here.
    const { program: oxcProgram } = parseOxc(id, code);

    // Pre-resolve component styles through the registered style preprocessor
    // and Vite's CSS pipeline (Sass/Less, PostCSS, Tailwind), like ngtsc does.
    // External styleUrls are processed as their own file; truly inline
    // `styles: [...]` use `inlineStylesExtension`.
    let resolvedInlineStyles: Map<number, string> | undefined;
    const styleStrings = extractInlineStyles(code, id, oxcProgram);

    if (styleStrings.length > 0) {
      resolvedInlineStyles = new Map();
      const activeConfig = sharedCtx?.resolvedConfig ?? resolvedConfig;
      const activeStylePreprocessor =
        sharedCtx?.stylePreprocessor ?? stylePreprocessor;
      for (let i = 0; i < styleStrings.length; i++) {
        const stylePath =
          stylePaths.get(i) ??
          id.replace(
            /\.ts$/,
            `.inline-${i}.${pluginOptions.inlineStylesExtension || 'css'}`,
          );
        try {
          const preprocessed = preprocessStylesheet(
            styleStrings[i],
            stylePath,
            activeStylePreprocessor,
            {
              filename: stylePath,
              containingFile: id,
              order: i,
              inline: !stylePaths.has(i),
            },
          );
          const processed = await preprocessCSS(
            preprocessed,
            stylePath,
            activeConfig,
          );
          resolvedInlineStyles.set(i, processed.code);
        } catch (e) {
          reportStylesheetError(
            activeConfig?.logger,
            stylePath,
            e,
            activeConfig?.command === 'build',
          );
        }
      }
      if (resolvedInlineStyles.size === 0) resolvedInlineStyles = undefined;
    }

    ensureDtsRegistryForSource(code, id, oxcProgram);

    for (const entry of scanFile(code, id, oxcProgram)) {
      registry.set(entry.className, entry);
    }
    await resolveImportedDeclarations(code, id, oxcProgram, resolveImport);
    if (declaresNonStandaloneComponent(oxcProgram)) {
      projectScan ??= scanProject();
      await projectScan;
    }

    // Merge registries contributed through `analog.setup()` into this
    // compile's lookup view. Out-of-tree compilers register directive
    // metadata for classes fastCompile can't reach through its
    // tsconfig-driven scan (e.g. `.tsrx` files compiled by `@tsrx/analog`).
    // Without this merge, a TS `@Component({ imports: [X] })` that
    // references such a class hits `_unresolved-${className}` as its
    // selector and the tag never matches at runtime.
    const activeComponentRegistries = sharedCtx
      ? sharedCtx.componentRegistries
      : componentRegistries;
    let compileRegistry: ComponentRegistry = registry;
    if (activeComponentRegistries.some((external) => external.size > 0)) {
      compileRegistry = new Map(registry);
      for (const external of activeComponentRegistries) {
        for (const [k, v] of external) compileRegistry.set(k, v);
      }
    }

    const result = compile(code, id, {
      registry: compileRegistry,
      resolvedInlineStyles,
      useDefineForClassFields,
      compilationMode: pluginOptions.fastCompileMode,
      oxcProgram,
    });

    // Track resource dependencies for HMR
    for (const dep of result.resourceDependencies) {
      resourceToSource.set(dep, id);
    }

    // Strip TypeScript-only syntax and compose the compiler map with the
    // final generated code so downstream breakpoints map back to the source.
    const stripped = vite.transformWithOxc
      ? await vite.transformWithOxc(
          result.code,
          id,
          {
            lang: 'ts',
            sourcemap: true,
            decorator: { legacy: false, emitDecoratorMetadata: false },
          },
          result.map,
        )
      : await vite.transformWithEsbuild(
          result.code,
          id,
          { loader: 'ts', sourcemap: true },
          result.map,
        );
    let outputCode = stripped.code;

    // Append HMR code in dev mode
    const activeWatchMode = sharedCtx ? sharedCtx.watchMode : watchMode;
    if (activeWatchMode && pluginOptions.liveReload) {
      const fileDeclarations = registryEntriesOf(id);
      if (fileDeclarations.length > 0) {
        const localDepClassNames = fileDeclarations.map((e) => e.className);
        outputCode += generateHmrCode(fileDeclarations, localDepClassNames);
      }
    }

    return { code: outputCode, map: stripped.map };
  }

  function resolveTsConfigPath(): string {
    if (sharedCtx) {
      return sharedCtx.resolveTsConfigPath();
    }
    const resolution = tsConfigResolutionContext ?? {
      root: resolvedConfig?.root || '.',
      isProd: isProdMode(resolvedConfig?.mode),
      isLib: !!resolvedConfig?.build?.lib,
    };
    return getTsConfigPath(
      resolution.root,
      pluginOptions.tsconfigGetter(),
      resolution.isProd,
      pluginOptions.isTest,
      resolution.isLib,
      pluginOptions.workspaceRoot,
    );
  }

  const compilerApi = {
    angularCompiler: true as const,
    getTsConfigPath: resolveTsConfigPath,
    getSourceMap: (id: string): string | undefined =>
      emittedMaps.get(normalizePath(id)),
    hasEmitted: (id: string): boolean => emittedMaps.has(normalizePath(id)),
  };

  sharedCtx?.registerCompiler({
    name: '@analogjs/vite-plugin-angular-fast-compile',
    getTsConfigPath: compilerApi.getTsConfigPath,
    getSourceMap: compilerApi.getSourceMap,
    hasEmitted: compilerApi.hasEmitted,
  });

  return {
    name: '@analogjs/vite-plugin-angular-fast-compile',
    api: compilerApi,
    enforce: 'pre' as const,
    async config(config, { command, mode }) {
      watchMode = command === 'serve';
      const isProd = isProdMode(config.mode);

      if (sharedCtx) {
        sharedCtx.initConfig(config, { command, mode });
      } else {
        tsConfigResolutionContext = {
          root: config.root || '.',
          isProd,
          isLib: !!config?.build?.lib,
        };
      }

      const preliminaryTsConfigPath = resolveTsConfigPath();

      const depOptimizer = createDepOptimizerConfig({
        tsconfig: preliminaryTsConfigPath,
        isProd,
        jit: pluginOptions.jit,
        watchMode,
        isTest: pluginOptions.isTest,
        isAstroIntegration: pluginOptions.isAstroIntegration,
      });

      // No `resolve.conditions` extension here: the `style` condition is
      // scoped to `.css`-extension requests by
      // `cssExtensionStyleResolverPlugin`.
      return {
        ...(isRolldown() ? { oxc: {} as any } : { esbuild: false }),
        ...depOptimizer,
      };
    },
    async configResolved(config) {
      resolvedConfig = config;
      if (sharedCtx) {
        const integrations = await sharedCtx.resolveConfig(config);
        transformFilter = integrations.transformFilter;
        componentRegistries = integrations.componentRegistries;
        stylePreprocessor = integrations.stylePreprocessor;
      } else {
        const integrations = await discoverAnalogIntegrations(config);
        transformFilter = integrations.transformFilter;
        componentRegistries = integrations.componentRegistries;
        stylePreprocessor = integrations.stylePreprocessor;
        tsconfigResolver.setIntegrationIncludes(integrations.include);
      }
    },
    async buildStart() {
      await initFastCompile();
    },
    closeBundle() {
      const activeWatchMode = sharedCtx ? sharedCtx.watchMode : watchMode;
      if (!activeWatchMode) {
        emittedMaps.clear();
        releaseCssPreprocessorWorkers();
      }
    },
    async handleHotUpdate(ctx) {
      if (
        sharedCtx
          ? sharedCtx.hmr.isIgnoredFile(ctx.file)
          : isIgnoredHmrFile(ctx.file)
      ) {
        return [];
      }

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
        const oldEntries = registryEntriesOf(fileId);
        for (const entry of oldEntries) {
          registry.delete(entry.className);
        }

        // Rescan the changed file via the barrel-aware scanner so an
        // edited barrel re-export picks up newly-referenced files.
        // Pass overwrite=true so updated metadata replaces stale
        // entries from the previous scan.
        await scanBarrelExports(fileId, new Set(), true);

        // Importers compiled the old selector/inputs/outputs into their
        // templates, so recompile them when this file's metadata changed.
        // Cached scans that pulled in this file may now be incomplete.
        lazyScans.clear();
        const metadataChanged =
          JSON.stringify(oldEntries) !==
          JSON.stringify(registryEntriesOf(fileId));
        if (metadataChanged) {
          const importerModules = [
            ...(importersByFile.get(fileId) ?? []),
          ].flatMap((importer) => [
            ...(ctx.server.moduleGraph.getModulesByFile(importer) ?? []),
          ]);
          return [...ctx.modules, ...importerModules];
        }
      }

      // Let Vite handle the rest — the transform hook will recompile
      return ctx.modules;
    },
    resolveId(id, importer) {
      return resolveAngularVirtualId(id, importer, {
        jit: pluginOptions.jit,
        resolvedConfig: sharedCtx?.resolvedConfig ?? resolvedConfig,
      });
    },
    async load(id) {
      return loadAngularVirtualModule(
        this,
        id,
        sharedCtx?.resolvedConfig ?? resolvedConfig,
      );
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
        const activeTransformFilter =
          sharedCtx?.transformFilter ?? transformFilter;
        if (activeTransformFilter && !activeTransformFilter(code, id)) {
          return;
        }

        if (id.includes('.ts?')) {
          id = id.replace(/\?(.*)/, '');
        }
        const transformed = await handleFastCompileTransform(
          code,
          id,
          async (spec, importer) => {
            const resolved = await this.resolve(spec, importer, {
              skipSelf: true,
            });
            if (!resolved || resolved.external) return null;
            const file = normalizePath(resolved.id.split('?')[0]);
            // Package declarations come from the lazy `.d.ts` scanner instead.
            return TS_EXT_REGEX.test(file) &&
              !EXCLUDED_TS_EXT_REGEX.test(file) &&
              !file.includes('/node_modules/')
              ? file
              : null;
          },
        );
        if (transformed?.map) {
          emittedMaps.set(
            normalizePath(id),
            typeof transformed.map === 'string'
              ? transformed.map
              : JSON.stringify(transformed.map),
          );
        }
        return transformed;
      },
    },
  };
}

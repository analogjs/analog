import { dirname } from 'node:path';
import { normalizePath, Plugin, UserConfig } from 'vite';
import * as vite from 'vite';
import * as ts from 'typescript';
import {
  findNearestPackageJson,
  resolveNearestTsConfigOptions,
} from './utils/plugin-config.js';

// Matches `.ts`/`.mts`/`.cts` and their `.tsx`/`.mtsx`/`.ctsx` JSX
// counterparts at the end of the path or right before a `?query` (Vite
// virtual-module suffixes) — the same extension family the main plugin's
// own transform filter supports (`TS_EXT_REGEX` in `utils/plugin-config.ts`).
// A file with any of these extensions can reach this plugin even though the
// main plugin skipped it (e.g. an untested `.mts` component), and should get
// the same recovery below. The match is anchored to the true extension —
// unanchored, it would also fire on a compound name like `fixture.cts.css`
// or `component.tsx.snap`, sending non-TypeScript content through a
// TypeScript loader that can throw and abort the run.
const TS_FAMILY_EXT_RE = /\.[cm]?tsx?(?:$|\?)/;

/**
 * True if `code` has a decorator anywhere (a class, a class member, or a
 * parameter) — a call (`@Component(...)`), a bare reference (`@sealed`), or
 * a member/namespace expression (`@ns.Component`), aliased or not. A regex
 * on decorator *names* can't cover every valid decorator expression form;
 * walking the real AST can. Detection has to be this thorough because
 * OXC/esbuild's legacy decorator lowering has gaps for parameter
 * decorators and for some of these shapes, emitting either output that
 * still fails to parse or an `@oxc-project/runtime` import that isn't a
 * project dependency. TypeScript's own transpiler handles every decorator
 * shape correctly, so files with any decorator are transpiled with it
 * instead below. See #2555.
 */
function hasDecorator(code: string, fileName: string): boolean {
  const sourceFile = ts.createSourceFile(
    fileName,
    code,
    ts.ScriptTarget.Latest,
    false,
    fileName.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  let found = false;
  const visit = (node: ts.Node) => {
    if (found) {
      return;
    }
    if (ts.canHaveDecorators(node) && ts.getDecorators(node)?.length) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sourceFile, visit);

  return found;
}

/**
 * True if `code` uses `.cts`-specific CommonJS-only syntax — `export =`
 * or `import x = require(...)` — that always lowers to literal
 * `require`/`module.exports` in `ts.transpileModule`, regardless of any
 * `module` option, and isn't valid in Vite's ESM pipeline. A `.cts` file
 * using neither (the common case — plain `import`/`export` code that
 * just happens to sit in a `.cts` file, e.g. an Angular component with
 * no reason of its own to need CommonJS semantics) is just as safe for
 * this fallback's decorator lowering as any other file.
 * `import x = SomeNamespace.Member` (a type-level alias, not a
 * `require(...)` call) isn't flagged — it has no CJS runtime semantics
 * at all. Nor is `export default expr`: it parses to the same
 * `ExportAssignment` node as `export =`, distinguished only by
 * `isExportEquals`, which is true for `export =` and false/undefined for
 * `export default` — checked explicitly so ordinary ESM default exports
 * in a `.cts` file aren't misclassified as CommonJS-only.
 */
function hasCommonJsOnlySyntax(code: string, fileName: string): boolean {
  const sourceFile = ts.createSourceFile(
    fileName,
    code,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TS,
  );

  let found = false;
  const visit = (node: ts.Node) => {
    if (found) {
      return;
    }
    if (
      (ts.isExportAssignment(node) && node.isExportEquals) ||
      (ts.isImportEqualsDeclaration(node) &&
        ts.isExternalModuleReference(node.moduleReference))
    ) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sourceFile, visit);

  return found;
}

/**
 * `ts.transpileModule` transpiles exactly one file, so its map always has
 * exactly one `sources` entry — and the real, correct path for it is
 * already known (`fileName`), so it's used directly rather than trying to
 * resolve whatever relative entry TypeScript emitted against `sourceRoot`.
 * That option describes a real, multi-file build's own map-to-source
 * layout (e.g. a monorepo base tsconfig sets it for its actual emitted
 * output), not this isolated single-file transpile: combining it with
 * this file's own directory can point at the wrong file entirely — a
 * `sourceRoot: '../generated'` inherited from such a tsconfig would
 * resolve `untested.component.ts` in `/project/lib` to
 * `/project/generated/untested.component.ts`, not the real file. Setting
 * `sources` directly sidesteps that combination altogether, and
 * `sourceRoot` is dropped so nothing downstream re-applies it either.
 */
function normalizeSourceMap(map: string, fileName: string): string {
  const sourceMap = JSON.parse(map) as {
    sources?: string[];
    sourceRoot?: string;
  };
  sourceMap.sources = [normalizePath(fileName)];
  delete sourceMap.sourceRoot;

  return JSON.stringify(sourceMap);
}

/**
 * Transpiles a file with a decorator, respecting the resolved program's
 * own decorator and class-field settings rather than overriding them —
 * this plugin also runs for files a real test imports and executes, not
 * just ones a coverage pass merely inspects. Overriding
 * `experimentalDecorators` would silently rewrite a standard (TC39
 * stage-3) decorator's real `(value, context)` argument pair into a
 * legacy `(target, key, descriptor)` one; overriding
 * `useDefineForClassFields` would silently turn a class field's "define"
 * semantics into "assign" (observably different the moment a subclass
 * field shares a name with an inherited accessor). Both would change
 * behavior for code that actually runs, not just parses.
 *
 * The one thing the honest attempt can still get wrong is leaving
 * decorator syntax un-lowered: at `target: ESNext` specifically (not
 * ES2022 or below), TypeScript assumes the runtime natively supports
 * whichever decorator model is configured and passes decorators through
 * untouched — which nothing that parses or runs this output yet does.
 * Retrying at a fixed, safe `target: ES2022` — the same target Angular's
 * own CLI-generated tsconfig uses, changing nothing else — reliably
 * forces full lowering in every combination of decorator kind
 * (parameter, field, class, bare, aliased, namespaced),
 * `experimentalDecorators`, and `useDefineForClassFields` this has been
 * verified against, without touching either of those two settings. See
 * #2555.
 *
 * Never called for `.tsx` (see the call site) — a decorated `.tsx`
 * file's JSX would need a specific lowering mode chosen here with no way
 * to know which one the real code actually targets (React, Preact,
 * Solid, ...), unlike decorators, where every model this fallback could
 * pick is knowable and verified safe; it stays on the existing
 * OXC/esbuild path, unchanged from before this fix. Also never called
 * for a `.cts` file that itself uses CommonJS-only syntax (`export =`,
 * `import x = require(...)`) — that always lowers to literal
 * `require`/`module.exports` regardless of the `module` option below,
 * invalid in Vite's ESM pipeline — but a `.cts` file using neither is
 * called here like any other file, transpiled under a synthetic `.ts`
 * name (see below) precisely to sidestep that CommonJS forcing.
 */
function transpileWithDecorators(
  code: string,
  fileName: string,
  getCompilerOptions?: () => ts.CompilerOptions | undefined,
): { outputText: string; sourceMapText?: string } {
  const resolvedOptions = getCompilerOptions?.();

  const baseOptions: ts.CompilerOptions = {
    ...resolvedOptions,
    sourceMap: true,
    inlineSourceMap: false,
    inlineSources: false,
    // Force helpers (`__decorate`, `__param`, etc.) to be inlined into
    // the output rather than imported from `tslib` — this fallback's
    // output can't depend on an external module. If the resolved
    // program's tsconfig also set `noEmitHelpers: true` (meaning "the
    // caller provides these itself"), spreading it above and only
    // forcing `importHelpers: false` would leave TypeScript emitting
    // bare, undefined helper references — `noEmitHelpers` must be forced
    // off here too so inlining always actually happens. Inlining vs.
    // importing a helper doesn't change a decorator's own argument
    // shape, so this is safe regardless of which decorator model is in
    // play.
    importHelpers: false,
    noEmitHelpers: false,
    // `ts.transpileModule` transpiles one file in isolation, with no
    // Program/host context — so a `module` setting that depends on that
    // context to decide ESM vs. CommonJS per file (`NodeNext`/`Node16`,
    // which normally also consults the nearest `package.json`) falls back
    // to CommonJS for an ordinary `.ts` id, emitting `exports`/`require`.
    // Every consumer of this output is Vite's own ESM pipeline (the same
    // as the existing OXC/esbuild path below), never Node's module
    // loader, so the output must always be ESM regardless of what the
    // resolved program's `module` setting is for its own, real,
    // Node-context-aware compilation — `Preserve` keeps `import`/`export`
    // exactly as written, with no CJS/ESM interop transform at all.
    // `Preserve` was only added in TypeScript 5.4; this package also
    // supports Angular 17, whose own peer range allows an older
    // TypeScript where `ts.ModuleKind.Preserve` is `undefined` — falling
    // back to `ESNext` (present since long before either) keeps the same
    // "always ESM" guarantee on those versions too, *except* for a
    // `.cts` file: TypeScript treats that extension as CommonJS-format
    // regardless of `module` (the same rule `import x = require(...)`
    // relies on elsewhere), so `ESNext` — unlike `Preserve`, which
    // genuinely means "whatever the source wrote, untouched" — still
    // gets overridden back to `require`/`exports` for one specifically.
    // Transpiling under a synthetic `.ts` name below avoids relying on
    // `Preserve` being available at all for this case.
    module: ts.ModuleKind.Preserve ?? ts.ModuleKind.ESNext,
  };

  // A `.cts` file (never one using its own CommonJS-only syntax — see
  // the call site and this function's own doc comment) is transpiled
  // under this synthetic `.ts` name instead of its real one: TypeScript
  // hard-codes `.cts` to CommonJS-format output regardless of the
  // `module` option above, on every TypeScript version, not only ones
  // predating `Preserve`. The returned source map still points at the
  // file's real `.cts` path (`normalizeSourceMap` below takes `fileName`,
  // not this synthetic one) — only `ts.transpileModule`'s own module-
  // format decision needs misleading.
  const transpileFileName = fileName.endsWith('.cts')
    ? `${fileName.slice(0, -'.cts'.length)}.ts`
    : fileName;

  const honest = ts.transpileModule(code, {
    fileName: transpileFileName,
    compilerOptions: baseOptions,
  });

  const result = hasDecorator(honest.outputText, fileName)
    ? ts.transpileModule(code, {
        fileName: transpileFileName,
        compilerOptions: { ...baseOptions, target: ts.ScriptTarget.ES2022 },
      })
    : honest;

  // With external source maps, `ts.transpileModule` always appends its own
  // `//# sourceMappingURL=<file>.js.map` comment to `outputText`, pointing
  // at a `.js.map` file that is never actually written or served — the map
  // is returned separately as `sourceMapText`/`map` instead, which is what
  // Vite expects. Left in place, a downstream tool sees two competing
  // source-map references and coverage remapping can pick the wrong one.
  // The main plugin's own transform strips this same directive for the
  // same reason; mirror it here.
  return {
    outputText: result.outputText.replace(
      /\s*\/\/# sourceMappingURL=[^\r\n]*\s*$/,
      '',
    ),
    sourceMapText: result.sourceMapText
      ? normalizeSourceMap(result.sourceMapText, fileName)
      : undefined,
  };
}

/**
 * Sets up test config for Vitest
 * and downlevels any dependencies that use
 * async/await to support zone.js testing
 * and tests w/fakeAsync
 */
export function angularVitestPlugin(): Plugin {
  return {
    name: '@analogjs/vitest-angular-esm-plugin',
    apply: 'serve',
    enforce: 'post',
    config(userConfig) {
      // The `vmThreads` pool default only applies to the Node/JSDOM runner.
      // In Vitest browser mode a Node pool is a no-op for execution, but it
      // still poisons isolation: `isolate` has no effect under VM pools
      // (https://vitest.dev/config/isolate), and since Vitest 4.0.7 browser
      // isolation inherits that resolution — so forcing `vmThreads` disables
      // per-file isolation and leaks global state (e.g. fake timers) between
      // spec files. Leave the pool untouched when browser mode is enabled.
      const browserEnabled = (userConfig as any).test?.browser?.enabled;

      return {
        optimizeDeps: {
          include: ['tslib'],
        },
        ssr: {
          noExternal: [
            '@analogjs/vitest-angular/setup-testbed',
            /fesm2022(.*?)testing/,
            /fesm2015/,
          ],
        },
        ...(browserEnabled
          ? {}
          : {
              test: {
                pool: (userConfig as any).test?.pool ?? 'vmThreads',
              },
            }),
      };
    },
    async transform(_code, id) {
      if (
        (/fesm2022/.test(id) && _code.includes('async ')) ||
        _code.includes('@angular/cdk')
      ) {
        if (!vite.rolldownVersion) {
          const { code, map } = await vite.transformWithEsbuild(_code, id, {
            loader: 'js',
            format: 'esm',
            target: 'es2016',
            sourcemap: true,
            sourcefile: id,
          });

          return {
            code,
            map,
          };
        }
      }

      return undefined;
    },
  };
}

/**
 * This eagerly disables esbuild so Vitest
 * disables it when its internal plugin
 * is configured.
 */
export function angularVitestEsbuildPlugin(): Plugin {
  return {
    name: '@analogjs/vitest-angular-esbuild-oxc-plugin',
    enforce: 'pre',
    config(userConfig: UserConfig) {
      if (vite.rolldownVersion) {
        return {
          oxc: userConfig.oxc ?? false,
        };
      }

      return {
        esbuild: userConfig.esbuild ?? false,
      };
    },
  };
}

/**
 * Post-processing pass that converts any `.ts` files Angular's compilation
 * skipped (e.g. files without Angular decorators when
 * `useAngularCompilationAPI` is on) into runnable JS via esbuild/OXC.
 *
 * Files Angular already compiled have a sourcemap available via
 * `getInMap` — we skip those here to avoid breaking the chain Vite is
 * already wiring up. Re-running OXC over already-compiled JS produces a
 * map relative to the TS-emitted JS, not the original .ts source, and
 * OXC's `inMap` parameter does not chain through the way esbuild's inline
 * `//# sourceMappingURL=` auto-detection does.
 *
 * A file that still has Angular decorators (e.g. a component no spec
 * imports, which coverage tools transform anyway to report it as
 * uncovered) can't go through OXC/esbuild here: legacy decorator lowering
 * imports `@oxc-project/runtime` helpers that aren't a project dependency,
 * and parameter decorators either fail to parse or throw outright,
 * depending on the bundler. TypeScript's own transpiler inlines its
 * helpers and supports parameter decorators, so it's used instead,
 * with the compiler options the main plugin resolved for this program.
 * See #2555.
 */
export function angularVitestSourcemapPlugin(
  getInMap?: (id: string) => string | undefined,
  getCompilerOptions?: () => ts.CompilerOptions | undefined,
  getAppPackageRoot?: () => string | undefined,
): Plugin {
  return {
    name: '@analogjs/vitest-angular-sourcemap-plugin',
    async transform(code: string, id: string) {
      if (!TS_FAMILY_EXT_RE.test(id)) {
        return;
      }

      const [bareId, query] = id.split('?');

      if (query && query.includes('inline')) {
        return;
      }

      if (getInMap?.(bareId)) {
        return;
      }

      // Matches `.tsx` and its `.mtsx`/`.ctsx` counterparts — the same
      // JSX-carrying family `TS_FAMILY_EXT_RE` above admits. `.ctsx` also
      // matches `.cts`-shaped substrings in a naive check, but it's JSX,
      // not `.cts`'s CommonJS-format concern, so `isTsx` must catch it
      // before `isCts` below ever gets a say (see the gating condition).
      const isTsx = /\.[cm]?tsx(\?|$)/.test(bareId);
      const isCts = /\.cts(\?|$)/.test(bareId);

      // `getCompilerOptions` is one, single, app-wide set of settings —
      // correct for a file this app's own tsconfig actually governs, but
      // not necessarily for a genuinely separate package (a published
      // dependency, or a workspace one linked the same way), which may
      // have its own tsconfig and a different decorator model. Two
      // earlier approaches to spotting that case were tried and
      // reverted: a directory-prefix boundary (the Vite root, or the
      // tsconfig's own directory) doesn't work because real TypeScript
      // project membership doesn't follow directory nesting at all (an
      // Nx library can sit in a sibling top-level directory yet still be
      // governed by this same resolved tsconfig via `include`/path
      // mapping); a plain `node_modules`-in-the-path check doesn't work
      // either because Vite's default `resolve.preserveSymlinks: false`
      // hands plugins a workspace-linked dependency's *real*,
      // symlink-resolved path (e.g. `/repo/libs/pkg/src/file.ts`), never
      // the `node_modules` path that resolved it. And simply excluding a
      // file in a different package from this fallback entirely — rather
      // than resolving its own options — reproduces the original bug for
      // it, just for a different reason: a publishable Nx/workspace
      // library commonly has its own `package.json` while still being
      // covered by the *app's* coverage configuration, and such a file
      // is exactly this fix's target, not a foreign one to leave alone.
      //
      // What's actually invariant, regardless of directory shape or
      // symlink resolution, is which real npm/pnpm/yarn package a file
      // belongs to — its nearest ancestor `package.json`. An
      // Nx-integrated-style library with no `package.json` of its own
      // resolves to the very same nearest one as the app consuming it
      // (correctly "not foreign", so the app's own compiler options
      // apply as before); a real separate package's own `package.json`
      // is a different file, whether Vite handed a `node_modules` path
      // or that package's resolved real one — for that file, its own
      // nearest `tsconfig.json` (bounded to its own package directory,
      // so the search can't walk past it and pick up the app's tsconfig
      // by accident) is read and used instead, so this fallback still
      // lowers its decorators correctly, just with settings that are
      // actually this other package's own rather than the app's.
      const filePackageRoot = findNearestPackageJson(dirname(bareId));
      const appPackageRoot = getAppPackageRoot?.();
      const isInDifferentPackage =
        !!appPackageRoot &&
        normalizePath(filePackageRoot ?? '') !== normalizePath(appPackageRoot);
      const effectiveGetCompilerOptions = isInDifferentPackage
        ? () =>
            resolveNearestTsConfigOptions(
              dirname(bareId),
              filePackageRoot ? dirname(filePackageRoot) : dirname(bareId),
            )
        : getCompilerOptions;

      // `.tsx`'s JSX needs a lowering mode this fallback can't safely
      // pick (React, Preact, Solid, ... — no way to know which one the
      // real code targets), so it always stays on the existing
      // OXC/esbuild path below, unchanged from before this fix. `.cts`
      // only needs to, on top of `hasDecorator`, when it actually uses
      // CommonJS-only syntax (`export =`/`import x = require(...)`,
      // checked lazily since most `.cts` files use neither) — that
      // syntax always lowers to literal `require`/`module.exports`
      // regardless of any `module` option, invalid in Vite's ESM
      // pipeline; a `.cts` file that just happens not to use it is as
      // safe for this fallback as any other file.
      if (
        !isTsx &&
        !(isCts && hasCommonJsOnlySyntax(code, bareId)) &&
        hasDecorator(code, bareId)
      ) {
        const { outputText, sourceMapText } = transpileWithDecorators(
          code,
          bareId,
          effectiveGetCompilerOptions,
        );

        return { code: outputText, map: sourceMapText };
      }

      if (vite.transformWithOxc) {
        const result = await vite.transformWithOxc(code, id, {
          lang: isTsx ? 'tsx' : 'ts',
        });
        return result as unknown as vite.TransformResult;
      } else {
        // Vite 6/7 (no `transformWithOxc`) — same `isTsx` classification
        // as the OXC branch above; esbuild also rejects raw JSX under
        // `loader: 'ts'` rather than lowering it.
        const result = await vite.transformWithEsbuild(code, id, {
          loader: isTsx ? 'tsx' : 'ts',
        });
        return result;
      }
    },
  };
}

export function angularVitestPlugins(
  getInMap?: (id: string) => string | undefined,
  getCompilerOptions?: () => ts.CompilerOptions | undefined,
  getAppPackageRoot?: () => string | undefined,
) {
  return [
    angularVitestPlugin(),
    angularVitestEsbuildPlugin(),
    angularVitestSourcemapPlugin(
      getInMap,
      getCompilerOptions,
      getAppPackageRoot,
    ),
  ];
}

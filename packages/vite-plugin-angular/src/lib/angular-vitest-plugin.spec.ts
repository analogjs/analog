import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import {
  angularVitestPlugin,
  angularVitestSourcemapPlugin,
} from './angular-vitest-plugin';
import { defineConfig, resolveConfig } from 'vite';
import ts from 'typescript';
import { findNearestPackageJson } from './utils/plugin-config.js';

// Simulates Vite 6/7 (no `transformWithOxc` export at all) for one test
// below, without touching every other test in this file — a real ESM
// module's namespace is read-only from the importing side (no `delete`,
// no reassignment), so hiding an export means replacing the module
// itself. The flag defaults to passing the real export through
// unchanged; only `setForceNoOxc(true)` (reset in that one test's
// `finally`) makes this plugin's own `import * as vite from 'vite'` see
// it as `undefined`.
const { getForceNoOxc, setForceNoOxc } = vi.hoisted(() => {
  let forceNoOxc = false;
  return {
    getForceNoOxc: () => forceNoOxc,
    setForceNoOxc: (value: boolean) => {
      forceNoOxc = value;
    },
  };
});
vi.mock('vite', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vite')>();
  return new Proxy(actual, {
    get(target, prop, receiver) {
      if (prop === 'transformWithOxc' && getForceNoOxc()) {
        return undefined;
      }
      return Reflect.get(target, prop, receiver);
    },
  });
});

describe(angularVitestPlugin.name, () => {
  /* Setting the pool to vmThreads by default to avoid issues related to global conflicts when using JSDOM.
   * This also aligns with the default pool setting in Jest.
   * This is not ideal as vmThreads comes with its own set of issues, but it's the best option we have for now.
   * Cf. https://github.com/vitest-dev/vitest/issues/4685
   * Cf. https://vitest.dev/config/#vmthreads */
  it('should set pool to vmThreads', async () => {
    const config = await resolveConfig(
      defineConfig({
        plugins: [angularVitestPlugin()],
      }),
      'serve',
    );
    expect(config.test?.pool).toBe('vmThreads');
  });

  it('should not override pool option if already set by user', async () => {
    const config = await resolveConfig(
      defineConfig({
        plugins: [angularVitestPlugin()],
        test: {
          pool: 'threads',
        },
      }),
      'serve',
    );
    expect(config.test?.pool).toBe('threads');
  });

  /* In browser mode a Node pool is a no-op for execution but disables
   * per-file isolation (`isolate` has no effect under VM pools, and browser
   * isolation inherits it since Vitest 4.0.7), leaking global state such as
   * fake timers across spec files. The plugin must not force a pool then.
   * Cf. https://github.com/analogjs/analog/issues/2222 */
  it('should not force a pool when browser mode is enabled', async () => {
    const config = await resolveConfig(
      defineConfig({
        plugins: [angularVitestPlugin()],
        test: {
          browser: {
            enabled: true,
            instances: [{ browser: 'chromium' }],
          },
        },
      }),
      'serve',
    );
    expect(config.test?.pool).toBeUndefined();
  });
});

describe(angularVitestSourcemapPlugin.name, () => {
  // A component that no spec imports still reaches this plugin, because
  // `@vitest/coverage-v8` transforms every file matching `coverage.include`
  // to report it as uncovered (`getCoverageMapForUncoveredFiles`). Regression
  // for #2555: OXC/esbuild either throw on parameter decorators or emit an
  // `@oxc-project/runtime` import that isn't a project dependency, so
  // coverage-v8 fell back to the raw .ts source and failed to parse it
  // (`PARSE_ERROR` on `implements` clauses, typed fields, etc.).
  const decoratedSource = `
import { Component, Inject, InjectionToken, Input, OnInit } from '@angular/core';

export const TOKEN = new InjectionToken<string>('TOKEN');

@Component({ selector: 'app-untested', template: '<p>untested</p>' })
export class UntestedComponent implements OnInit {
  @Input() name: string = '';
  production: boolean = false;

  constructor(@Inject(TOKEN) private readonly token: string) {}

  ngOnInit(): void {
    console.log(this.token);
  }
}
`;

  // Regression for the aliased/namespaced bypass found in review: detection
  // has to be syntax-aware (any `@identifier(`), not name-aware (only the
  // canonical `@Component(` etc.), or these two still hit OXC/esbuild's
  // parameter-decorator gap and reproduce #2555.
  const aliasedDecoratedSource = `
import { Component as NgComponent, Inject, InjectionToken } from '@angular/core';

export const TOKEN = new InjectionToken<string>('TOKEN');

@NgComponent({ selector: 'app-untested', template: '<p>untested</p>' })
export class UntestedComponent {
  constructor(@Inject(TOKEN) private readonly token: string) {}
}
`;

  const namespacedDecoratedSource = `
import * as core from '@angular/core';

export const TOKEN = new core.InjectionToken<string>('TOKEN');

@core.Component({ selector: 'app-untested', template: '<p>untested</p>' })
export class UntestedComponent {
  constructor(@core.Inject(TOKEN) private readonly token: string) {}
}
`;

  // Regression for a second review finding: a decorator does not have to be
  // a call — `@inject` (a bare reference to a decorator factory's result) is
  // just as valid as `@Inject(TOKEN)`, and a regex that only matches
  // `@name(...)` misses it entirely, leaving the parameter decorator on the
  // failing OXC/esbuild path.
  const bareParameterDecoratorSource = `
import { Inject, InjectionToken } from '@angular/core';

export const TOKEN = new InjectionToken<string>('TOKEN');
const inject = Inject(TOKEN);

export class UntestedComponent {
  constructor(@inject private readonly token: string) {}
}
`;

  async function assertParsesAsCoverageWould(code: string) {
    // Mirrors what `@vitest/coverage-v8` does with a transform result
    // (`remapCoverage` → `parseAstAsync(result.code)`); throwing here is
    // exactly the failure coverage-v8 reports as a PARSE_ERROR.
    const { parseAstAsync } = await import('vite');
    await expect(parseAstAsync(code)).resolves.toBeDefined();
  }

  it('transpiles a decorated file outside the program with TypeScript instead of OXC/esbuild', async () => {
    const plugin = angularVitestSourcemapPlugin(
      () => undefined,
      () => ({
        target: ts.ScriptTarget.ES2022,
        experimentalDecorators: true,
        useDefineForClassFields: false,
      }),
    );

    const result = await (plugin.transform as any)(
      decoratedSource,
      '/project/src/untested.component.ts',
    );

    expect(result?.code).toBeDefined();
    await assertParsesAsCoverageWould(result.code);
    expect(result.code).not.toContain('implements');
    expect(result.code).not.toContain(': string');
    expect(result.code).not.toContain('@Component(');
    expect(result.code).not.toContain('@oxc-project/runtime');
    expect(result.map).toBeDefined();
    // `ts.transpileModule` with external source maps always appends this
    // comment to its output, pointing at a `.js.map` file that's never
    // actually written or served — the map is already returned separately
    // via `result.map`, so a leftover comment here would leave a
    // downstream tool with two competing source-map references.
    expect(result.code).not.toContain('//# sourceMappingURL=');
  });

  // Regression: a monorepo base tsconfig can set `sourceRoot` for its own,
  // real, multi-file emission layout. That describes a relationship
  // between a *real build's* output and its sources — not this isolated
  // single-file transpile. Combining it with this file's own directory
  // (as the main plugin's own sourcemap normalization does, correctly,
  // for its own multi-file case) would point at the wrong file entirely:
  // `sourceRoot: '../generated'` for a file in `/project/lib` would
  // resolve to `/project/generated/untested.component.ts`, not the real
  // file — coverage silently attributed to nowhere. `sourceRoot` must not
  // survive into the returned map at all, regardless of its value, and
  // the sole `sources` entry must always be this file's own real path.
  it.each([
    ['unset', undefined],
    ['empty', ''],
    ['a relative, unrelated directory', '../generated'],
    ['an absolute, unrelated directory', '/some/other/root'],
  ])(
    'resolves the map to the real file path when the resolved tsconfig sets sourceRoot to %s',
    async (_label, sourceRoot) => {
      const plugin = angularVitestSourcemapPlugin(
        () => undefined,
        () => ({
          target: ts.ScriptTarget.ES2022,
          experimentalDecorators: true,
          useDefineForClassFields: false,
          ...(sourceRoot !== undefined ? { sourceRoot } : {}),
        }),
      );

      const result = await (plugin.transform as any)(
        decoratedSource,
        '/project/src/untested.component.ts',
      );

      expect(result?.map).toBeDefined();
      const map = JSON.parse(result.map as string);
      expect(map.sourceRoot).toBeUndefined();
      expect(map.sources).toEqual(['/project/src/untested.component.ts']);
    },
  );

  it('transpiles a file whose Angular decorator is imported under an alias', async () => {
    const plugin = angularVitestSourcemapPlugin(
      () => undefined,
      () => ({
        target: ts.ScriptTarget.ES2022,
        experimentalDecorators: true,
        useDefineForClassFields: false,
      }),
    );

    const result = await (plugin.transform as any)(
      aliasedDecoratedSource,
      '/project/src/untested.component.ts',
    );

    expect(result?.code).toBeDefined();
    await assertParsesAsCoverageWould(result.code);
    expect(result.code).not.toContain('@NgComponent(');
    expect(result.code).not.toContain('@oxc-project/runtime');
  });

  it('transpiles a file whose Angular decorators are namespace-qualified', async () => {
    const plugin = angularVitestSourcemapPlugin(
      () => undefined,
      () => ({
        target: ts.ScriptTarget.ES2022,
        experimentalDecorators: true,
        useDefineForClassFields: false,
      }),
    );

    const result = await (plugin.transform as any)(
      namespacedDecoratedSource,
      '/project/src/untested.component.ts',
    );

    expect(result?.code).toBeDefined();
    await assertParsesAsCoverageWould(result.code);
    expect(result.code).not.toContain('@core.Component(');
    expect(result.code).not.toContain('@oxc-project/runtime');
  });

  it('transpiles a file whose only decorator is a bare (non-call) reference', async () => {
    const plugin = angularVitestSourcemapPlugin(
      () => undefined,
      () => ({
        target: ts.ScriptTarget.ES2022,
        experimentalDecorators: true,
        useDefineForClassFields: false,
      }),
    );

    const result = await (plugin.transform as any)(
      bareParameterDecoratorSource,
      '/project/src/untested.component.ts',
    );

    expect(result?.code).toBeDefined();
    await assertParsesAsCoverageWould(result.code);
    expect(result.code).not.toContain('@inject ');
    expect(result.code).not.toContain('@oxc-project/runtime');
  });

  it('inlines decorator helpers even when the resolved tsconfig disables them for real builds', async () => {
    const plugin = angularVitestSourcemapPlugin(
      () => undefined,
      () => ({
        target: ts.ScriptTarget.ES2022,
        experimentalDecorators: true,
        useDefineForClassFields: false,
        // A real project's tsconfig can legitimately set this for its own
        // build; this fallback's output can't rely on any external
        // runtime, so it must force helper inlining regardless. #2555
        noEmitHelpers: true,
      }),
    );

    const result = await (plugin.transform as any)(
      decoratedSource,
      '/project/src/untested.component.ts',
    );

    expect(result?.code).toBeDefined();
    await assertParsesAsCoverageWould(result.code);
    // A helper reference must come with its inline definition — otherwise
    // it's an undefined reference with no import to resolve it either.
    expect(result.code).toMatch(/var __decorate = |function __decorate\(/);
    expect(result.code).not.toContain("from 'tslib'");
    expect(result.code).not.toContain('require("tslib")');
  });

  it('transpiles the same decorated file without experimentalDecorators', async () => {
    const plugin = angularVitestSourcemapPlugin(
      () => undefined,
      () => ({
        target: ts.ScriptTarget.ES2022,
        experimentalDecorators: false,
        useDefineForClassFields: false,
      }),
    );

    const result = await (plugin.transform as any)(
      decoratedSource,
      '/project/src/untested.component.ts',
    );

    expect(result?.code).toBeDefined();
    await assertParsesAsCoverageWould(result.code);
    expect(result.code).not.toContain('@Component(');
    expect(result.code).not.toContain('@Inject(');
    expect(result.code).not.toContain('@oxc-project/runtime');
  });

  // Regression: standard (TC39 stage-3) decorators don't cover parameter
  // decorators at all. At `target: ESNext` TypeScript treats decorators as
  // native runtime syntax and leaves them un-lowered when
  // `experimentalDecorators` is off, so `@Inject(...)` on a constructor
  // parameter survives straight into the output — syntax no downstream
  // parser accepts, reproducing #2555's PARSE_ERROR under a real,
  // resolvable project configuration. Legacy lowering has to be forced
  // regardless of the program's own target/decorator model.
  it('lowers a parameter decorator even at target ESNext with experimentalDecorators off', async () => {
    // `useDefineForClassFields` deliberately left unset — it defaults to
    // `true` at ES2022+ targets, exactly as an Angular CLI tsconfig
    // (which never sets it explicitly) would resolve. With it `false`,
    // TypeScript takes a different, already-portable codegen path and the
    // bug this test guards doesn't reproduce.
    const plugin = angularVitestSourcemapPlugin(
      () => undefined,
      () => ({
        target: ts.ScriptTarget.ESNext,
        experimentalDecorators: false,
      }),
    );

    const result = await (plugin.transform as any)(
      decoratedSource,
      '/project/src/untested.component.ts',
    );

    expect(result?.code).toBeDefined();
    await assertParsesAsCoverageWould(result.code);
    expect(result.code).not.toContain('@Component(');
    expect(result.code).not.toContain('@Inject(');
    expect(result.code).not.toContain('@oxc-project/runtime');
  });

  it('falls back to OXC/esbuild for a decorator-free file (unchanged behavior)', async () => {
    const plugin = angularVitestSourcemapPlugin(() => undefined);

    const code = `export const data: [string, string][] = [['a', 'A']];\n`;
    const result = await (plugin.transform as any)(
      code,
      '/project/src/plain-untested.ts',
    );

    expect(result?.code).toBeDefined();
    await assertParsesAsCoverageWould(result.code);
    expect(result.code).not.toContain(': [string, string][]');
  });

  // Regression: the main plugin's own transform filter supports `.mts`
  // (`TS_EXT_REGEX`), so a decorated component living in one of those
  // files can reach this plugin the same way an untested `.ts` one does;
  // the extension guard has to recognize it too.
  it('transpiles a decorated file outside the program with an .mts extension', async () => {
    const plugin = angularVitestSourcemapPlugin(
      () => undefined,
      () => ({
        target: ts.ScriptTarget.ES2022,
        experimentalDecorators: true,
        useDefineForClassFields: false,
      }),
    );

    const result = await (plugin.transform as any)(
      decoratedSource,
      '/project/src/untested.component.mts',
    );

    expect(result?.code).toBeDefined();
    await assertParsesAsCoverageWould(result.code);
    expect(result.code).not.toContain('@Component(');
    expect(result.code).not.toContain('@oxc-project/runtime');
  });

  // Regression: a `.cts` file that just happens not to use any
  // CommonJS-only syntax of its own (the common case — plain
  // `import`/`export` code, e.g. an Angular component with no reason to
  // need CommonJS semantics) is exactly as fixable as a `.ts` file; the
  // extension alone shouldn't drop it to the failing OXC/esbuild path.
  it('transpiles a decorated .cts file that uses no CommonJS-only syntax of its own', async () => {
    const plugin = angularVitestSourcemapPlugin(
      () => undefined,
      () => ({
        target: ts.ScriptTarget.ES2022,
        experimentalDecorators: true,
        useDefineForClassFields: false,
      }),
    );

    const result = await (plugin.transform as any)(
      decoratedSource,
      '/project/src/untested.component.cts',
    );

    expect(result?.code).toBeDefined();
    await assertParsesAsCoverageWould(result.code);
    expect(result.code).not.toContain('@Component(');
    expect(result.code).not.toContain('@oxc-project/runtime');
    // `.cts` is CommonJS-format by extension alone in TypeScript,
    // regardless of any `module` option — a naive transpile would emit
    // `require`/`exports` here, invalid in Vite's ESM pipeline. Checking
    // parse success alone (above) wouldn't catch that: CommonJS output
    // parses fine, it just doesn't run under Vite.
    expect(result.code).not.toContain('require(');
    expect(result.code).not.toContain('exports.');
    expect(result.code).toContain('import');
  });

  // Regression: `ts.transpileModule` hard-codes a `.cts` file to
  // CommonJS-format output regardless of the `module` option — including
  // `ESNext`, unlike `Preserve` — so the fallback for a TypeScript
  // version before 5.4 (`ts.ModuleKind.Preserve` doesn't exist yet; this
  // package also supports Angular 17, whose peer range allows one) needs
  // its own way to avoid that, not just a different `module` value.
  it('emits ESM output for a decorated .cts file even without ts.ModuleKind.Preserve (pre-TypeScript-5.4)', async () => {
    const originalPreserve = ts.ModuleKind.Preserve;
    // @ts-expect-error simulating a TypeScript version where this enum
    // member doesn't exist yet, the same way a real pre-5.4 `typescript`
    // package would leave it `undefined`.
    delete ts.ModuleKind.Preserve;

    try {
      const plugin = angularVitestSourcemapPlugin(
        () => undefined,
        () => ({
          target: ts.ScriptTarget.ES2022,
          experimentalDecorators: true,
          useDefineForClassFields: false,
        }),
      );

      const result = await (plugin.transform as any)(
        decoratedSource,
        '/project/src/untested.component.cts',
      );

      expect(result?.code).toBeDefined();
      await assertParsesAsCoverageWould(result.code);
      expect(result.code).not.toContain('require(');
      expect(result.code).not.toContain('exports.');
      expect(result.code).toContain('import');
    } finally {
      ts.ModuleKind.Preserve = originalPreserve;
    }
  });

  // Regression: `.cts`'s own CommonJS-only syntax (`export =`,
  // `import x = require(...)`) always lowers to literal
  // `require`/`module.exports` in `ts.transpileModule`, regardless of any
  // `module` option — invalid in Vite's ESM pipeline. A `.cts` file that
  // actually uses either stays on the existing OXC/esbuild path,
  // unchanged from before this fix — a known, deliberate limitation for
  // that specific, narrower case, not one this fix claims to close.
  // `import x = SomeNamespace.Member` (a type-level alias, not
  // `require(...)`) is unaffected — see the passing case above, which
  // already covers ordinary `import`/`export` syntax.
  it.each([
    [
      'export =',
      `import { Component, Inject, InjectionToken } from '@angular/core';
export const TOKEN = new InjectionToken<string>('TOKEN');
@Component({ selector: 'app-untested', template: '<p>untested</p>' })
class UntestedComponent {
  constructor(@Inject(TOKEN) private readonly token: string) {}
}
export = UntestedComponent;
`,
    ],
    [
      'import x = require(...)',
      `import x = require('@angular/core');
@x.Component({ selector: 'app-untested', template: '<p>untested</p>' })
export class UntestedComponent {
  constructor(@x.Inject('TOKEN') private readonly token: string) {}
}
`,
    ],
  ])(
    'leaves a decorated .cts file using %s on the existing OXC/esbuild path (not fixed)',
    async (_label, source) => {
      const plugin = angularVitestSourcemapPlugin(
        () => undefined,
        () => ({
          target: ts.ScriptTarget.ES2022,
          experimentalDecorators: true,
          useDefineForClassFields: false,
        }),
      );

      const result = await (plugin.transform as any)(
        source,
        '/project/src/untested.component.cts',
      );

      expect(result?.code).toBeDefined();
      await expect(assertParsesAsCoverageWould(result.code)).rejects.toThrow();
    },
  );

  // Regression: `export default expr` parses to the same `ExportAssignment`
  // node as `export =`, distinguished only by `isExportEquals` — a `.cts`
  // file using ordinary `export default` (standard ESM, not CommonJS-only)
  // must not be misclassified as needing the OXC/esbuild fallback.
  it('transpiles a decorated .cts file that uses export default (not CommonJS-only)', async () => {
    const plugin = angularVitestSourcemapPlugin(
      () => undefined,
      () => ({
        target: ts.ScriptTarget.ES2022,
        experimentalDecorators: true,
        useDefineForClassFields: false,
      }),
    );

    const source = `import { Component, Inject, InjectionToken } from '@angular/core';
export const TOKEN = new InjectionToken<string>('TOKEN');
@Component({ selector: 'app-untested', template: '<p>untested</p>' })
class UntestedComponent {
  constructor(@Inject(TOKEN) private readonly token: string) {}
}
export default UntestedComponent;
`;

    const result = await (plugin.transform as any)(
      source,
      '/project/src/untested.component.cts',
    );

    expect(result?.code).toBeDefined();
    await assertParsesAsCoverageWould(result.code);
    expect(result.code).not.toContain('@Component(');
    expect(result.code).not.toContain('@oxc-project/runtime');
  });

  // Regression: a decorated `.tsx` file's JSX would need a lowering mode
  // this fallback can't safely pick (React, Preact, Solid, ... — no way
  // to know which one the real code targets). Rather than guess, it
  // stays on the existing OXC/esbuild path, unchanged from before this
  // fix — a known, deliberate limitation, not one this fix claims to
  // close.
  it('does not route a decorated .tsx file through the decorator-lowering fallback', async () => {
    const plugin = angularVitestSourcemapPlugin(
      () => undefined,
      () => ({ target: ts.ScriptTarget.ES2022, experimentalDecorators: true }),
    );

    const decoratedTsxSource = `
function logRender(target) { return target; }

@logRender
export class Widget {
  render() {
    return <div className="widget">hi</div>;
  }
}
`;

    const result = await (plugin.transform as any)(
      decoratedTsxSource,
      '/project/src/widget.component.tsx',
    );

    expect(result?.code).toBeDefined();
    // Not run through `ts.transpileModule`'s decorator lowering — no
    // legacy helper definitions appear (a plain `.ts` file with the same
    // decorator does emit these; see the tests above).
    expect(result.code).not.toContain('__decorate');
    expect(result.code).not.toContain('__esDecorate');
  });

  // Regression: `getCompilerOptions` is one, single, app-wide set of
  // settings — correct for a file this app's own tsconfig actually
  // governs, but not necessarily for a genuinely separate real package (a
  // published dependency, or a workspace one linked the same way), which
  // may have its own tsconfig and a different decorator model. Three
  // earlier approaches were tried and reverted: a directory-prefix
  // boundary (the Vite root, or the tsconfig's own directory) doesn't work
  // because real TypeScript project membership doesn't follow directory
  // nesting (an Nx library can sit in a sibling top-level directory yet
  // still be governed by this same resolved tsconfig); a plain
  // `node_modules`-in-the-path check doesn't work either because Vite's
  // default `resolve.preserveSymlinks: false` hands plugins a
  // workspace-linked dependency's *real*, symlink-resolved path, never the
  // `node_modules` path that resolved it; and simply excluding a
  // different-package file from this fallback entirely reproduces the
  // original bug for it, for a different reason — a publishable
  // Nx/workspace library commonly has its own `package.json` while still
  // being covered by the *app's* coverage configuration, and such a file
  // is exactly this fix's target, not a foreign one to leave alone. What's
  // actually invariant is which real npm/pnpm/yarn package a file belongs
  // to — its nearest ancestor `package.json` — and once a file is found to
  // belong to a different one, it's that other package's own nearest
  // `tsconfig.json` (bounded to its own package directory) that governs
  // it, not the app's, nor whatever ancestor tsconfig happens to sit
  // further up past that package's root. These tests use real, on-disk
  // directories and `package.json`/`tsconfig.json` files, not synthetic
  // path strings.
  describe('package-identity boundary', () => {
    let workspaceRoot: string;
    let appTsconfigDir: string;
    let appPackageJsonPath: string;

    beforeAll(() => {
      // No `package.json` in `apps/web` or `apps` themselves, mirroring a
      // real Nx-integrated-style monorepo, where only the workspace root
      // has one — this is what lets the sibling-library control test
      // below resolve to the very same package root as the app.
      workspaceRoot = mkdtempSync(join(tmpdir(), 'analog-package-boundary-'));
      writeFileSync(
        join(workspaceRoot, 'package.json'),
        JSON.stringify({ name: 'workspace-root' }),
        'utf-8',
      );
      appTsconfigDir = join(workspaceRoot, 'apps', 'web');
      mkdirSync(appTsconfigDir, { recursive: true });
      appPackageJsonPath = join(workspaceRoot, 'package.json');
    });

    afterAll(() => {
      rmSync(workspaceRoot, { recursive: true, force: true });
    });

    // Records how many arguments the class decorator was actually called
    // with, rather than reading a standard-only property like
    // `context.kind` off a possibly-absent second argument (which would
    // throw under legacy semantics instead of distinguishing them):
    // legacy (`experimentalDecorators: true`) invokes a class decorator as
    // `decorator(target)` — one argument — while standard (TC39)
    // decorators invoke it as `decorator(value, context)` — two. Decorator
    // *helper names* in the output aren't used to tell the two apart, since
    // they've already been shown elsewhere in this file not to be a
    // reliable signal.
    const argCountDecoratorSource = `
let capturedArgsLength;
function track(...args) {
  capturedArgsLength = args.length;
  return args[0];
}
@track
class Widget {}
globalThis.__capturedArgsLength = capturedArgsLength;
`;

    async function runAndCaptureArgsLength(code: string): Promise<number> {
      (globalThis as any).__capturedArgsLength = undefined;
      try {
        new Function(code)();
        return (globalThis as any).__capturedArgsLength;
      } finally {
        delete (globalThis as any).__capturedArgsLength;
      }
    }

    it.each([
      [
        'a classic node_modules-symlinked dependency',
        () => join(workspaceRoot, 'node_modules', '@other-scope', 'lib'),
      ],
      [
        // Vite's default `resolve.preserveSymlinks: false` hands plugins
        // a workspace-linked dependency's *real*, symlink-resolved path
        // instead — no `node_modules` segment anywhere in it, even
        // though it's exactly as separate a package as the one above.
        'a workspace-linked dependency reached through its real, symlink-resolved path (no node_modules segment at all)',
        () => join(workspaceRoot, 'libs', 'other-lib-no-tsconfig'),
      ],
    ])(
      "resolves a different real package's own TypeScript defaults, not this app's compiler options, when it has no tsconfig of its own (%s)",
      async (_label, makeDepDir) => {
        const depDir = makeDepDir();
        mkdirSync(join(depDir, 'src'), { recursive: true });
        writeFileSync(
          join(depDir, 'package.json'),
          JSON.stringify({ name: 'other-lib' }),
          'utf-8',
        );
        const filePath = join(depDir, 'src', 'widget.ts');

        const plugin = angularVitestSourcemapPlugin(
          () => undefined,
          // The app's own options force legacy decorators — asserted
          // below to *not* be what actually ran for this file.
          () => ({
            target: ts.ScriptTarget.ES2022,
            experimentalDecorators: true,
          }),
          () => appPackageJsonPath,
        );

        const result = await (plugin.transform as any)(
          argCountDecoratorSource,
          filePath,
        );

        expect(result?.code).toBeDefined();
        await assertParsesAsCoverageWould(result.code);
        // TypeScript's own bare default (no tsconfig found at all) is
        // standard decorators, not this app's legacy setting.
        expect(await runAndCaptureArgsLength(result.code)).toBe(2);
      },
    );

    it("resolves a different real package's own tsconfig.json settings, not this app's, when it has one", async () => {
      const depDir = join(workspaceRoot, 'libs', 'other-lib-with-tsconfig');
      mkdirSync(join(depDir, 'src'), { recursive: true });
      writeFileSync(
        join(depDir, 'package.json'),
        JSON.stringify({ name: 'other-lib' }),
        'utf-8',
      );
      writeFileSync(
        join(depDir, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: {
            target: 'ES2022',
            experimentalDecorators: true,
          },
        }),
        'utf-8',
      );
      const filePath = join(depDir, 'src', 'widget.ts');

      const plugin = angularVitestSourcemapPlugin(
        () => undefined,
        // The app's own options use standard decorators — asserted below
        // to *not* be what actually ran for this file, in favor of the
        // other package's own explicit `experimentalDecorators: true`.
        () => ({
          target: ts.ScriptTarget.ES2022,
          experimentalDecorators: false,
        }),
        () => appPackageJsonPath,
      );

      const result = await (plugin.transform as any)(
        argCountDecoratorSource,
        filePath,
      );

      expect(result?.code).toBeDefined();
      await assertParsesAsCoverageWould(result.code);
      expect(await runAndCaptureArgsLength(result.code)).toBe(1);
    });

    it("does not walk past a different real package's own root to inherit an ancestor tsconfig.json", async () => {
      // Isolated from the shared `workspaceRoot` above so this test's own
      // ancestor tsconfig can't leak into (or depend on execution order
      // with) any other test in this file.
      const boundaryWorkspaceRoot = mkdtempSync(
        join(tmpdir(), 'analog-package-boundary-ancestor-'),
      );
      try {
        writeFileSync(
          join(boundaryWorkspaceRoot, 'package.json'),
          JSON.stringify({ name: 'boundary-workspace-root' }),
          'utf-8',
        );
        // Sits *above* the other package's own root — reachable only if
        // the search failed to stop at the package boundary. Its
        // `experimentalDecorators: true` differs from both the app's own
        // options below and TypeScript's bare default, so wrongly
        // inheriting it is distinguishable from either.
        writeFileSync(
          join(boundaryWorkspaceRoot, 'tsconfig.json'),
          JSON.stringify({
            compilerOptions: {
              target: 'ES2022',
              experimentalDecorators: true,
            },
          }),
          'utf-8',
        );

        const depDir = join(
          boundaryWorkspaceRoot,
          'libs',
          'other-lib-no-own-tsconfig',
        );
        mkdirSync(join(depDir, 'src'), { recursive: true });
        writeFileSync(
          join(depDir, 'package.json'),
          JSON.stringify({ name: 'other-lib' }),
          'utf-8',
        );
        const filePath = join(depDir, 'src', 'widget.ts');

        const plugin = angularVitestSourcemapPlugin(
          () => undefined,
          () => ({
            target: ts.ScriptTarget.ES2022,
            experimentalDecorators: false,
          }),
          () => join(boundaryWorkspaceRoot, 'package.json'),
        );

        const result = await (plugin.transform as any)(
          argCountDecoratorSource,
          filePath,
        );

        expect(result?.code).toBeDefined();
        await assertParsesAsCoverageWould(result.code);
        // TypeScript's own bare default (standard decorators) — not the
        // ancestor tsconfig's legacy setting, which sits past this
        // package's own boundary.
        expect(await runAndCaptureArgsLength(result.code)).toBe(2);
      } finally {
        rmSync(boundaryWorkspaceRoot, { recursive: true, force: true });
      }
    });

    it("still applies this app's compiler options to a file with no ancestor package.json at all", async () => {
      // A directory with no `package.json` anywhere above it up to the
      // real filesystem root — `findNearestPackageJson` returns
      // `undefined` for it, which is not proof the file belongs to some
      // other package; it should still be treated as this app's own.
      const orphanDir = mkdtempSync(join(tmpdir(), 'analog-package-orphan-'));
      try {
        expect(findNearestPackageJson(orphanDir)).toBeUndefined();

        const filePath = join(orphanDir, 'widget.ts');

        const plugin = angularVitestSourcemapPlugin(
          () => undefined,
          () => ({
            target: ts.ScriptTarget.ES2022,
            experimentalDecorators: true,
          }),
          () => appPackageJsonPath,
        );

        const result = await (plugin.transform as any)(
          argCountDecoratorSource,
          filePath,
        );

        expect(result?.code).toBeDefined();
        await assertParsesAsCoverageWould(result.code);
        expect(await runAndCaptureArgsLength(result.code)).toBe(1);
      } finally {
        rmSync(orphanDir, { recursive: true, force: true });
      }
    });

    // Control: the package-identity check above doesn't affect an
    // ordinary project file, including one in a sibling top-level
    // directory with no `package.json` of its own (an Nx-integrated-style
    // library) — walking up from either lands on the very same workspace
    // `package.json`, so it's still transpiled with this app's own
    // compiler options like any other.
    it.each([
      [
        'a normal source file within the app itself',
        () => {
          const dir = join(appTsconfigDir, 'src');
          mkdirSync(dir, { recursive: true });
          return join(dir, 'widget.ts');
        },
      ],
      [
        'an Nx-integrated-style sibling library with no package.json of its own',
        () => {
          const dir = join(workspaceRoot, 'libs', 'ui', 'src');
          mkdirSync(dir, { recursive: true });
          return join(dir, 'widget.ts');
        },
      ],
    ])(
      'still applies compiler options to a decorated file belonging to the same real package as the app (%s)',
      async (_label, makeFilePath) => {
        const filePath = makeFilePath();

        const plugin = angularVitestSourcemapPlugin(
          () => undefined,
          () => ({
            target: ts.ScriptTarget.ES2022,
            experimentalDecorators: true,
          }),
          () => appPackageJsonPath,
        );

        const result = await (plugin.transform as any)(
          argCountDecoratorSource,
          filePath,
        );

        expect(result?.code).toBeDefined();
        await assertParsesAsCoverageWould(result.code);
        expect(await runAndCaptureArgsLength(result.code)).toBe(1);
      },
    );
  });

  // Regression: `TS_FAMILY_EXT_RE` admits `.mtsx`/`.ctsx` as JSX
  // counterparts of `.tsx`, but a narrower classification further down
  // only recognized literal `.tsx` — so an `.mtsx`/`.ctsx` file (with no
  // decorator, reaching the plain OXC/esbuild path below) was sent
  // through with `lang: 'ts'` instead of `'tsx'`, which rejects JSX
  // syntax outright rather than lowering it — the exact PARSE_ERROR this
  // fix exists to eliminate, just for a different pair of extensions.
  it.each(['widget.component.mtsx', 'widget.component.ctsx'])(
    'lowers JSX in a decorator-free %s file (not left as lang: "ts")',
    async (fileName) => {
      const plugin = angularVitestSourcemapPlugin(() => undefined);

      const jsxSource = `
export function Widget() {
  return <div className="widget">hi</div>;
}
`;

      const result = await (plugin.transform as any)(
        jsxSource,
        `/project/src/${fileName}`,
      );

      expect(result?.code).toBeDefined();
      await assertParsesAsCoverageWould(result.code);
      expect(result.code).not.toContain('<div');
    },
  );

  // Regression: Vite 6/7 (this package's own supported range) has no
  // `transformWithOxc` at all — the esbuild fallback below it must apply
  // the exact same `isTsx` classification the OXC branch above does, or
  // `.tsx`/`.mtsx`/`.ctsx` JSX fails to parse there specifically, even
  // once the OXC path (what this session's installed Vite actually uses)
  // is fixed.
  it('lowers JSX through the esbuild fallback when transformWithOxc is unavailable (Vite 6/7)', async () => {
    setForceNoOxc(true);

    try {
      const plugin = angularVitestSourcemapPlugin(() => undefined);

      const jsxSource = `
export function Widget() {
  return <div className="widget">hi</div>;
}
`;

      const result = await (plugin.transform as any)(
        jsxSource,
        '/project/src/widget.component.tsx',
      );

      expect(result?.code).toBeDefined();
      await assertParsesAsCoverageWould(result.code);
      expect(result.code).not.toContain('<div');
    } finally {
      setForceNoOxc(false);
    }
  });

  // Regression: the extension match has to be anchored to the true
  // extension. Unanchored, `fixture.cts.css` or `component.tsx.snap` would
  // also match (`.cts`/`.tsx` appear mid-string), sending non-TypeScript
  // content through a TypeScript loader that can throw and abort the run.
  it.each([
    'fixture.cts.css',
    'data.mts.json',
    'component.tsx.snap',
    'styles.ts.scss',
  ])(
    'leaves a non-TypeScript compound extension (%s) untouched',
    async (filename) => {
      const plugin = angularVitestSourcemapPlugin(() => undefined);

      const result = await (plugin.transform as any)(
        'this is not TypeScript at all { [ } ] : :: ///',
        `/project/src/${filename}`,
      );

      expect(result).toBeUndefined();
    },
  );

  // Regression: this plugin also runs for files a real test imports and
  // executes, not just ones a coverage pass merely inspects. Forcing legacy
  // decorator lowering unconditionally would silently change a standard
  // (TC39 stage-3) decorator's runtime semantics — it receives a single
  // `(value, context)` argument, while a legacy one receives
  // `(target, key, descriptor)`. This decorator only has one param
  // (`context`) and reads `context.kind`, which only exists in the
  // standard shape; under legacy semantics that argument would instead be
  // a raw `PropertyDescriptor` (or the constructor itself for a class
  // decorator) with no `.kind` property, so `capturedKind` would come back
  // `undefined` if the fallback wrongly forced legacy mode here.
  it('preserves standard decorator semantics when no decorator needs legacy lowering', async () => {
    const plugin = angularVitestSourcemapPlugin(
      () => undefined,
      () => ({ target: ts.ScriptTarget.ES2022, experimentalDecorators: false }),
    );

    const standardDecoratorSource = `
let capturedKind;
function track(value, context) {
  capturedKind = context.kind;
  return value;
}
@track
class Widget {}
globalThis.__capturedKind = capturedKind;
`;

    const result = await (plugin.transform as any)(
      standardDecoratorSource,
      '/project/src/widget.ts',
    );

    expect(result?.code).toBeDefined();
    await assertParsesAsCoverageWould(result.code);
    expect(result.code).not.toContain('@track');

    (globalThis as any).__capturedKind = undefined;
    try {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      new Function(result.code)();
      expect((globalThis as any).__capturedKind).toBe('class');
    } finally {
      delete (globalThis as any).__capturedKind;
    }
  });

  // Regression: at `target: ESNext` TypeScript otherwise assumes the
  // runtime natively supports decorators and leaves them unlowered. This
  // has to be fixed (via `useDefineForClassFields: false`) *without*
  // reaching for `experimentalDecorators: true` as a workaround — doing
  // that would corrupt exactly the semantics this test checks.
  it('preserves standard decorator semantics at target ESNext too', async () => {
    const plugin = angularVitestSourcemapPlugin(
      () => undefined,
      () => ({ target: ts.ScriptTarget.ESNext, experimentalDecorators: false }),
    );

    const standardDecoratorSource = `
let capturedKind;
function track(value, context) {
  capturedKind = context.kind;
  return value;
}
@track
class Widget {}
globalThis.__capturedKindESNext = capturedKind;
`;

    const result = await (plugin.transform as any)(
      standardDecoratorSource,
      '/project/src/widget.ts',
    );

    expect(result?.code).toBeDefined();
    await assertParsesAsCoverageWould(result.code);
    expect(result.code).not.toContain('@track');

    (globalThis as any).__capturedKindESNext = undefined;
    try {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      new Function(result.code)();
      expect((globalThis as any).__capturedKindESNext).toBe('class');
    } finally {
      delete (globalThis as any).__capturedKindESNext;
    }
  });

  // Regression: forcing `useDefineForClassFields: false` to fix the
  // ESNext case above would have been wrong — it changes a class field's
  // "define" semantics into "assign", observable the moment a subclass
  // field shares a name with an inherited accessor: under "define" the
  // field becomes its own property, bypassing the accessor entirely (the
  // setter below must never run); under "assign" it would invoke it.
  // Retrying with only `target` lowered to ES2022 must never trip this.
  it('preserves class field "define" semantics at target ESNext (no inherited setter call)', async () => {
    const plugin = angularVitestSourcemapPlugin(
      () => undefined,
      () => ({ target: ts.ScriptTarget.ESNext, experimentalDecorators: false }),
    );

    const inheritedSetterSource = `
globalThis.__setterCalls = 0;
class Base {
  set x(v) { globalThis.__setterCalls++; this._x = v; }
  get x() { return this._x; }
}
function track(value, context) { return value; }
@track
class Widget extends Base {
  x = 1;
}
new Widget();
`;

    const result = await (plugin.transform as any)(
      inheritedSetterSource,
      '/project/src/widget.ts',
    );

    expect(result?.code).toBeDefined();
    await assertParsesAsCoverageWould(result.code);

    (globalThis as any).__setterCalls = 0;
    try {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      new Function(result.code)();
      expect((globalThis as any).__setterCalls).toBe(0);
    } finally {
      delete (globalThis as any).__setterCalls;
    }
  });

  // Regression: `ts.transpileModule` transpiles one file in isolation, with
  // no Program/host context — so `module: 'nodenext'`/`'node16'` (which
  // normally also consults the nearest `package.json` to decide ESM vs.
  // CommonJS per file) falls back to CommonJS for an ordinary `.ts` id,
  // emitting `exports.X = ...`. Every consumer of this output is Vite's
  // own ESM pipeline, so that `exports` assignment is not a real ESM
  // export at all — parsing it fine isn't enough to catch this; the
  // export has to actually work when the file is loaded as a real module.
  it('always emits ESM output, never falling back to CommonJS for module: NodeNext', async () => {
    const plugin = angularVitestSourcemapPlugin(
      () => undefined,
      () => ({
        target: ts.ScriptTarget.ES2022,
        experimentalDecorators: true,
        module: ts.ModuleKind.NodeNext,
      }),
    );

    // Self-contained (no `@angular/core` import) so the output can be
    // loaded directly as a real ES module below.
    const selfContainedDecoratedSource = `
function track(value, context) { return value; }
@track
export class Widget {
  value = 42;
}
`;

    const result = await (plugin.transform as any)(
      selfContainedDecoratedSource,
      '/project/src/widget.ts',
    );

    expect(result?.code).toBeDefined();
    await assertParsesAsCoverageWould(result.code);
    expect(result.code).not.toContain('Object.defineProperty(exports');
    expect(result.code).not.toContain('exports.Widget');
    expect(result.code).toContain('export');

    const dataUrl = `data:text/javascript;base64,${Buffer.from(result.code).toString('base64')}`;
    const mod = await import(/* @vite-ignore */ dataUrl);
    expect(new mod.Widget().value).toBe(42);
  });

  it('skips files Angular already compiled (getInMap returns a map)', async () => {
    const plugin = angularVitestSourcemapPlugin(() => '{"version":3}');

    const result = await (plugin.transform as any)(
      decoratedSource,
      '/project/src/tested.component.ts',
    );

    expect(result).toBeUndefined();
  });
});

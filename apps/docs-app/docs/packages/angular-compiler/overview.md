---
title: 'Analog Compiler'
description: 'Single-pass, experimental Analog compiler for Angular components, directives, pipes, and modules.'
---

# Analog Compiler

The Analog Compiler (`@analogjs/angular-compiler`) is an experimental, single-pass compiler for Angular components, directives, pipes, modules, and services. It runs as a Vite plugin and replaces the default `ngc` + Angular Vite plugin emit pipeline with a single transform that emits Ivy instructions directly. Compilation happens once per file as Vite serves or builds it — no separate compiler invocation, no two-stage emit.

:::warning Experimental

The Analog Compiler is opt-in via `experimental.useAnalogCompiler: true` and is **continually being improved**. It currently passes ~91% of Angular's official conformance suite. Output, flag names, and behavior may change between minor releases.

**The Analog Compiler does not type-check your code.** Run `ngc -p tsconfig.app.json --noEmit` as part of your build script (see below) to keep TypeScript and template type safety. Without this step, type errors will reach runtime.

Library publishing via `analogCompilationMode: 'partial'` is newer than full mode and has had less production exposure. Bug reports welcome at [github.com/analogjs/analog/issues](https://github.com/analogjs/analog/issues).

:::

## Compatibility

| Angular version | Status                                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------- |
| **17.3.12**     | Supported (LTS patch). Components that use `@defer` at runtime are **not** supported on v17 — see note below. |
| **18.2.14**     | Supported (LTS patch).                                                                                        |
| **19.0.0+**     | Supported.                                                                                                    |
| **20.0.0+**     | Supported.                                                                                                    |
| **21.0.0+**     | Supported.                                                                                                    |
| **22 (`next`)** | Tracked, allowed-to-fail. Used as early warning when the next major lands a breaking change.                  |

The compatibility matrix in [`.github/workflows/angular-compiler-compat.yml`](https://github.com/analogjs/analog/blob/beta/.github/workflows/angular-compiler-compat.yml) installs each version above via `pnpm.overrides` and runs the full `@analogjs/angular-compiler` test suite against it on every relevant pull request. Failures auto-open or comment on a tracking issue when they happen on `beta`.

**Angular 17 `@defer` caveat:** Angular 17's `@defer` runtime ABI requires populated `meta.deferBlocks` and `meta.deferrableTypes` Maps that the Analog Compiler currently sets to empty (sufficient for components that don't use `@defer`). Components that use `@defer` blocks at runtime should upgrade to Angular 18+ — the v18+ ABI is compatible.

## Enabling it (apps)

Enable the compiler in `vite.config.ts` by setting `useAnalogCompiler: true` inside the `analog()` plugin's `vite.experimental` block:

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';

export default defineConfig({
  plugins: [
    analog({
      vite: {
        experimental: {
          useAnalogCompiler: true,
        },
      },
    }),
  ],
});
```

The flag is forwarded by `@analogjs/platform` to `@analogjs/vite-plugin-angular`, where it is defined.

Then add a type-check step to your `build` script. Because the Analog Compiler does not type-check, this step is required to keep TypeScript and template safety:

```json
// package.json
{
  "scripts": {
    "build": "ngc -p tsconfig.app.json --noEmit && vite build"
  }
}
```

Use `ngc` (not `tsc --noEmit`) because it validates Angular template bindings, signal inputs, and host bindings — the parts of an Angular app that plain TypeScript cannot see.

The reference implementation lives in [`apps/analog-app/vite.config.ts`](https://github.com/analogjs/analog/blob/beta/apps/analog-app/vite.config.ts) — the example app uses the Analog Compiler in production builds.

## Library publishing (`partial` mode)

For libraries that need to publish reusable Angular packages (FESM bundles consumed by other Angular projects), set `analogCompilationMode: 'partial'`:

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';

export default defineConfig({
  plugins: [
    angular({
      experimental: {
        useAnalogCompiler: true,
        analogCompilationMode: 'partial',
      },
    }),
  ],
});
```

Partial mode emits `ɵɵngDeclareComponent` / `ɵɵngDeclareDirective` / `ɵɵngDeclarePipe` / `ɵɵngDeclareNgModule` / `ɵɵngDeclareInjectable` calls instead of final Ivy definitions. The downstream consumer's Angular linker resolves these declarations at consumer-build time — the contract Angular libraries use to stay forward-compatible across Angular versions.

The default is `'full'`, which emits final Ivy definitions for application builds.

## How it works

The Analog Compiler is built around three ideas: an OXC-based Rust parser for fast TypeScript AST traversal, a registry-based cross-file resolution layer that scans `.ts` and `.d.ts` files for component / directive / pipe metadata, and a `MagicString`-based emitter that performs surgical edits on the source rather than re-printing the whole file. Compilation runs in a single pass per file with no separate type-checking step — which is why the `ngc` step above is required.

For the architecture deep-dive — source file inventory, compilation pipeline, conformance test results, and contributor guide — see [`COMPILER.md`](https://github.com/analogjs/analog/blob/beta/packages/angular-compiler/COMPILER.md) in the package source.

## Limitations

The Analog Compiler currently passes ~91% of Angular's official conformance suite. The remaining gaps are mostly output formatting differences (named-vs-anonymous template functions, slight differences in `@defer` multi-file dependency emission) rather than functional bugs, but unusual code shapes can hit them. The current per-Angular-version pass rates are:

| Angular version    | Pass rate | Tests |
| ------------------ | --------- | ----- |
| v17 (latest patch) | 93.2%     | 120   |
| v18 (latest patch) | 82.9%     | 143   |
| v19 (latest patch) | 83.5%     | 151   |
| v20 (latest patch) | 91.5%     | 155   |
| v21 (latest patch) | 91.8%     | 160   |

For the current list of known issues, see [open issues on GitHub](https://github.com/analogjs/analog/issues).

## Debugging

The Analog Compiler emits structured debug output via the [`obug`](https://github.com/sxzz/obug) library, activated by the standard `DEBUG` environment variable:

```bash
# Top-level compile events (per-file start, end, timing, fatal errors)
DEBUG=analog-compiler npm run build

# Everything (compile + registry + resolve + emit)
DEBUG='analog-compiler*' npm run build

# Just the registry-scanning trace
DEBUG=analog-compiler:registry npm run build
```

Available namespaces:

| Namespace                  | What it traces                                                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `analog-compiler`          | Per-file compile start/end with timing, class counts, and resource-dependency counts. Also surfaces fatal errors that would otherwise be silently caught.          |
| `analog-compiler:registry` | Source-file and `.d.ts` scanning, barrel re-export resolution, candidate-file failures. Use this when a directive or pipe is not being recognized as a dependency. |
| `analog-compiler:resolve`  | Cross-file dependency resolution decisions: how `imports: [...]` entries are resolved to underlying directives, NgModule export expansion, tuple barrel expansion. |
| `analog-compiler:emit`     | Code emission and helper hoisting decisions, type-only import elision.                                                                                             |

When `DEBUG` matches an `analog-compiler` namespace, the compiler also surfaces previously-swallowed errors — failed barrel-export lookups, unparseable workspace files, inline-style preprocessing failures, and `compileClassMetadata` failures. These are silent in normal operation to avoid noise, but turning them on is the fastest way to find out why your component is not being recognized as a directive.

## Reporting bugs

Bug reports are welcome at [github.com/analogjs/analog/issues](https://github.com/analogjs/analog/issues). To make a bug actionable, please include:

- The smallest input file that reproduces the issue
- The Analog Compiler's output (available via `vite-plugin-inspect` or by saving the post-transform code from a debug step)
- The Analog Compiler debug log: `DEBUG='analog-compiler*' npm run build > debug.log 2>&1`
- The diff against `ngc`'s output for the same input, when you can produce one

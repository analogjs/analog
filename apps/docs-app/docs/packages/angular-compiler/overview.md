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

## Reporting bugs

Bug reports are welcome at [github.com/analogjs/analog/issues](https://github.com/analogjs/analog/issues). To make a bug actionable, please include:

- The smallest input file that reproduces the issue
- The Analog Compiler's output (the contents of the failing file after compilation, available via `vite-plugin-inspect` or by adding a debug step)
- The diff against `ngc`'s output for the same input, when you can produce one

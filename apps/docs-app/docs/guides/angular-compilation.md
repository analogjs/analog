# Angular Compilation

Analog compiles your Angular components, directives, and pipes to Ivy definitions during the Vite build. There are two compilation paths:

- **Default compilation** — Angular's own compiler (`ngtsc`), with full compile-time type checking.
- **OXC-based engine** — a native Rust compiler that produces the same Ivy output much faster.

Both emit identical Ivy code and identical runtime behavior, because both ultimately call the same `@angular/compiler` lowering APIs.

## Default compilation

This is what you get out of the box — no configuration required:

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';

export default defineConfig({
  plugins: [angular()],
});
```

The default path runs Angular's compiler through the Angular Compilation API. It performs **full TypeScript and template type checking** (including `strictTemplates`), emits declaration files, and supports i18n message extraction. Use it when you want compile-time safety — wrong template bindings, missing inputs, and type mismatches fail the build.

## OXC-based engine

The OXC-based engine swaps Angular's compiler for [`@oxc-angular/vite`](https://github.com/voidzero-dev/oxc-angular-compiler) — the **OXC Angular compiler**, a native Rust port of Angular's component compiler. It produces equivalent Ivy output and reduces cold-build and hot-rebuild times, since it never constructs a full `ts.Program`.

### Enabling

`@oxc-angular/vite` is an optional peer dependency — install it alongside Analog:

```bash
npm install -D @oxc-angular/vite
```

Then opt in via the `angular()` plugin:

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';

export default defineConfig({
  plugins: [
    angular({
      fastCompile: true,
      fastCompileEngine: 'oxc',
    }),
  ],
});
```

:::note
In an Analog application, configure the plugin through `@analogjs/platform` instead — its `analog()` plugin forwards the same `fastCompile` and `fastCompileEngine` options:

```ts
import analog from '@analogjs/platform';

export default defineConfig({
  plugins: [analog({ fastCompile: true, fastCompileEngine: 'oxc' })],
});
```

:::

You can also enable the engine without editing your config by setting the `ANALOG_OXC=true` environment variable — useful for trying it in CI. An explicit `fastCompileEngine` in your config takes precedence.

### What it supports

| Capability                                   | OXC-based engine                                                       |
| -------------------------------------------- | ---------------------------------------------------------------------- |
| AOT compilation (`ɵɵdefineComponent`)        | ✅ Native Rust pipeline                                                |
| JIT compilation                              | ✅                                                                     |
| Inline `template:` / `styles:`               | ✅ Inline SCSS / Sass / Less is preprocessed before compilation        |
| External `templateUrl` / `styleUrl`          | ✅ Resolved and preprocessed via Vite                                  |
| Hot Module Replacement (HMR)                 | ✅                                                                     |
| Style encapsulation                          | ✅                                                                     |
| Cross-file selector resolution               | ✅                                                                     |
| Library / partial builds (`compilationMode`) | ✅ Emits partial declarations and Ivy `.d.ts` type members (see below) |
| Compile-time template type checking          | ❌ Use the Angular Language Service in your editor                     |

### Building a library

For a library build (`fastCompileMode: 'partial'`), the OXC engine emits the partial `ɵɵngDeclare*` declarations and augments the emitted `.d.ts` with Angular's Ivy type members (`ɵfac`, `ɵcmp`, …) so consumers get full template type-checking against your published package.

The base `.d.ts` files themselves must be produced by a declaration generator (`rolldown-plugin-dts`, `vite-plugin-dts`, `tsdown`, or `tsc`); the OXC engine augments those declarations rather than generating them. See [Building an Angular library](/docs/guides/libraries).

## Type checking

The OXC engine does not type-check your templates or TypeScript. To catch those errors, run Angular's compiler as a separate verification step against your app's tsconfig. Pass `--noEmit` so it only reports errors without writing output:

```bash
ngc -p tsconfig.app.json --noEmit
```

Add it as a script and run it alongside your build:

```json
// package.json
{
  "scripts": {
    "typecheck": "ngc -p tsconfig.app.json --noEmit"
  }
}
```

This keeps fast builds during development while still failing on template and type errors before you ship — and the Angular Language Service surfaces the same errors live in your editor.

## Compatibility

### Angular versions

The OXC Angular compiler supports **Angular 19–22**.

| Angular Version | OXC-based engine |
| --------------- | ---------------- |
| ^22.0.0         | ✅               |
| ^21.0.0         | ✅               |
| ^20.0.0         | ✅               |
| ^19.0.0         | ✅               |

For overall Angular/Analog/Vite version support, see [Version Compatibility](/docs/guides/compatibility).

### Compiler package

| Analog Version | `@oxc-angular/vite` |
| -------------- | ------------------- |
| **latest**     | ^0.0.31             |

### Default vs OXC-based engine

|                                     | Default                 | OXC-based engine                           |
| ----------------------------------- | ----------------------- | ------------------------------------------ |
| Engine                              | Angular (`ngtsc`)       | Native Rust (`@oxc-angular/vite`)          |
| Ivy output                          | Full                    | Identical                                  |
| Cold build / hot rebuild            | Standard                | Significantly faster                       |
| Compile-time template type checking | Yes (`strictTemplates`) | No — use the Angular Language Service      |
| i18n message extraction             | Yes                     | `$localize` emitted (extraction not wired) |
| Library / partial + `.d.ts`         | Yes                     | Yes (`.d.ts` augmented)                    |
| Status                              | Stable                  | Experimental                               |

## Caveat

:::caution
The OXC Angular compiler is **experimental** and trades compile-time safety for speed.

- **No compile-time template type checking.** The OXC engine emits identical Ivy output and identical runtime behavior, but it does not validate template bindings, inputs, or types at build time. Run the **Angular Language Service** in your editor to catch these errors as you type — they appear as editor squiggles instead of failing the build.
- **Optional peer dependency.** The engine requires `@oxc-angular/vite` to be installed. If it is missing, enabling `fastCompileEngine: 'oxc'` throws a clear error at startup.

If you need template type errors to fail your build (for example in CI), add the [type-checking step](#type-checking) or use the default compilation path.
:::

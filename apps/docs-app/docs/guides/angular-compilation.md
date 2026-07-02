# Angular Compilation

The AnalogJS Vite Plugin (`@analogjs/vite-plugin-angular`) compiles your Angular components, directives, and pipes to Ivy definitions during the Vite build. It provides two compilation paths:

- **Default compilation** — Angular's own compiler (`ngtsc`), with full compile-time type checking.
- **Fast compile** — an in-tree single-pass compiler that produces the same Ivy output much faster.

Both emit identical Ivy code and identical runtime behavior, because both ultimately call the same `@angular/compiler` lowering APIs.

:::tip
For background on why compilation, type-checking, and build times are in tension, read [Angular Compilation, Type-Checking, and Build Bottlenecks](https://dev.to/brandontroberts/angular-compilation-type-checking-and-build-bottlenecks-4n2f).
:::

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

## Fast compile

Fast compile swaps Angular's compiler for an in-tree, single-pass transform. Instead of constructing a full `ts.Program`, it extracts each file's decorator metadata and generates Ivy definitions directly through `@angular/compiler`'s lowering APIs. It produces equivalent Ivy output and reduces cold-build and hot-rebuild times.

### Enabling

Opt in via the `angular()` plugin:

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';

export default defineConfig({
  plugins: [
    angular({
      fastCompile: true,
    }),
  ],
});
```

:::note
In an Analog application, configure the plugin through `@analogjs/platform` instead — its `analog()` plugin forwards the same `fastCompile` option:

```ts
import analog from '@analogjs/platform';

export default defineConfig({
  plugins: [analog({ fastCompile: true })],
});
```

:::

### What it supports

| Capability                                   | Fast compile                                                    |
| -------------------------------------------- | --------------------------------------------------------------- |
| AOT compilation (`ɵɵdefineComponent`)        | ✅                                                              |
| JIT compilation                              | ✅                                                              |
| Inline `template:` / `styles:`               | ✅ Inline SCSS / Sass / Less is preprocessed before compilation |
| External `templateUrl` / `styleUrl`          | ✅ Resolved and preprocessed via Vite                           |
| Hot Module Replacement (HMR)                 | ✅                                                              |
| Style encapsulation                          | ✅                                                              |
| Cross-file selector resolution               | ✅ Via an in-tree component registry                            |
| Library / partial builds (`fastCompileMode`) | ✅ Emits partial declarations for library publishing            |
| Compile-time template type checking          | ❌ Use the Angular Language Service in your editor              |

### Building a library

For a library build, set `fastCompileMode: 'partial'` so the compiler emits partial `ɵɵngDeclare*` declarations instead of final Ivy definitions:

```ts
angular({
  fastCompile: true,
  fastCompileMode: 'partial',
});
```

See [Building an Angular library](/docs/guides/libraries) for the full library workflow.

## Type checking

Fast compile does not type-check your templates or TypeScript. To catch those errors, run Angular's compiler as a separate verification step against your app's tsconfig. Pass `--noEmit` so it only reports errors without writing output:

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

### Nx workspaces

In an Nx workspace, [`angular-typechecker`](https://www.npmjs.com/package/angular-typechecker) provides an Nx executor that runs the complete Angular type-check — TypeScript checks plus template type-checking and extended `NG8xxx` diagnostics — with no emit, decoupled from build and test, and cacheable per project.

Install it:

```bash
npm install --save-dev angular-typechecker
```

Then add an `angular-typecheck` target to the project you want to check:

```jsonc
// apps/my-app/project.json
{
  "targets": {
    "angular-typecheck": {
      "executor": "angular-typechecker:angular-typecheck",
      "options": {
        "tsConfig": "apps/my-app/tsconfig.app.json",
        "includeDeps": true,
      },
    },
  },
}
```

Run it:

```bash
nx run my-app:angular-typecheck
```

## Compatibility

### Angular versions

Fast compile is validated against Angular `17`, `18`, `19`, `20`, `21`, `22`, and `next` on every PR. Components that use `@defer` at runtime require Angular 18+.

For overall Angular/Analog/Vite version support, see [Version Compatibility](/docs/guides/compatibility).

### Default vs fast compile

|                                     | Default                 | Fast compile                          |
| ----------------------------------- | ----------------------- | ------------------------------------- |
| Ivy output                          | Full                    | Identical                             |
| Cold build / hot rebuild            | Standard                | Significantly faster                  |
| Compile-time template type checking | Yes (`strictTemplates`) | No — use the Angular Language Service |
| i18n message extraction             | Yes                     | `$localize` emitted                   |
| Library / partial builds            | Yes                     | Yes (`fastCompileMode: 'partial'`)    |

## Trade-offs

:::caution
Fast compile trades compile-time safety for speed.

**No compile-time template type checking.** Fast compile emits identical Ivy output and identical runtime behavior, but it does not validate template bindings, inputs, or types at build time. Run the **Angular Language Service** in your editor to catch these errors as you type — they appear as editor squiggles instead of failing the build.

If you need template type errors to fail your build (for example in CI), add the [type-checking step](#type-checking) or use the default compilation path.
:::

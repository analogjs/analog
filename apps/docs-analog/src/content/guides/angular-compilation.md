# Angular Compilation

The AnalogJS Vite Plugin (`@analogjs/vite-plugin-angular`) compiles your Angular components, directives, and pipes to Ivy definitions during the Vite build. It provides these compilation paths:

- **Default compilation**: Angular's own compiler (`NgtscProgram`), with optional compile-time type checking.
- **Fast compile**: an in-tree single-pass compiler that produces the same Ivy output much faster.
- **Experimental Compilation API**: Angular's build compilation API, enabled explicitly with a compatible `@angular/build` installation.

Both emit identical Ivy code and identical runtime behavior, because both ultimately call the same `@angular/compiler` lowering APIs.

:::tip
For background on why compilation, type-checking, and build times are in tension, read [Angular Compilation, Type-Checking, and Build Bottlenecks](https://dev.to/brandontroberts/angular-compilation-type-checking-and-build-bottlenecks-4n2f).
:::

## Default compilation

This is what you get out of the box with no configuration required:

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';

export default defineConfig({
  plugins: [angular()],
});
```

The default path uses `NgtscProgram`; `experimental.useAngularCompilationAPI` defaults to `false`. Set `disableTypeChecking: false` and enable `strictTemplates` in your Angular compiler options when TypeScript and template errors must fail the build. Type checking is disabled by default for build throughput.

```ts
angular({ disableTypeChecking: false });
```

## Experimental Compilation API

With an `@angular/build` version that exposes `createAngularCompilation` through `@angular/build/private`, opt into Angular's build compilation API:

```ts
angular({
  experimental: { useAngularCompilationAPI: true },
  disableTypeChecking: false,
  include: ['src/integrations/**/*.ts'],
});
```

Configured TypeScript roots, integration-provided includes, and expanded project roots are combined before compilation. The normal compiler also includes file-replacement targets, so replacement components outside the original tsconfig are AOT-compiled instead of falling through to a generic TypeScript transform.

The Angular version alone does not establish availability: for example, `@angular/build@20.1.0` does not expose this factory. Unsupported installations fail during configuration with an actionable diagnostic. Leave the option disabled to use normal compilation on those versions.

For Vite library builds, the experimental API emits JavaScript only. Generate `.d.ts` files in a separate declaration step. Angular's compilation API returns one result per source file, so enabling declaration emit there would overwrite the JavaScript result with declaration text. The repository's package builds use their own declaration-emission step.

Both paths wait for active compilation before transforming emitted modules. Experimental compilation shares its emitted modules with the HMR middleware; template-only changes invalidate the affected component and deliver Angular's replacement metadata. Compiler shutdown waits for active work before disposing its worker. Plugin setup and stylesheet errors preserve the original exception as `cause` together with the plugin/file context.

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
In an Analog v3 application, configure compilation on `angular()` alongside the platform plugin:

```ts
import analog from '@analogjs/platform';
import angular from '@analogjs/vite-plugin-angular';
import { nitro } from 'nitro/vite';

export default defineConfig({
  plugins: [analog(), angular({ fastCompile: true }), nitro()],
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

This keeps fast builds during development while still failing on template and type errors before you ship, and the Angular Language Service surfaces the same errors live in your editor.

### Nx workspaces

In an Nx workspace, [`angular-typechecker`](https://www.npmjs.com/package/angular-typechecker) provides an Nx executor that runs the complete Angular type-check: TypeScript checks, template type-checking, and the extended `NG8xxx` diagnostics. It emits nothing and runs separately from your build and tests. Nx caches the result per project.

Add it with `nx add`, which installs the package and runs its `angular-typechecker:init` generator to seed a cacheable `angular-typechecker:typecheck` entry in `nx.json` under `targetDefaults`:

```bash
nx add angular-typechecker
```

Then wire a `typecheck` target into the project you want to check:

```bash
nx g angular-typechecker:configuration my-app
```

Run it:

```bash
nx typecheck my-app
```

The generator writes this target. Add `includeDeps: true` to also report diagnostics from dependencies:

```jsonc
// apps/my-app/project.json
{
  "targets": {
    "typecheck": {
      "executor": "angular-typechecker:typecheck",
      "options": {
        "tsConfig": "apps/my-app/tsconfig.json",
        "includeDeps": true,
      },
    },
  },
}
```

## Compatibility

### Angular versions

Fast compile is validated against Angular `17`, `18`, `19`, `20`, `21`, `22`, and `next` on every PR. Components that use `@defer` at runtime require Angular 18+.

For overall Angular/Analog/Vite version support, see [Version Compatibility](/docs/guides/compatibility).

### Compiler contributor checks

The compiler compatibility workflow separates compiler API tests from installed-package consumer builds. The consumer matrix uses Angular 17.3, 18.2, 19.0, 20.0, and 20.1 with Vite 6; Angular 21 with Vite 7; and Angular 22 with Vite 6, 7, and 8. It is a representative matrix, not every possible cross-product. The experimental path is checked when the installed build package exposes it; other tuples verify the explicit rejection as well as normal and fast compilation.

Run one tuple from the repository root:

```bash
pnpm exec nx run vite-plugin-angular:compat-smoke --vite=8.0.8 --angular=22.0.0
```

The target builds and packs the package, installs it into an isolated consumer, and checks normal compilation, additional roots/replacements, and fast full/partial compilation. It also checks experimental Compilation API output on supported Angular versions. Angular 22 tuples additionally use Chromium to verify template HMR preserves component state in both compiler modes, and that boot/manual reload works with Angular HMR disabled. Each run retains its exact installed versions, lockfile, and result under `dist/compiler-vite-smoke/`.

### Default vs fast compile

|                                     | Default                                                        | Fast compile                          |
| ----------------------------------- | -------------------------------------------------------------- | ------------------------------------- |
| Ivy output                          | Full                                                           | Identical                             |
| Cold build / hot rebuild            | Standard                                                       | Significantly faster                  |
| Compile-time template type checking | Opt in with `disableTypeChecking: false` and `strictTemplates` | No (use the Angular Language Service) |
| i18n message extraction             | Yes                                                            | `$localize` emitted                   |
| Library / partial builds            | Yes                                                            | Yes (`fastCompileMode: 'partial'`)    |

## Trade-offs

:::caution
Fast compile trades compile-time safety for speed.

**No compile-time template type checking.** Fast compile emits identical Ivy output and identical runtime behavior, but it does not validate template bindings, inputs, or types at build time. Run the **Angular Language Service** in your editor to catch these errors as you type; they appear as editor squiggles instead of failing the build.

If you need template type errors to fail your build (for example in CI), add the [type-checking step](#type-checking) or use the default compilation path.
:::

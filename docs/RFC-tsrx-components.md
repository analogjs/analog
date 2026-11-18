# RFC: TSRX Components for Angular

**Status:** Implemented, experimental (feat/tsrx-angular branch)
**Author:** Brandon Roberts
**Date:** 2026-11-17
**Packages:** @analogjs/tsrx-angular (new, private), @analogjs/vite-plugin-angular, @analogjs/platform, @analogjs/router

---

## Summary

Write Angular components as [TSRX](https://tsrx.dev) (TypeScript Render
Extensions) modules: a component is a function whose body holds its setup code
and ends in markup.

```tsrx
import { Component, input, signal } from '@angular/core';

export const CounterMeta = { selector: 'app-counter' } satisfies Component;

export function Counter() @{
  const step = input(1);
  const count = signal(0);
  <button onClick={() => count.update((c) => c + step())}>{count()}</button>
}
```

A new Vite plugin, `@analogjs/tsrx-angular`, lowers each `.tsrx` module to
an ordinary `@Component` class and hands it to the fast compile path of
`@analogjs/vite-plugin-angular`. The Angular compiler then analyzes,
type-checks, and generates code for it like any other component. `.tsrx` files
work as components, layouts, and `@analogjs/router` pages (`.page.tsrx`), and
the plugin writes TypeScript declarations for them so `tsc` and editors can
type-check imports of them.

```ts
// vite.config.ts
plugins: [analog(), tsrx(), angular({ fastCompile: true })];
```

## Motivation

- **One scope for logic and markup.** Template expressions are plain
  TypeScript closures over the component body, so local constants, helper
  functions, and imports are usable in markup without being promoted to class
  members. There is no separate template language to learn and no `this`.
- **Single-file components without strings.** The template is real syntax, not
  a string literal or a separate `.html` file, so it gets parsed,
  syntax-highlighted, and source-mapped as code.
- **Still Angular.** The output is a standard decorated class: signals,
  `input()`/`output()`/`model()`, DI, providers, host bindings, control flow,
  `@defer`, hydration, and SSR all behave as they do for hand-written
  components. TSRX components and `.ts` components import each other freely.
- **A test of the fast compile path's extensibility.** Supporting another
  source format exercises the fast compiler as a general Angular backend, and
  the `api.fastCompile` hooks added for it are format-agnostic.

## Design

### Lowering

Each top-level `function Name() @{ … }` becomes a class. Member APIs
(`input`, `model`, `output`, `viewChild`, `viewChildren`, `contentChild`,
`contentChildren`) declared at the top of the body become class fields. The rest
of the body runs once per instance inside a field initializer, and every
dynamic template expression becomes a closure there. The generated template
only calls those closures through `$fc`:

```ts
@Component({
  selector: 'app-counter',
  template: '<button (click)="$fc.b0($event)">{{ $fc.b1() }}</button>',
  changeDetection: ɵngChangeDetectionStrategy.OnPush,
})
export class Counter {
  readonly step = input(1);
  /** @internal */ protected readonly $fc = (() => {
    const step = this.step;
    const count = signal(0);
    const ɵb0 = ($event: any) =>
      ((() => count.update((c) => c + step())) as (e: any) => unknown)($event);
    const ɵb1 = () => count();
    return { b0: ɵb0, b1: ɵb1 };
  })();
}
```

Template-local variables (`@for` items and indexes, `@catch` parameters) are
passed to the closures as arguments, so TypeScript's scoping rules never reach
Angular's template pipeline. Components are `OnPush`. Code outside component
declarations is copied verbatim, so line numbers before the first component are
unchanged.

### Templates

| TSRX                                                  | Angular                                         |
| ----------------------------------------------------- | ----------------------------------------------- |
| `{expr}`                                              | `{{ $fc.bN() }}`                                |
| `attr={expr}`, `{value}` shorthand                    | `[attr]="…"`                                    |
| `onClick={fn}` (elements)                             | `(click)="…"`                                   |
| `onValueChange={fn}` (components)                     | `(valueChange)="…"`, output casing kept         |
| `on:name={fn}`                                        | `(name)="…"`, name as written                   |
| `bind:prop={signal}`                                  | `[(prop)]="…"`                                  |
| `attr:`, `class:`, `style:`                           | `[attr.x]`, `[class.x]`, `[style.x]`            |
| `ref="name"`                                          | `#name`, queried with `viewChild()`             |
| `use={[RouterLink, Tooltip]}`                         | adds the directives to `imports`                |
| `<Child />`                                           | the child's selector, added to `imports`        |
| `<style>` (`:global(x)`)                              | component `styles` (`::ng-deep x`)              |
| `@if` / `@else if` / `@else`                          | the same                                        |
| `@for (const x of xs; key x.id)` / `@empty`           | `@for (…; track …)`; `track $index` without key |
| `@switch` / `@case` / `@default`                      | the same                                        |
| `@try` / `@catch (err, reset)`                        | `@boundary` / `@error`                          |
| `@boundary` / `@error (let err; when …)`              | the same; `when` conditions bound               |
| `@defer (…)` / `@placeholder` / `@loading` / `@error` | the same; triggers and `when` conditions bound  |

`@defer` is written in Angular's own syntax instead of as a tag, because its
triggers (`on interaction(ref)`, `hydrate on viewport`, `when cond()`) are
Angular concepts and a tag would need its own mini-language for them.

`@boundary` is also written as-is, alongside TSRX's `@try`/`@catch`, so the
Angular form's extras are available: several `@error` blocks, `when`
conditions that read the error (`@error (let err; when isNotFound(err))`), and
`$error`/`$reset` without `let`. `@error` variables reach the block's bindings
as typed parameters (`unknown` and `() => void`), and a `when` condition
becomes a binding that receives the error.

TSRX's parser has no syntax for either block, so it reads them as text followed
by expression containers; the lowering recognizes that sequence and rebuilds
the Angular block. An `@error`, `@placeholder` or `@loading` that doesn't
follow its block, or a block without markup, is an error rather than literal
text. Like TSRX's `@if` and `@for`, each block renders a single node; a parse
error inside one says to wrap multiple nodes in a fragment `<>…</>`.

### Content projection

TSRX components take no parameters, so there is no `children` prop; they
project with Angular's `<ng-content>`, which the lowering passes through
unchanged, along with `select`, fallback content, and `ngProjectAs`. Children
written inside a component tag are projected as usual, and they bind to the
parent's state, since their closures live in the parent:

```tsrx
export function Card() @{
  const title = contentChild<ElementRef>('title');
  <article>
    <header><ng-content select="[card-title]" /></header>
    <ng-content />
    <ng-content select="[card-footer]">{'No footer given.'}</ng-content>
  </article>
}

// In another component:
<Card>
  <h2 card-title ref="title">{'Title'}</h2>
  <p>{'Clicked '}{clicks()}{' times.'}</p>
</Card>
```

`contentChild()` and `contentChildren()` query projected content, including
template refs set with `ref` in the parent. Projection works in both
directions with `.ts` components.

### Component metadata: `XMeta`

`export const XMeta = { … }` carries `@Component` metadata for component `X` in
the same file (`selector`, `providers`, `host`, `encapsulation`, …). It must be
a static object literal, optionally with `satisfies Component`. Fields the
lowering derives (`template`, `templateUrl`, `imports`, `styles`,
`changeDetection`) are rejected. Only PascalCase prefixes count, so Analog's
`routeMeta` passes through untouched. Host expressions run against the
instance, so locals they reference are exposed as `@internal` fields.

### Selectors

Without an `XMeta` selector, a component's selector is its name, matching how
it is written as a tag (`<Price />` → `<Price>`). Names that are native
elements once lowercased (`Button`, `A`, `Input`) are errors, since
`document.createElement` would produce the native element; they need an
`XMeta` selector.

Tags for imported components resolve through the fast compiler's component
registry, which now scans `.tsrx` modules and packages' `.d.ts` declarations on
demand. Class and attribute selectors (`button[matButton]`, `.chip[role=option]`)
are expanded with Angular's own `CssSelector` parser.

### Fast compile API

`@analogjs/vite-plugin-angular` exposes `api.fastCompile` on its fast compile
plugin, found with `findFastCompileApi(config.plugins)`:

- `registerSourceFormat({ name, test, toScanSource })`: registry scans and HMR
  treat modules of the format as compiled sources, reading them through
  `toScanSource`.
- `scanImports(specifiers, importer, resolve)`: scans relative imports from
  source and packages from their `.d.ts` declarations.
- `resolveSelector(className)`: the element selector of a known component or
  directive.
- `compile(code, id, { resolve, mapToSource })`: compiles lowered TypeScript
  and records the remapped source map.

Nothing in the API is TSRX-specific.

### Routing

`.page.tsrx` files are route files everywhere `.page.ts` files are: app-local
and `additionalPagesDirs` discovery, the route manifest and typed routes, the
router's path derivation, layouts (`products.page.tsrx` with
`products/index.page.tsrx`), and `.server.ts` loads and form actions beside the
page.

### Types

TypeScript can't read `.tsrx` files, so the plugin emits declarations for each
one from its lowered code, using the app's tsconfig. Types are inferred as for
any `.ts` file (`input(1)` is an `InputSignal<number>`), and `$fc` and other
lowering internals are dropped with `stripInternal`. The files are written
outside the sources, mirroring them:

```
src/app/components/price.tsrx  →  node_modules/.analog/tsrx-types/src/app/components/price.d.tsrx.ts
```

```ts
export declare class Price {
  readonly amount: import('@angular/core').InputSignal<number>;
}
```

With `allowArbitraryExtensions`, TypeScript looks up `./price.tsrx` as
`./price.d.tsrx.ts`, and `rootDirs` lets it find that file in the output
directory:

```json
{
  "compilerOptions": {
    "allowArbitraryExtensions": true,
    "rootDirs": [".", "node_modules/.analog/tsrx-types"]
  }
}
```

`vite build` writes them once per build. The dev server writes them at startup
and again, in the background, shortly after a `.tsrx` or `.ts` file is added,
changed, or removed. Files that fail to lower keep their previous declarations,
and stale ones are removed. There is no separate CLI: CI type-checks after a
build. `tsrx({ types: false })` turns this off, and
`tsrx({ types: { tsconfig, outDir } })` changes the tsconfig and output
directory. Works with `tsc` and `tsgo`.

### Constraints

- Fast compile only (`angular({ fastCompile: true })`).
- Components take no parameters and can't be `async` or generators; inputs are
  `input()`/`model()`.
- Member APIs become class fields, initialized before the body runs, so their
  initializers (`input(initial)`) can't read names the body declares; such
  values go at module scope.
- Lists use `@for`, not `.map()`. Statements inside template blocks, spread
  attributes, `@for await`, `@pending` and `@finally` are rejected with
  messages saying what to do instead.
- The decorator must be Angular's `Component` under that name; a `type`-only
  import or another binding named `Component` is an error.

## Implementation

### Files Changed

| File                                                                                                                           | Change                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/tsrx-angular/src/lib/lower.ts`                                                                                       | TSRX → `@Component` class lowering: member APIs, `$fc` closures, templates, control flow, `@defer`, `XMeta`, selectors, styles, diagnostics |
| `packages/tsrx-angular/src/lib/source-map.ts`                                                                                  | `MappedText` and `TsrxSourceMap`: map lowered offsets and emitted source maps back to the `.tsrx`                                           |
| `packages/tsrx-angular/src/lib/cache.ts`                                                                                       | Parses each module once across import discovery, registry scans, and compiles                                                               |
| `packages/tsrx-angular/src/lib/plugin.ts`                                                                                      | The `tsrx()` Vite plugin: registers the format, transforms `.tsrx`, writes declarations on build and in dev                                 |
| `packages/tsrx-angular/src/lib/types.ts`                                                                                       | `TsrxTypeGenerator`: emits `.d.tsrx.ts` declarations from lowered code with a virtual compiler host                                         |
| `packages/tsrx-angular/src/index.ts`                                                                                           | Exports `tsrx`, `lowerTsrx`, `defaultSelector`, `TsrxSourceMap`, and option/result types                                                    |
| `packages/vite-plugin-angular/src/lib/fast-compile-api.ts`                                                                     | `FastCompileApi` types and `findFastCompileApi()`                                                                                           |
| `packages/vite-plugin-angular/src/lib/fast-compile-plugin.ts`                                                                  | Registered source formats in scans and HMR, `scanImports` for relative and package imports, `resolveSelector`, `compile`                    |
| `packages/platform/src/lib/{route-file-discovery,route-manifest,router-plugin,typed-routes-plugin,discover-library-routes}.ts` | `.page.tsrx` as route files                                                                                                                 |
| `packages/router/src/lib/route-builder.ts`                                                                                     | Strips `.page.tsrx` when deriving route paths                                                                                               |
| `apps/tsrx-app`                                                                                                                | Demo app where every page, layout, and component is a `.tsrx` file                                                                          |
| `apps/tsrx-app-e2e-playwright`                                                                                                 | End-to-end tests for the demo app                                                                                                           |

Separately merged to `beta`: fast compile now lazy-loads defer-only
dependencies (analogjs/analog#2784, fixing #2785).

### Data Flow

```
tsrx() configResolved
  └─ findFastCompileApi(plugins).registerSourceFormat({ test: *.tsrx, toScanSource })

transform(foo.tsrx)
  ├─ tsrxImportSpecifiers(code)          ← cached @tsrx/core parse
  ├─ fastCompile.scanImports(specs)      → registry: relative sources + package .d.ts
  ├─ lowerTsrxModule(code, { resolveSelector })
  │    └─ @Component classes + $fc closures + MappedText
  ├─ diagnostics? → this.error() at the .tsrx position
  └─ fastCompile.compile(lowered, id, { mapToSource })
       └─ Ivy output, source map remapped to foo.tsrx

registry scan / HMR of foo.tsrx
  └─ toScanSource → cached lowering with placeholder tag selectors

vite build (buildStart, once) / dev server (startup + watcher, debounced)
  └─ TsrxTypeGenerator: lower all .tsrx → virtual foo.tsrx.ts → ts emit (declarations only)
       └─ node_modules/.analog/tsrx-types/**/foo.d.tsrx.ts
```

## Test Coverage

- **`tsrx-angular`**: 62 tests.
  - `lower.spec.ts` (49): class shape; compiling with the fast compiler;
    `@if`/`@for`/`@switch`/`@try`→`@boundary`; native `@boundary` with `let`,
    `$error`, multiple `@error` blocks, and `when` conditions compiled to read
    the caught error; stray and malformed blocks; `<ng-content>` slots,
    fallback content, and content queries compiled to projection
    instructions; children, refs, and `ngProjectAs` projected into a component; `@defer` blocks, triggers,
    `when` bindings, and source positions; attributes, events, namespaces,
    refs, and component output casing; local and imported tags; styles and
    `:global`; selector parsing and defaults; native-name collisions; `XMeta`
    merging, validation, and `routeMeta` pass-through; errors, including the
    `@defer` and `@boundary` single-node hints; member initializers that
    read body locals; mutable host locals read and written through accessors;
    text and string children escaped as text; source maps. Every generated
    template is parsed with Angular's `parseTemplate`.
  - `source-map.spec.ts` (2): copied ranges win over equal-bounds wrappers;
    character mappings survive JSON escapes.
  - `cache.spec.ts` (6): one parse per source across discovery, scans, and
    compiles; scan/compile lowering reuse; re-parse on change; cached parse
    errors.
  - `types.spec.ts` (5): inferred declarations with internals stripped; real
    `tsc` type-checking of `.tsrx` imports; unchanged files not rewritten and
    stale files removed; lowering errors keep previous declarations; custom
    `outDir`.
- **`vite-plugin-angular`**: `fast-compile-api.spec.ts` (5): finding the API;
  compiling another format's TypeScript; scanning registered formats and
  packages; ignoring unregistered formats. Defer-only dependency tests in
  `component.spec.ts` (merged with #2784).
- **`platform` / `router`**: `.page.tsrx` discovery, path derivation, and a TSRX
  layout paired with an index page.
- **`tsrx-app-e2e-playwright`** (12, dev and production builds): `routeMeta` and
  client navigation; inputs, outputs, providers, and two-way models after
  hydration; server loads, an API route, and a missing product; form actions,
  including a failed submission;
  markdown content; a native `@boundary` fallback and reset; deferred views;
  incremental hydration (`hydrate on interaction`, `hydrate never`); and content
  projection into named, default, and fallback slots of a TSRX component and a
  `.ts` component, with `contentChild()` and reactive, conditional projected
  content after hydration.
- **Typecheck**: `nx typecheck tsrx-app` builds first, then type-checks the app
  against the generated declarations with `tsgo`.

## Example Usage

A page with a server load and an imported TSRX component:

```tsrx
// src/app/pages/products/[productId].page.tsrx
import { injectLoadData } from '@analogjs/router';
import { computed } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

import { Price } from '../../components/price.tsrx';
import type { load } from './[productId].server';

export default function ProductPage() @{
  const data = toSignal(injectLoadData<typeof load>(), { requireSync: true });
  const product = computed(() => data().product);

  <article>
    @if (product()) {
      <>
        <h2>{product()!.name}</h2>
        <Price amount={product()!.price} />
      </>
    } @else {
      <p>{'Product not found.'}</p>
    }
    <a use={[RouterLink]} routerLink="/products">{'Back to all products'}</a>
  </article>
}
```

Deferred views and incremental hydration:

```tsrx
@defer (on interaction(loadDetails)) {
  <LazyDetails />
} @placeholder {
  <p>{'Details load when you click the button.'}</p>
}

@defer (hydrate on interaction) {
  <LikeButton />
}
```

## Future Work

- **Template type errors.** Only imports of `.tsrx` modules are type-checked by
  `tsc`; an invalid expression inside a template is not. The declaration
  generator already builds a program over the lowered code, so its semantic
  diagnostics can be reported at `.tsrx` positions via `TsrxSourceMap`, in the
  build, the dev server, or both.
- **Multiple nodes per block.** `@defer`, `@if`, and `@for` blocks render one
  node because `@tsrx/core`'s parser requires it; lifting that is an upstream
  change.
- **Fresh clones.** Editors report `.tsrx` imports as missing until the dev
  server or a build has written the declarations once. A TypeScript language
  service plugin could serve them without files on disk.
- **Same-named components.** Tags resolve to selectors through the fast
  compiler's registry, which is keyed by class name, so two components with
  the same class name in different modules resolve to the same selector, even
  when imported under different aliases. Keying the registry by module and
  export name is a fast compile change that also applies to `.ts` components.
- **`routeMeta` in typed routes.** Typed routing (experimental) detects
  `routeMeta` exports with oxc, which can't parse TSRX, so `.page.tsrx` routes
  have no `routeMeta` in the generated route table. Runtime routing is not
  affected. Detecting it needs the TSRX parser from `@analogjs/platform`.
- **The full compilation path.** Only the fast compile path is supported.
- **Publishing.** The package is private (`0.0.0`) and built from this
  repository.

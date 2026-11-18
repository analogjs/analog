# RFC: TSRX Components for Angular

**Status:** Implemented, experimental (analogjs/analog#2789; NGP compilation in analogjs/analog#2791)
**Author:** Brandon Roberts
**Date:** 2026-11-17, updated 2026-11-18
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
an ordinary `@Component` class and hands it to `@analogjs/vite-plugin-angular`,
through either its fast compile path or NGP compilation. The Angular compiler
then analyzes and generates code for it like any other component; under NGP it
also type-checks the setup code and template expressions. `.tsrx` files
work as components, layouts, and `@analogjs/router` pages (`.page.tsrx`), and
the plugin writes TypeScript declarations for them so `tsc` and editors can
type-check imports of them.

```ts
// vite.config.ts
plugins: [analog(), tsrxAngular(), angular({ fastCompile: true })];
// or, with type checking:
plugins: [analog(), tsrxAngular(), angular({ compilation: 'ngp' })];
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
- **A test of the compilers' extensibility.** Supporting another source format
  exercises the fast compiler and NGP as general Angular backends, and the
  `api.fastCompile` and `api.ngp` hooks added for it are format-agnostic.

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

Tags for imported components resolve through a component registry
(`ComponentScanner`) that scans `.tsrx` modules, relative `.ts` sources and
packages' `.d.ts` declarations on demand. Both compilers share it, so selector
lookup doesn't depend on fast compile. Class and attribute selectors (`button[matButton]`, `.chip[role=option]`)
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

### NGP compilation

With `angular({ compilation: 'ngp' })`, the NGP plugin exposes `api.ngp`, found
with `findNgpCompileApi(config.plugins)`:

- `registerSourceFormat({ name, test, toScanSource, include, lower })`: `include`
  globs the format's modules relative to the tsconfig's directory, and
  `lower(code, path, { scanImports, resolveSelector })` returns the lowered
  TypeScript with `mapToSource` (source maps), `toSourceLocation` (type
  errors), and an optional lowering error.

NGP analyzes the whole program when the build starts, and its WebAssembly
analyzer reads files synchronously through a `hostFs` option. So the plugin
lowers every module up front and serves each one through a `hostFs` overlay as a
TypeScript file named after it, hiding the module itself:

```
src/app/components/price.tsrx  →  src/app/components/price.tsrx.ts (in memory)
```

`import './price.tsrx'` then resolves to the lowered file, and a tsconfig
`include` of `src/**/*.ts` finds `.page.tsrx` modules nothing imports. Hiding the
real file is required: NGP's `virtualFiles` option also serves the lowered code,
but imports still resolve to the real `.tsrx` beside it.

- **Changes.** Editing a module lowers it again, along with the modules that
  looked up selectors in it, and passes them to `analyzer.updateFileContent`.
  New and removed modules on the dev server are lowered or dropped and
  reported to the analyzer.
- **HMR.** In-place component updates work as for `.ts` components. NGP names
  components by their program file (`price.tsrx.ts`), so the plugin uses the
  module's path in component ids, the module the dev server knows.
- **Source maps** combine NGP's map with `TsrxSourceMap`.
- **Type checking.** NGP's type-check blocks run through `tsgo`, which reads
  from disk, so lowered files are opened as in-memory documents before any
  check, and every reported location is mapped back to the `.tsrx` module.
  Template expressions are closures in the lowered code, so they're
  type-checked along with the setup code, and `.ts` templates' bindings to
  TSRX inputs are checked against the inputs' types. "Inferred type cannot be
  named" errors (TS2742, TS2883) are ignored in lowered files, which are never
  emitted; their declarations come from the type generator with
  `stripInternal`.
- **Backend.** Only the WebAssembly analyzer takes `hostFs`, so a native
  analyzer build (`ANALOG_NGP_NATIVE_BINDING`) is an error with TSRX. The
  Angular team expects to ship `@angular/ngp` as WebAssembly first.

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
build. `tsrxAngular({ types: false })` turns this off, and
`tsrxAngular({ types: { tsconfig, outDir } })` changes the tsconfig and output
directory. Works with `tsc` and `tsgo`.

### Constraints

- Fast compile (`angular({ fastCompile: true })`) or NGP compilation
  (`angular({ compilation: 'ngp' })`), not the default ngtsc path.
- Under NGP, modules must be under the tsconfig's directory, and the tsconfig's
  `include` must cover their `.tsrx.ts` names.
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
| `packages/tsrx-angular/src/lib/plugin.ts`                                                                                      | The `tsrxAngular()` Vite plugin: registers the format, transforms `.tsrx`, writes declarations on build and in dev                          |
| `packages/tsrx-angular/src/lib/types.ts`                                                                                       | `TsrxTypeGenerator`: emits `.d.tsrx.ts` declarations from lowered code with a virtual compiler host                                         |
| `packages/tsrx-angular/src/index.ts`                                                                                           | Exports `tsrx`, `lowerTsrx`, `defaultSelector`, `TsrxSourceMap`, and option/result types                                                    |
| `packages/vite-plugin-angular/src/lib/fast-compile-api.ts`                                                                     | `FastCompileApi` types and `findFastCompileApi()`                                                                                           |
| `packages/vite-plugin-angular/src/lib/fast-compile-plugin.ts`                                                                  | Registered source formats in scans and HMR, `scanImports` for relative and package imports, `resolveSelector`, `compile`                    |
| `packages/vite-plugin-angular/src/lib/component-scanner.ts`                                                                    | `ComponentScanner`: the on-demand component registry, shared by fast compile and NGP                                                        |
| `packages/vite-plugin-angular/src/lib/ngp-compile-api.ts`                                                                      | `NgpCompileApi` types and `findNgpCompileApi()`                                                                                             |
| `packages/vite-plugin-angular/src/lib/ngp-compile-plugin.ts`                                                                   | `api.ngp`: lowering at build start, re-lowering on change, program files in transform, HMR and type checking                                |
| `packages/vite-plugin-angular/src/lib/utils/ngp-host-fs.ts`                                                                    | The `hostFs` overlay serving lowered modules as `<module>.ts`                                                                               |
| `packages/vite-plugin-angular/src/lib/utils/lsp-type-checker.ts`                                                               | In-memory files opened before checks; reported locations mapped to their source                                                             |
| `packages/platform/src/lib/{route-file-discovery,route-manifest,router-plugin,typed-routes-plugin,discover-library-routes}.ts` | `.page.tsrx` as route files                                                                                                                 |
| `packages/router/src/lib/route-builder.ts`                                                                                     | Strips `.page.tsrx` when deriving route paths                                                                                               |
| `apps/tsrx-app`                                                                                                                | Demo app where every page, layout, and component is a `.tsrx` file; built with NGP, or fast compile with `ANALOG_FAST_COMPILE=true`         |
| `apps/tsrx-app-e2e-playwright`                                                                                                 | End-to-end tests for the demo app, run in CI                                                                                                |

Separately merged to `beta`: fast compile now lazy-loads defer-only
dependencies (analogjs/analog#2784, fixing #2785).

### Data Flow

```
tsrxAngular() configResolved
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

Under NGP:

```
tsrxAngular() configResolved
  └─ findNgpCompileApi(plugins).registerSourceFormat({ include: **/*.tsrx, lower, … })

NGP buildStart
  ├─ glob include → lower(code, { scanImports, resolveSelector }) for each module
  └─ createAnalyzer(tsconfig, { hostFs: overlay serving foo.tsrx.ts, hiding foo.tsrx })

transform(foo.tsrx)
  ├─ lowering error? → this.error() at the .tsrx position
  ├─ compile foo.tsrx.ts → type-check (tsgo, in-memory document) → errors at .tsrx positions
  └─ transpile, source map remapped to foo.tsrx

handleHotUpdate(foo.tsrx or an imported .ts)
  └─ lower again (+ importers) → updateFileContent → HMR or reload
```

## Test Coverage

- **`tsrx-angular`**: 69 tests.
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
  - `ngp.spec.ts` (7, real NGP): compiling `.tsrx` modules and their `.ts`
    importers; modules nothing imports; selectors of imported `.ts` and `.tsrx`
    components; importers lowered again after a selector change; in-place HMR
    after a template change; lowering errors; type errors at `.tsrx` positions,
    with the importer checked first.
- **`vite-plugin-angular`**: `fast-compile-api.spec.ts` (5): finding the API;
  compiling another format's TypeScript; scanning registered formats and
  packages; ignoring unregistered formats. Defer-only dependency tests in
  `component.spec.ts` (merged with #2784).
- **`platform` / `router`**: `.page.tsrx` discovery, path derivation, and a TSRX
  layout paired with an index page.
- **`tsrx-app-e2e-playwright`** (12, production build with NGP in CI; also
  passes with `ANALOG_FAST_COMPILE=true`): `routeMeta` and
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

- **Template type errors outside NGP.** NGP type-checks templates and setup
  code; with fast compile, and with `tsc` alone, only imports of `.tsrx`
  modules are. The declaration generator already builds a program over the
  lowered code, so its semantic diagnostics could be reported at `.tsrx`
  positions via `TsrxSourceMap`.
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
- **The default compilation path.** ngtsc isn't supported; fast compile and
  NGP are.
- **NGP outside the tsconfig's directory.** `.tsrx` modules elsewhere, such as
  pages in workspace libraries, aren't lowered. `hostFs` reads are synchronous,
  so a module can't be lowered on first read.
- **NGP's API.** `hostFs` isn't public yet; the overlay tracks the bundled
  build and may need to follow changes before `@angular/ngp` ships.
- **Publishing.** The package is private (`0.0.0`) and built from this
  repository.

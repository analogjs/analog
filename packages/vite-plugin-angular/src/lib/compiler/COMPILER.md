# Analog Angular Compiler (internal)

A lightweight Angular compiler that transforms decorators and signal-based reactive APIs into Ivy static definitions. Designed for fast dev server compilation via Vite, without requiring a full TypeScript program.

This is an **internal** component of `@analogjs/vite-plugin-angular`. It is not published as a standalone package. Use the `fastCompile` flag on the vite plugin to opt into it:

```ts
import angular from '@analogjs/vite-plugin-angular';

export default defineConfig({
  plugins: [angular({ fastCompile: true })],
});
```

Peer dependencies (inherited from `vite-plugin-angular`): `@angular/compiler` >=17, `@angular/compiler-cli` >=17, `@angular/build` >=17, `vite` >=6. Compatibility validated against `17.3.12`, `18.2.14`, `19.0.0`, `20.0.0`, `21.0.0`, and `next` on every PR via the matrix in `.github/workflows/compiler-compat.yml` (see § Compatibility Testing). Components that use `@defer` at runtime require Angular 18+.

## Architecture

```
Source file (.ts)
  │
  ├─ vite-plugin-angular (buildStart, when fastCompile is true)
  │    @angular/compiler-cli readConfiguration() → rootNames
  │    OXC parser ──▶ scanFile() ──▶ ComponentRegistry
  │                                   (selectors, inputs, outputs, pipes, NgModule exports)
  │
  └─ vite-plugin-angular (transform, per request)
       collectImportedPackages() ──▶ scanPackageDts() ──▶ registry (lazy, once per package)
       inlineResourceUrls() ──▶ OXC AST rewrite (templateUrl → template, styleUrl → styles)
         │
         ▼
       compile(code, fileName, { registry })
         ts.createSourceFile ──▶ extractMetadata / detectSignals / detectFieldDecorators
           │
           ▼
         @angular/compiler
           parseTemplate()
           compileComponentFromMetadata()
           compileDirectiveFromMetadata()
           compilePipeFromMetadata()
           compileNgModule() / compileInjector()
           compileFactoryFunction()
           compileClassMetadata()
           │
           ▼
         JSEmitter (Angular output AST → JavaScript strings, ~4x faster than ts.Printer)
           │
           ▼
         MagicString (surgical edits on original source → JS + source map)
```

The compiler is integrated into `@analogjs/vite-plugin-angular` as an alternative compilation path alongside ngtsc and the Angular Compilation API. When `fastCompile` is enabled, the vite plugin:

1. Scans all source files with `scanFile()` at build start to populate the `ComponentRegistry`
2. Inlines external resources (`templateUrl`, `styleUrl`) via OXC AST rewriting before compilation
3. Compiles each file on-demand with `compile()` during Vite's transform phase (runs with `enforce: 'pre'`)
4. Elides type-only imports via OXC AST usage analysis (removes imports that are only referenced in type positions — annotations, `implements`, generics — so single-file transpilers don't leak them to the browser)
5. Strips TypeScript syntax from the output via `vite.transformWithOxc()` (handles `import type`, generics, interfaces, `implements`, etc.)
6. Appends HMR code for Angular declarations in dev mode (components via `ɵɵreplaceMetadata`, directives/pipes via field-swap + invalidate)
7. Injects synthetic imports for NgModule-exported classes

The existing vite-plugin-angular plugins (build optimizer, router, vitest, etc.) continue to work alongside the analog compiler.

## Source Files

| File                  | Purpose                                                                                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `compile.ts`          | Single-file compiler: OXC-based metadata extraction + Ivy codegen via `@angular/compiler` APIs. Supports full (`ɵɵdefineComponent`) and partial (`ɵɵngDeclareComponent`) modes |
| `registry.ts`         | OXC-based file scanner, extracts selectors, inputs, outputs, sourcePackage tracking                                                                                            |
| `metadata.ts`         | OXC-based decorator metadata extraction (`extractMetadata`, `collectStringConstants`, `detectSignals`, `detectFieldDecorators`, `extractConstructorDeps`)                      |
| `js-emitter.ts`       | Angular output AST → JavaScript string emitter (~4x faster than `ts.Printer`), handles OXC/TS WrappedNodeExpr, bare module refs (`ngImport: i0`), `$localize`                  |
| `ast-translator.ts`   | Angular output AST → TypeScript AST translator, handles bare module refs and `$localize` for partial/i18n output                                                               |
| `resource-inliner.ts` | OXC-based `templateUrl`/`styleUrl` inlining and inline style extraction                                                                                                        |
| `dts-reader.ts`       | OXC-based `.d.ts` scanner for pre-compiled Angular packages (selectors, inputs, outputs, sub-entry resolution)                                                                 |
| `jit-transform.ts`    | JIT mode (OXC-based): decorator metadata arrays + constructor DI + signal downleveling + decorator removal (preserves `@Injectable` for self-registration)                     |
| `jit-metadata.ts`     | JIT metadata helpers (OXC AST edition): constructor parameters, property decorators via source-position slicing                                                                |
| `defer.ts`            | `@defer` dependency map builder                                                                                                                                                |
| `hmr.ts`              | HMR code generation: `ɵɵreplaceMetadata` for components, field-swap + invalidate for directives/pipes                                                                          |
| `styles.ts`           | Style preprocessing via Vite's `preprocessCSS` (OXC-based extraction)                                                                                                          |
| `type-elision.ts`     | OXC-based type-only import detection and elision (usage analysis, no type-checker needed)                                                                                      |
| `constants.ts`        | Shared Angular name sets (`ANGULAR_DECORATORS`, `COMPILABLE_DECORATORS`, `FIELD_DECORATORS`, `SIGNAL_APIS`) — single source of truth to prevent drift                          |
| `utils.ts`            | Type-only import detection (syntactic), class finder, `forwardRef` unwrapper (TS + OXC versions)                                                                               |

## What's Supported

### Decorators

| Decorator     | Static Fields                              | Notes                                                             |
| ------------- | ------------------------------------------ | ----------------------------------------------------------------- |
| `@Component`  | `ɵcmp`, `ɵfac`, `setClassMetadata`         | Full template compilation with Ivy instructions                   |
| `@Directive`  | `ɵdir`, `ɵfac`, `setClassMetadata`         | Host bindings, listeners, inputs/outputs                          |
| `@Pipe`       | `ɵpipe`, `ɵfac`, `setClassMetadata`        | Pure and impure                                                   |
| `@Injectable` | `ɵprov`, `ɵfac`, `setClassMetadata`        | `providedIn`, `useFactory`, `useClass`, `useExisting`, `useValue` |
| `@NgModule`   | `ɵmod`, `ɵinj`, `ɵfac`, `setClassMetadata` | Declarations, exports, providers, bootstrap                       |

### Field Decorators

| Decorator                                                          | Supported |
| ------------------------------------------------------------------ | --------- |
| `@Input()` / `@Input('alias')` / `@Input({ required, transform })` | Yes       |
| `@Output()` / `@Output('alias')`                                   | Yes       |
| `@ViewChild(pred, opts)` / `@ViewChildren(pred, opts)`             | Yes       |
| `@ContentChild(pred, opts)` / `@ContentChildren(pred, opts)`       | Yes       |
| `@HostBinding('prop')`                                             | Yes       |
| `@HostListener('event', ['$event'])`                               | Yes       |

### Dependency Injection

| Feature                               | Supported                                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------------ |
| Constructor parameter injection       | Yes (type annotations as tokens)                                                     |
| `@Inject(TOKEN)`                      | Yes                                                                                  |
| `@Inject(forwardRef(() => TOKEN))`    | Yes (forwardRef is unwrapped before token emission)                                  |
| `@Optional()`                         | Yes                                                                                  |
| `@Self()` / `@SkipSelf()` / `@Host()` | Yes                                                                                  |
| `@Attribute('name')`                  | Yes                                                                                  |
| Nullable union (`T \| null`)          | Yes (resolves to T)                                                                  |
| Ambiguous union (`A \| B`)            | Rejected → `ɵɵinvalidFactory` (matches ngtsc's "no suitable injection token")        |
| Intersection types (`A & B`)          | Rejected → `ɵɵinvalidFactory`                                                        |
| Type-only imports (`import type`)     | Detected → `ɵɵinvalidFactory` for DI; auto-elided from output via OXC usage analysis |
| Class inheritance without constructor | `ɵɵgetInheritedFactory`                                                              |
| `forwardRef(() => X)` unwrapping      | Yes (in imports, providers, queries, `@Inject`)                                      |

### @Component API Coverage

| Property                   | Status                                                        |
| -------------------------- | ------------------------------------------------------------- |
| `selector`                 | Supported (auto-generated for selectorless routed components) |
| `template`                 | Supported                                                     |
| `templateUrl`              | Supported (inlined at compile time)                           |
| `styles` (array or string) | Supported (ShadowCss emulated encapsulation)                  |
| `styleUrl` / `styleUrls`   | Supported (inlined at compile time)                           |
| `standalone`               | Supported (defaults `true` for Angular 19+)                   |
| `changeDetection`          | Supported (OnPush / Default)                                  |
| `encapsulation`            | Supported (Emulated / None / ShadowDom)                       |
| `imports`                  | Supported (resolved via registry)                             |
| `providers`                | Supported                                                     |
| `viewProviders`            | Supported                                                     |
| `animations`               | Supported (passed through)                                    |
| `exportAs`                 | Supported                                                     |
| `preserveWhitespaces`      | Supported                                                     |
| `host`                     | Supported (listeners, properties, attributes)                 |
| `hostDirectives`           | Supported (bare, object form with inputs/outputs, forwardRef) |
| `schemas`                  | Passed through                                                |

String-typed metadata fields (`template`, `selector`, `templateUrl`, `styles`, `styleUrl`, `styleUrls`, `name`, `exportAs`, `providedIn`) can reference module-level `const` string constants via JS template-literal interpolation, e.g. `template: \`<div class="${twClass}">x</div>\``. Resolution is iterative, so a const may reference earlier-resolved consts (`const a = ...; const b = \`${a} more\`;`). Only bare `Identifier`expressions against`const` declarations are resolved — member access, function calls, and imported values fall back to the existing valText path so the compiler never crashes on unresolvable references.

### Signal APIs

| API                                          | Supported                                                               |
| -------------------------------------------- | ----------------------------------------------------------------------- |
| `signal()`                                   | Yes (preserved as-is)                                                   |
| `computed()`                                 | Yes (preserved as-is)                                                   |
| `input()` / `input.required()`               | Yes (signal input descriptors, `alias`, `transform`, `required` flag)   |
| `model()` / `model.required()`               | Yes (generates input + `${alias ?? name}Change` output)                 |
| `output()` / `outputFromObservable()`        | Yes (with `alias` option, extracted in registry for cross-file binding) |
| `viewChild()` / `viewChild.required()`       | Yes (with `read` option; class predicates wrapped as R3QueryReference)  |
| `viewChildren()`                             | Yes (with `read` option)                                                |
| `contentChild()` / `contentChild.required()` | Yes (with `read` and `descendants` options)                             |
| `contentChildren()`                          | Yes (with `read` and `descendants` options, defaults to `false`)        |
| `inject()`                                   | Yes (preserved as-is)                                                   |

### Template Features

| Feature                                                                                                 | Supported                                      |
| ------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `@if` / `@else if` / `@else`                                                                            | Yes                                            |
| `@for` with `track`, `@empty`                                                                           | Yes                                            |
| `@for` implicit variables (`$index`, `$first`, `$last`, `$even`, `$odd`, `$count`)                      | Yes                                            |
| `@switch` / `@case` / `@default`                                                                        | Yes                                            |
| `@defer` with all triggers (`on viewport`, `on idle`, `on timer`, `on hover`, `on interaction`, `when`) | Yes                                            |
| `@defer` sub-blocks (`@loading`, `@placeholder`, `@error`) with `minimum`                               | Yes                                            |
| `@defer` lazy dependency loading via `import().then(m => m.X)`                                          | Yes (named + default imports, per-block dedup) |
| Nested `@defer` inside control flow                                                                     | Yes                                            |
| `@let` declarations                                                                                     | Yes                                            |
| `{{ interpolation }}`                                                                                   | Yes                                            |
| `[property]` binding                                                                                    | Yes                                            |
| `(event)` binding                                                                                       | Yes                                            |
| `[(two-way)]` binding                                                                                   | Yes                                            |
| `[class.name]` / `[style.prop]`                                                                         | Yes                                            |
| `<ng-content>` (multi-slot projection)                                                                  | Yes                                            |
| Pipes in templates (with args, chained)                                                                 | Yes                                            |
| `i18n` attribute (static text, interpolations, meaning/description, custom ID)                          | Yes                                            |
| `i18n-*` attribute bindings (e.g. `i18n-title`)                                                         | Yes                                            |
| ICU expressions (`{count, plural, =0 {none} =1 {one} other {many}}`)                                    | Yes                                            |

### Cross-file Resolution

| Scenario                                                  | Supported                                                                                            |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Component imports component                               | Yes (via registry, with input/output binding resolution)                                             |
| Component imports directive                               | Yes (via registry)                                                                                   |
| Component imports pipe                                    | Yes (via registry)                                                                                   |
| Component imports NgModule                                | Yes (recursively expanded, handles nested NgModules with cycle detection)                            |
| Component imports tuple barrel                            | Yes (`export const X = [A, B] as const` expanded to underlying directives via `tuple` registry kind) |
| Library imports (e.g. `RouterOutlet`)                     | Yes (lazily scanned from package `.d.ts` via `scanPackageDts()`)                                     |
| Library NgModule exports                                  | Yes (`.d.ts` scanner reads `ɵɵNgModuleDeclaration` type params)                                      |
| Library `export *` chains in `index.d.ts`                 | Yes (dts-reader follows relative re-export chains via OXC)                                           |
| Library sub-entry imports (e.g. `@angular/material/tabs`) | Yes (via `sourcePackage` from package.json exports map)                                              |
| Workspace library barrels via tsconfig `paths`            | Yes (vite plugin walks relative `export *` chains at buildStart)                                     |
| Same-file imports                                         | Yes (file-local selector fallback)                                                                   |
| Self-referencing (recursive) components                   | Yes (component added to its own declarations)                                                        |
| Signal input bindings (`[prop]="value"`)                  | Yes (registry extracts `input()`, `input.required()`, `@Input()`, with `alias` option)               |
| Signal output bindings (`(event)="handler()"`)            | Yes (registry extracts `output()`, `model()`, `@Output()`, with `alias` option)                      |
| Two-way binding (`[(prop)]="signal"`)                     | Yes (via `model()` input + output registration)                                                      |
| Inheritance (`class Foo extends Bar`)                     | Yes (`usesInheritance: true` → `InheritDefinitionFeature` for inputs/outputs/queries)                |

## What's Not Supported

| Feature                      | Reason                                                               |
| ---------------------------- | -------------------------------------------------------------------- |
| Template type checking       | Requires full `ts.Program`; use Angular Language Service in IDE      |
| i18n message extraction      | Compilation emits `$localize`; extraction to XLIFF/XMB not yet wired |
| Partial / linker compilation | Supported via `compilationMode: 'partial'`                           |
| Template source maps         | Angular compiler doesn't propagate sourceSpan to output AST          |
| Signal debug names           | Not implemented                                                      |
| `setClassDebugInfo`          | Not implemented                                                      |
| Spread imports (`...Module`) | Not implemented                                                      |

## HMR (Hot Module Replacement)

HMR code is generated by `generateHmrCode()` (exported from `@analogjs/angular-compiler`) and handles all Angular declaration types:

**Components** — true HMR via Angular's `ɵɵreplaceMetadata`:

1. Vite hot-replaces the module
2. The `ɵhmr_` callback dynamically copies all `ɵ`-prefixed static fields from the new class to the old
3. `ɵɵreplaceMetadata` merges old/new definitions and recreates matching LViews without page reload
4. File-local Angular class names are passed as local dependencies

**Directives and pipes** — field-swap + invalidation:

1. The `ɵhmr_` callback copies all `ɵ`-prefixed fields (same dynamic approach)
2. Since `ɵɵreplaceMetadata` only supports components, the module is invalidated to trigger a full reload

**Root components** (e.g. `App`) fall back to page reload since they can't be hot-replaced without re-bootstrapping. Non-Angular files use Vite's default HMR.

External template and style changes invalidate the parent `.ts` module, triggering re-compilation and HMR. Preprocessed styles are cached by mtime for fast re-compilation.

## Source Maps

The compiler generates V3 source maps via `magic-string` using surgical edits on the original source. Class bodies, methods, and expressions stay at their original character positions — only removed decorators and inserted Ivy fields are new content. The source map is passed through Vite's transform pipeline which composes it with other transforms for end-to-end mapping in browser devtools.

## Style Preprocessing

Both external and inline styles are preprocessed via Vite's `preprocessCSS` API:

- **External styles** (`.scss`, `.sass`, `.less`, `.styl` via `styleUrl`/`styleUrls`): extracted via OXC parser, read, preprocessed, and passed to the compiler via `resolvedStyles`
- **Inline styles** (`styles: [...]` or `styles: \`...\``): extracted via OXC parser (`extractInlineStyles`), preprocessed, and passed via `resolvedInlineStyles`
- **Template `<style>` tags**: Angular's `parseTemplate()` extracts `<style>` blocks from the HTML template. These are merged with the decorator-level `styles` array so both sources contribute to the compiled output.

When a `@Component` decorator combines both an inline `styles: [...]` array and a `styleUrl`/`styleUrls` property, `inlineResourceUrls` merges the inlined CSS into the existing array rather than emitting a second `styles` property. The merge inserts each file's content right after the last real element in the existing array, so source-level trailing commas are preserved and the output never contains sparse (`null`) elements — downstream metadata extraction walks the array and crashes on null entries. If the existing array is empty, the leading comma is dropped to avoid a `[, "..."]` sparse hole. When a decorator has `styleUrl` and `styleUrls` together with no inline `styles`, both url-based props collapse into a single synthesized `styles: [...]` write so only one `styles` key is ever emitted.

The `inlineStyleLanguage` option (default: `'scss'`) controls the file extension used for inline style preprocessing. Set to `'css'` to disable inline preprocessing.

## Comparison with Angular's Compilers

### vs ngtsc (Angular's native compiler)

Both produce identical Ivy output because both call the same `@angular/compiler` APIs (`compileComponentFromMetadata`, `parseTemplate`, `compileFactoryFunction`, etc.). The template instructions are byte-for-byte equivalent.

|                                 | ngtsc                                    | This compiler                                                   |
| ------------------------------- | ---------------------------------------- | --------------------------------------------------------------- |
| Size                            | ~200,000+ lines                          | ~2,000 lines                                                    |
| Requires `ts.Program`           | Yes (reads all files, resolves modules)  | No                                                              |
| Type checking                   | Full TS + template type checking         | None (use Angular Language Service)                             |
| Template compilation            | Full Ivy instructions                    | Full Ivy instructions (same APIs)                               |
| Output format                   | `ɵɵdefineComponent` (final)              | `ɵɵdefineComponent` (final)                                     |
| Global analysis                 | Via type checker (full scope resolution) | Via tsconfig + OXC registry scan                                |
| Constructor DI                  | Full (via type checker)                  | Full (via AST parameter analysis)                               |
| `setClassMetadata`              | Yes                                      | Yes                                                             |
| Source maps                     | Yes (via TS emitter)                     | Yes (via MagicString surgical edits + inline string emitter)    |
| HMR                             | Full (with tracking metadata)            | Components (full), directives/pipes (invalidate), root (reload) |
| `@defer` lazy loading           | Yes                                      | Yes                                                             |
| SCSS preprocessing              | Via `@angular/build`                     | Via Vite `preprocessCSS` + LmdbCacheStore                       |
| i18n                            | Full ICU extraction + localization       | `$localize` emission (extraction not yet wired)                 |
| Template type checking          | Full (`strictTemplates`)                 | Not supported                                                   |
| Incremental compilation         | `ts.Program` reuse                       | Per-file (Vite handles caching)                                 |
| Diagnostic messages             | Hundreds of template/binding errors      | Unresolved selector warnings only                               |
| Partial compilation (libraries) | `ɵɵngDeclareComponent`                   | `ɵɵngDeclareComponent` (via `compilationMode: 'partial'`)       |
| Declaration files (`.d.ts`)     | Yes                                      | Not in scope                                                    |

#### Performance

| Metric                       | ngtsc              | This compiler   |
| ---------------------------- | ------------------ | --------------- |
| Cold build (500 components)  | 5-15s              | <1s (on-demand) |
| Hot rebuild (1 file changed) | 200-500ms          | 2-5ms           |
| Dev server start             | 3-10s              | <1s             |
| Registry scan (1000 files)   | N/A (type checker) | ~37ms (OXC)     |

#### The Tradeoff

ngtsc gives **compile-time safety** — wrong template bindings, missing inputs, and type mismatches are caught before the browser runs. This compiler gives **speed** — identical Ivy output, identical runtime behavior, but no compile-time template validation. With Angular Language Service running in the IDE, the developer experience is nearly identical — errors show as red squiggles in the editor instead of terminal output.

### vs Angular Local Compilation

|                             | Local Compilation                | This compiler (full)            | This compiler (partial)          |
| --------------------------- | -------------------------------- | ------------------------------- | -------------------------------- |
| Output format               | `ɵɵngDeclareComponent` (partial) | `ɵɵdefineComponent` (final)     | `ɵɵngDeclareComponent` (partial) |
| Linker required             | Yes                              | No                              | Yes                              |
| Template compiled at        | Link time                        | Compile time                    | Link time                        |
| Selector matching           | Deferred to linker               | Done via global analysis plugin | Deferred to linker               |
| Cross-version compatibility | Yes (stable declaration format)  | No (tied to Angular version)    | Yes (stable declaration format)  |
| Use case                    | Library publishing (npm)         | Application dev server          | Library publishing (npm)         |
| Requires `ts.Program`       | No                               | No                              | No                               |

### vs esbuild/SWC (type stripping)

|                      | esbuild/SWC                    | This compiler                          |
| -------------------- | ------------------------------ | -------------------------------------- |
| TypeScript handling  | Strip types only               | Strip types + transform decorators     |
| Angular awareness    | None                           | Full (templates, signals, Ivy codegen) |
| Template compilation | N/A                            | Full Ivy instructions                  |
| Speed                | ~0.01ms/file                   | ~0.5-2ms/file                          |
| Output               | Valid JS (no Angular metadata) | Valid JS + Ivy static fields           |

## Performance

### Per-file Compilation

| Component Complexity                         | Time   |
| -------------------------------------------- | ------ |
| Simple (1 element, no signals)               | ~0.5ms |
| Medium (control flow, signals, styles)       | ~1.8ms |
| Complex (nested control flow, many bindings) | ~3ms   |

In Vite dev mode, only requested files are compiled on demand. A typical page load compiles 10-20 files (~20-40ms total).

### Compilation Breakdown (medium component)

| Phase              | % of time | Tool                                |
| ------------------ | --------- | ----------------------------------- |
| Template parsing   | ~46%      | `@angular/compiler` (JS)            |
| TypeScript parsing | ~29%      | `ts.createSourceFile` (JS)          |
| Code emission      | ~25%      | Inline string emitter + MagicString |

The dominant cost is Angular's template parser — JavaScript that can't be replaced with Rust without reimplementing the Angular template compiler.

### Registry Cold Scan

| Files | OXC (parse + walk) | TypeScript (parse only) |
| ----- | ------------------ | ----------------------- |
| 200   | ~8ms               | ~23ms                   |
| 500   | ~19ms              | ~55ms                   |
| 1000  | ~37ms              | ~55ms                   |

The registry scan uses OXC's native Rust parser for ~1.5x faster file scanning at build start.

## Angular Version Compatibility

The compiler detects the installed `@angular/compiler` version at startup and adapts:

| Feature                    | Angular 19 | Angular 20+              | Angular 21+          |
| -------------------------- | ---------- | ------------------------ | -------------------- |
| `hasDirectiveDependencies` | Omitted    | Set when imports present | Same                 |
| `externalStyles`           | Omitted    | Same                     | Available (not used) |
| All other APIs             | Compatible | Compatible               | Compatible           |

Supported range: **Angular 17+** (with the v17 `@defer` runtime caveat noted above). Conformance tested against **Angular 17-21**, compatibility tested via per-version `pnpm.overrides` matrix on every PR.

## Future Architecture (tsgo)

When TypeScript moves to `tsgo` (Go-based compiler), Angular will need to separate type checking from decorator transformation — the same split this compiler already makes:

```
tsgo (Go)                    Angular Transform (JS)
├─ Type stripping            ├─ compile() per file
├─ Module resolution         ├─ @angular/compiler APIs
└─ Type checking             └─ angular() plugin
                                  └─ Registry scan (OXC/Rust)
```

This compiler's architecture — single-file transforms using `@angular/compiler` with global analysis as a separate registry — is the likely direction for Angular's compiler when `tsgo` replaces `tsc`.

## Test Suite

| File                            | Tests | Coverage                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `conformance.spec.ts`           | 167   | Angular compliance test suite (v17-v21, 87%+ Ivy instruction match)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `component.spec.ts`             | 114   | All `@Component` features, signals (incl. required), control flow, `@defer` (triggers + dependency import shape), pipes, content projection, external resources + OXC inline resource inlining, providers, source maps, cross-component input binding, constant pool ordering, assignment precedence in ternary, templateUrl inlining in metadata, template ref vars, two-way binding with `model()`, computed/safe navigation, `@if as` alias, multiple components per file, duplicate i0 prevention, arrow object literal wrapping, decorator/field preservation, non-Angular passthrough, template-level styles, member decorator removal, self-referencing components, TS syntax preservation, lazy dependency array emission, Ivy fields as static class members + TDZ hoisting, hostDirectives metadata extraction (bare/object/forwardRef), signal query R3QueryReference wrapping, `usesInheritance` for `extends`, host raw embedded quote preservation, signal query `read`/`descendants` options, `@ViewChild` decorator with `read` option (regression for v19 query refresh emission), `styleUrl`/`styleUrls` merges into an existing `styles: [...]` array without producing duplicate object literal keys or sparse elements (including trailing-comma and empty-array cases) |
| `type-elision.spec.ts`          | 58    | Type-only import detection, elision passes, MagicString integration, sourcemap accuracy after elision, `TSAsExpression` value preservation, constant pool helpers survive elision, hoisted nested-template helpers survive elision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `jit-transform.spec.ts`         | 37    | Decorator conversion, member/parameter decorator removal, constructor DI, signal API downleveling, external resources, `ReflectionCapabilities` integration, nested class support, auto-import of decorator classes for signal API downleveling                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `registry.spec.ts`              | 28    | `scanFile` decorator + multi-declaration coverage, NgModule exports, signal input/output/model registry extraction, `sourcePackage` handling, `outputFromObservable`, signal alias support, tuple barrel scanning + imports expansion, `hasTransform` flag, output alias extraction                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `metadata-emit.spec.ts`         | 20    | OXC-based AOT metadata extraction, `emitExpr` routing for function/method args, module-level string const `${var}` interpolation in metadata fields, template literal substitution preserves attribute quotes, `/*@__PURE__*/` annotations on Ivy fields                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `class-field-lowering.spec.ts`  | 20    | Class field lowering for AOT compilation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `jit-integration.spec.ts`       | 19    | JIT transform preserves `@Injectable` for `providedIn`, JIT OXC `ctorParameters`, `propDecorators`, resource rewriting, class traversal                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `decorator-fields.spec.ts`      | 15    | `@Input`, `@Output`, `@ViewChild`, `@ContentChild`, `@HostBinding`, `@HostListener` field decorators                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `dts-reader.spec.ts`            | 14    | Directive/component/pipe extraction from `.d.ts`, signal inputs, aliased inputs, multiple classes, NgModule export scanning, `collectImportedPackages`, `collectRelativeReExports`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `injectable.spec.ts`            | 11    | `providedIn` variants, `useFactory`/`useClass`/`useExisting`/`useValue` provider configuration forwarded to `compileInjectable`, ambiguous union/intersection DI parameter rejection (T \| null still resolves to T), `@Inject(forwardRef(() => TOKEN))` unwrapping                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `constructor-di.spec.ts`        | 10    | Constructor DI: `@Inject`, `@Optional`, inheritance, union types, multiple params                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `partial.spec.ts`               | 9     | Partial compilation mode: `ɵɵngDeclareComponent`/`Directive`/`Pipe`/`NgModule`/`Injectable`/`Factory`/`ClassMetadata`, full mode still emits `ɵɵdefineComponent`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `ngmodule.spec.ts`              | 9     | Compilation, providers, export resolution, NgModule export expansion, recursive expansion, circular handling, declaration dedup across direct imports / tuple barrels / NgModule re-exports / self reference (avoids NG0300)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `directive.spec.ts`             | 8     | Host bindings, `exportAs`, signal inputs, abstract `@Directive()` (no selector), directive providers wrapped as `LiteralArrayExpr`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `integration.spec.ts`           | 7     | Cross-cutting drift guards: `ANGULAR_DECORATORS`/`COMPILABLE_DECORATORS`/`FIELD_DECORATORS`/`SIGNAL_APIS` consistency between registry, AOT compiler, and JIT transform                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `error-handling.spec.ts`        | 7     | Unknown decorators, undecorated classes, selectorless components, `forwardRef`, invalid templates                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `hmr.spec.ts`                   | 7     | HMR code generation: dynamic field copying for components, `ɵɵreplaceMetadata` calls, invalidation for directives/pipes, mixed component+directive files, local dependency forwarding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `cross-file-resolution.spec.ts` | 6     | Cross-file component, pipe, directive resolution, `hasDirectiveDependencies` with unresolved imports                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `i18n.spec.ts`                  | 6     | i18n template compilation: `$localize`, interpolation, meaning/description, `i18n-*` attribute bindings, ICU, non-i18n passthrough                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `compile.spec.ts`               | 2     | Original smoke tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `pipe.spec.ts`                  | 2     | Pure and impure                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

### Conformance Testing

The compiler is validated against Angular's official compliance test suite. A conformance test runner compares compiled Ivy instruction output against Angular's expected patterns with instruction normalization (`ɵɵtemplate`↔`ɵɵdomTemplate`, named↔anonymous functions).

#### Pass Rates by Angular Version

| Angular            | Pass Rate | Tests |
| ------------------ | --------- | ----- |
| v17 (latest patch) | 93.2%     | 120   |
| v18 (latest patch) | 82.9%     | 143   |
| v19 (latest patch) | 83.5%     | 151   |
| v20 (latest patch) | 91.5%     | 155   |
| v21 (latest patch) | 91.8%     | 160   |
| latest             | 91.8%     | 160   |
| next (v22.0.0)     | 91.8%     | 160   |

Remaining soft-failures are output formatting differences (`@defer` multi-file deps, named function patterns), not functional issues. All versions produce 0 hard test failures.

#### Running Conformance Tests

```bash
# Specific major version (resolves latest patch)
bash packages/vite-plugin-angular/scripts/setup-conformance.sh 19
ANGULAR_SOURCE_DIR=.angular-conformance npx vitest run packages/vite-plugin-angular/src/lib/compiler/conformance.spec.ts

# Exact version
bash packages/vite-plugin-angular/scripts/setup-conformance.sh 21.0.0

# Latest stable release (auto-detected via GitHub API)
bash packages/vite-plugin-angular/scripts/setup-conformance.sh
bash packages/vite-plugin-angular/scripts/setup-conformance.sh latest

# Latest prerelease (-next.N)
bash packages/vite-plugin-angular/scripts/setup-conformance.sh next

# Local (auto-detects ~/projects/angular/angular if present)
npx vitest run packages/vite-plugin-angular/src/lib/compiler/conformance.spec.ts
```

CI runs a matrix of Angular 17, 18, 19, 20, 21, latest, and next on every pull request via `.github/workflows/conformance.yml`.

### Compatibility Testing

Conformance testing answers _"does our output match Angular's reference fixtures?"_ but uses the workspace-pinned `@angular/compiler` to do the compilation — so it cannot catch API-surface drift between Angular versions (e.g. a class export disappearing in a patch release). The compatibility matrix in `.github/workflows/compiler-compat.yml` complements it by:

1. Overriding `@angular/compiler` and `@angular/compiler-cli` to each supported version (`17.3.12`, `18.2.14`, `19.0.0`, `20.0.0`, `21.0.0`, plus `next`) via `pnpm.overrides`.
2. Running the regular `packages/vite-plugin-angular/src/lib/compiler/` test suite against the swapped version with `DEBUG=analog-fast-compile*` enabled, so silently-caught errors (e.g. constructor regressions) appear in CI logs.
3. On a `push` to `beta`, auto-opening (or commenting on an existing) GitHub issue using the bug-report template's section structure when a numeric matrix slot fails. PR failures show in the PR check and don't open issues to avoid spam.

The matrix mixes two version-pinning strategies:

- **v17/v18 use the latest LTS patches** (`17.3.12`, `18.2.14`). These majors are in maintenance — the floor versions (`17.0.0`/`18.0.0`) predate the signal-input array shape and aren't worth supporting speculatively, so testing the LTS patches is a better signal for what users actually run.
- **v19/v20/v21 use the floor of the major** (`19.0.0`, `20.0.0`, `21.0.0`). These majors are still receiving patches, so pinning the floor gives a deterministic CI signal — _"the lowest supported version of major N still works"_ — without forcing matrix bumps every time Angular ships a patch.
- **`next`** tracks Angular's prerelease dist-tag and is allowed to fail (early warning when the next major lands a breaking change, without blocking the workflow).

Known v17 limitation: components that use `@defer` at runtime are not supported on Angular 17. The v17 `@defer` ABI requires populated `meta.deferBlocks` and `meta.deferrableTypes` Maps that the compiler currently sets to empty. Non-`@defer` components compile cleanly. See `compile.ts` for the inline rationale.

The workflow runs on `pull_request`, `push` to `beta`, and `workflow_dispatch`. When `packages/vite-plugin-angular/package.json` bumps the `peerDependencies` floor, drop the lowest matrix slot(s). When a new Angular major ships, add a new floor slot. When an LTS patch supersedes the current pinned patch for v17/v18, bump the patch in the matrix.

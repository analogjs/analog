# Analog Angular Compiler

A lightweight Angular compiler that transforms decorators and signal-based reactive APIs into Ivy static definitions. Designed for fast dev server compilation via Vite, without requiring a full TypeScript program.

## Installation

```bash
npm install @analogjs/angular-compiler
```

Peer dependencies: `@angular/compiler` >=19, `@angular/compiler-cli` >=19, `@angular/build` >=19, `vite` >=6.

## Entry Point

| Import                       | Exports                                                                                                                                                                             | Use case                  |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `@analogjs/angular-compiler` | `compile()`, `scanFile()`, `scanDtsFile()`, `scanPackageDts()`, `collectImportedPackages()`, `jitTransform()`, `inlineResourceUrls()`, `extractInlineStyles()`, `generateHmrCode()` | Programmatic compiler API |

The compiler is integrated into `@analogjs/vite-plugin-angular` via the `experimental.useAnalogCompiler` flag — there is no separate Vite plugin entry point.

## Usage

### Via Analog Platform (recommended)

```ts
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

### Programmatic API

```ts
import {
  compile,
  scanFile,
  scanDtsFile,
  scanPackageDts,
  collectImportedPackages,
  jitTransform,
  inlineResourceUrls,
  extractInlineStyles,
} from '@analogjs/angular-compiler';

// Compile a single file
const result = compile(sourceCode, fileName, { registry });
// result.code — compiled JavaScript
// result.map — V3 source map
// result.resourceDependencies — external template/style paths read

// Scan a source file for Angular metadata (uses OXC Rust parser)
const entries = scanFile(code, fileName);
// entries: [{ selector, kind, className, fileName, inputs, outputs, ... }]

// Scan a .d.ts file for pre-compiled Angular declarations
const dtsEntries = scanDtsFile(dtsCode, fileName);
// Reads ɵɵDirectiveDeclaration/ComponentDeclaration/PipeDeclaration type params

// Scan all .d.ts files in an npm package
const pkgEntries = scanPackageDts('@angular/router', projectRoot);

// Collect bare-specifier package names from imports
const packages = collectImportedPackages(code, fileName);
// Set { '@angular/router', 'rxjs', ... }

// Inline templateUrl/styleUrl(s) in source code (OXC AST rewriting)
const inlined = inlineResourceUrls(sourceCode, fileName);

// Extract inline style strings for preprocessing (OXC parser)
const styles = extractInlineStyles(sourceCode, fileName);
```

## Architecture

```
Source file (.ts)
  │
  ├─ vite-plugin-angular (buildStart, when useAnalogCompiler is true)
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

The compiler is integrated into `@analogjs/vite-plugin-angular` as an alternative compilation path alongside ngtsc and the Angular Compilation API. When `experimental.useAnalogCompiler` is enabled, the vite plugin:

1. Scans all source files with `scanFile()` at build start to populate the `ComponentRegistry`
2. Inlines external resources (`templateUrl`, `styleUrl`) via OXC AST rewriting before compilation
3. Compiles each file on-demand with `compile()` during Vite's transform phase (runs with `enforce: 'pre'`)
4. Elides type-only imports via OXC AST usage analysis (removes imports that are only referenced in type positions — annotations, `implements`, generics — so single-file transpilers don't leak them to the browser)
5. Strips TypeScript syntax from the output via `vite.transformWithOxc()` (handles `import type`, generics, interfaces, `implements`, etc.)
6. Appends HMR code for Angular declarations in dev mode (components via `ɵɵreplaceMetadata`, directives/pipes via field-swap + invalidate)
7. Injects synthetic imports for NgModule-exported classes

The existing vite-plugin-angular plugins (build optimizer, router, vitest, etc.) continue to work alongside the analog compiler.

## Source Files

| File                  | Purpose                                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------------------------- |
| `compile.ts`          | Single-file AOT compiler: Ivy codegen via `@angular/compiler` APIs                                             |
| `registry.ts`         | OXC-based file scanner, extracts selectors, inputs, outputs, sourcePackage tracking                            |
| `metadata.ts`         | Decorator metadata extraction (`extractMetadata`, `detectSignals`, `detectFieldDecorators`)                    |
| `js-emitter.ts`       | Angular output AST → JavaScript string emitter (~4x faster than `ts.Printer`)                                  |
| `ast-translator.ts`   | Angular output AST → TypeScript AST translator (for complex expressions)                                       |
| `resource-inliner.ts` | OXC-based `templateUrl`/`styleUrl` inlining and inline style extraction                                        |
| `dts-reader.ts`       | OXC-based `.d.ts` scanner for pre-compiled Angular packages (selectors, inputs, outputs, sub-entry resolution) |
| `jit-transform.ts`    | JIT mode: decorator metadata arrays + constructor DI + signal downleveling + decorator removal                 |
| `jit-metadata.ts`     | JIT metadata helpers (constructor parameters, property decorators)                                             |
| `defer.ts`            | `@defer` dependency map builder                                                                                |
| `hmr.ts`              | HMR code generation: `ɵɵreplaceMetadata` for components, field-swap + invalidate for directives/pipes          |
| `styles.ts`           | Style preprocessing via Vite's `preprocessCSS` (OXC-based extraction)                                          |
| `type-elision.ts`     | OXC-based type-only import detection and elision (usage analysis, no type-checker needed)                      |
| `utils.ts`            | Type-only import detection (syntactic), class finder, `forwardRef` unwrapper                                   |

## What's Supported

### Decorators

| Decorator     | Static Fields                              | Notes                                           |
| ------------- | ------------------------------------------ | ----------------------------------------------- |
| `@Component`  | `ɵcmp`, `ɵfac`, `setClassMetadata`         | Full template compilation with Ivy instructions |
| `@Directive`  | `ɵdir`, `ɵfac`, `setClassMetadata`         | Host bindings, listeners, inputs/outputs        |
| `@Pipe`       | `ɵpipe`, `ɵfac`, `setClassMetadata`        | Pure and impure                                 |
| `@Injectable` | `ɵprov`, `ɵfac`, `setClassMetadata`        | `providedIn` variants                           |
| `@NgModule`   | `ɵmod`, `ɵinj`, `ɵfac`, `setClassMetadata` | Declarations, exports, providers, bootstrap     |

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
| `@Optional()`                         | Yes                                                                                  |
| `@Self()` / `@SkipSelf()` / `@Host()` | Yes                                                                                  |
| `@Attribute('name')`                  | Yes                                                                                  |
| Type-only imports (`import type`)     | Detected → `ɵɵinvalidFactory` for DI; auto-elided from output via OXC usage analysis |
| Class inheritance without constructor | `ɵɵgetInheritedFactory`                                                              |
| `forwardRef(() => X)` unwrapping      | Yes (in imports, providers, queries)                                                 |

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
| `schemas`                  | Passed through                                                |

### Signal APIs

| API                                          | Supported                                                               |
| -------------------------------------------- | ----------------------------------------------------------------------- |
| `signal()`                                   | Yes (preserved as-is)                                                   |
| `computed()`                                 | Yes (preserved as-is)                                                   |
| `input()` / `input.required()`               | Yes (signal input descriptors with required flag, transform extraction) |
| `model()` / `model.required()`               | Yes (generates input + `Change` output)                                 |
| `output()`                                   | Yes                                                                     |
| `viewChild()` / `viewChild.required()`       | Yes (signal queries)                                                    |
| `viewChildren()`                             | Yes (signal queries)                                                    |
| `contentChild()` / `contentChild.required()` | Yes (signal queries)                                                    |
| `contentChildren()`                          | Yes (signal queries)                                                    |
| `inject()`                                   | Yes (preserved as-is)                                                   |

### Template Features

| Feature                                                                                                 | Supported |
| ------------------------------------------------------------------------------------------------------- | --------- |
| `@if` / `@else if` / `@else`                                                                            | Yes       |
| `@for` with `track`, `@empty`                                                                           | Yes       |
| `@for` implicit variables (`$index`, `$first`, `$last`, `$even`, `$odd`, `$count`)                      | Yes       |
| `@switch` / `@case` / `@default`                                                                        | Yes       |
| `@defer` with all triggers (`on viewport`, `on idle`, `on timer`, `on hover`, `on interaction`, `when`) | Yes       |
| `@defer` sub-blocks (`@loading`, `@placeholder`, `@error`) with `minimum`                               | Yes       |
| `@defer` lazy dependency loading via `import()`                                                         | Yes       |
| Nested `@defer` inside control flow                                                                     | Yes       |
| `@let` declarations                                                                                     | Yes       |
| `{{ interpolation }}`                                                                                   | Yes       |
| `[property]` binding                                                                                    | Yes       |
| `(event)` binding                                                                                       | Yes       |
| `[(two-way)]` binding                                                                                   | Yes       |
| `[class.name]` / `[style.prop]`                                                                         | Yes       |
| `<ng-content>` (multi-slot projection)                                                                  | Yes       |
| Pipes in templates (with args, chained)                                                                 | Yes       |

### Cross-file Resolution

| Scenario                                                  | Supported                                                                 |
| --------------------------------------------------------- | ------------------------------------------------------------------------- |
| Component imports component                               | Yes (via registry, with input/output binding resolution)                  |
| Component imports directive                               | Yes (via registry)                                                        |
| Component imports pipe                                    | Yes (via registry)                                                        |
| Component imports NgModule                                | Yes (recursively expanded, handles nested NgModules with cycle detection) |
| Library imports (e.g. `RouterOutlet`)                     | Yes (lazily scanned from package `.d.ts` via `scanPackageDts()`)          |
| Library NgModule exports                                  | Yes (`.d.ts` scanner reads `ɵɵNgModuleDeclaration` type params)           |
| Library sub-entry imports (e.g. `@angular/material/tabs`) | Yes (via `sourcePackage` from package.json exports map)                   |
| Same-file imports                                         | Yes (file-local selector fallback)                                        |
| Self-referencing (recursive) components                   | Yes (component added to its own declarations)                             |
| Signal input bindings (`[prop]="value"`)                  | Yes (registry extracts `input()`, `input.required()`, `@Input()`)         |
| Signal output bindings (`(event)="handler()"`)            | Yes (registry extracts `output()`, `model()`, `@Output()`)                |
| Two-way binding (`[(prop)]="signal"`)                     | Yes (via `model()` input + output registration)                           |

## What's Not Supported

| Feature                      | Reason                                                          |
| ---------------------------- | --------------------------------------------------------------- |
| Template type checking       | Requires full `ts.Program`; use Angular Language Service in IDE |
| i18n / localization          | Out of scope (future consideration)                             |
| Partial / linker compilation | Handled by separate plugin                                      |
| Template source maps         | Angular compiler doesn't propagate sourceSpan to output AST     |
| Signal debug names           | Not implemented                                                 |
| `setClassDebugInfo`          | Not implemented                                                 |
| Spread imports (`...Module`) | Not implemented                                                 |

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
| i18n                            | Full ICU extraction + localization       | Not supported                                                   |
| Template type checking          | Full (`strictTemplates`)                 | Not supported                                                   |
| Incremental compilation         | `ts.Program` reuse                       | Per-file (Vite handles caching)                                 |
| Diagnostic messages             | Hundreds of template/binding errors      | Unresolved selector warnings only                               |
| Partial compilation (libraries) | `ɵɵngDeclareComponent`                   | Not in scope                                                    |
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

|                             | Local Compilation                | This compiler                   |
| --------------------------- | -------------------------------- | ------------------------------- |
| Output format               | `ɵɵngDeclareComponent` (partial) | `ɵɵdefineComponent` (final)     |
| Linker required             | Yes                              | No                              |
| Template compiled at        | Link time                        | Compile time                    |
| Selector matching           | Deferred to linker               | Done via global analysis plugin |
| Cross-version compatibility | Yes (stable declaration format)  | No (tied to Angular version)    |
| Use case                    | Library publishing (npm)         | Application dev server          |
| Requires `ts.Program`       | No                               | No                              |

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

Supported range: **Angular 19+**. Conformance tested against **Angular 17-21**.

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

| File                            | Tests | Coverage                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `jit-transform.spec.ts`         | 32    | Decorator conversion, member decorator removal (@Input, @Output, @ViewChild, @ContentChild), constructor parameter decorator removal (@Inject, @Optional), constructor DI, signal API downleveling, external resources, edge cases, ReflectionCapabilities integration                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `integration.spec.ts`           | 62    | Registry input/output extraction, cross-component binding, constant pool ordering, assignment precedence, templateUrl inlining, content projection, pipe chaining, template refs, two-way binding, computed signals, safe navigation, @defer triggers, @if alias, multi-component files, duplicate i0 prevention, OXC resource inlining, arrow object literal wrapping, .d.ts extraction, signal field preservation, decorator stripping, collectImportedPackages, non-Angular passthrough, template `<style>` merging, NgModule export expansion, member decorator removal, self-referencing components, .d.ts NgModule scanning, TS syntax preservation, lazy dependency arrays, directive compilation, recursive NgModule expansion, circular NgModule handling, HMR code generation (dynamic field copying, component/directive/pipe handling, local deps), sourcePackage sub-entry imports, sourcemap accuracy after type elision |
| `dts-reader.spec.ts`            | 7     | Directive/component/pipe extraction from `.d.ts`, signal inputs, aliased inputs, multiple classes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `component.spec.ts`             | 49    | All @Component features, signals (including required variants), control flow, defer, pipes, content projection, external resources, resource dependencies, providers, source maps                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `ast-translator.spec.ts`        | 43    | Every AST visitor method (expressions + statements), ngDevMode global                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `decorator-fields.spec.ts`      | 15    | @Input, @Output, @ViewChild, @ContentChild, @HostBinding, @HostListener field decorators                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `constructor-di.spec.ts`        | 8     | Constructor DI: @Inject, @Optional, inheritance, union types, multiple params                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `error-handling.spec.ts`        | 7     | Unknown decorators, undecorated classes, selectorless components, forwardRef, invalid templates                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `registry.spec.ts`              | 6     | All decorator types, multi-declaration, NgModule exports                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `cross-file-resolution.spec.ts` | 5     | Cross-file component, pipe, directive resolution                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `ngmodule.spec.ts`              | 3     | Compilation, providers, export resolution                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `injectable.spec.ts`            | 3     | `providedIn` variants                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `directive.spec.ts`             | 2     | Host bindings, exportAs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `pipe.spec.ts`                  | 2     | Pure and impure                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `compile.spec.ts`               | 2     | Original smoke tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `type-elision.spec.ts`          | 31    | Type-only import detection (annotations, implements, generics, mixed, unused, default imports), elision (whole-declaration removal, partial specifier removal, default import handling, mixed default+named, CRLF line endings, compiler output integration), MagicString integration (direct edits, sourcemap generation, mutated-code detection)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `conformance.spec.ts`           | 167   | Angular compliance test suite (v17-v21, 87%+ Ivy instruction match)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

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
bash packages/angular-compiler/scripts/setup-conformance.sh 19
ANGULAR_SOURCE_DIR=.angular-conformance npx vitest run packages/angular-compiler/src/lib/conformance.spec.ts

# Exact version
bash packages/angular-compiler/scripts/setup-conformance.sh 21.0.0

# Latest stable release (auto-detected via GitHub API)
bash packages/angular-compiler/scripts/setup-conformance.sh
bash packages/angular-compiler/scripts/setup-conformance.sh latest

# Latest prerelease (-next.N)
bash packages/angular-compiler/scripts/setup-conformance.sh next

# Local (auto-detects ~/projects/angular/angular if present)
npx vitest run packages/angular-compiler/src/lib/conformance.spec.ts
```

CI runs a matrix of Angular 17, 18, 19, 20, 21, latest, and next on every push to `feat/angular-compiler` via `.github/workflows/conformance.yml`.

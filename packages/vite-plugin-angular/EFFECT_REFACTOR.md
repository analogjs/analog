# Effect compiler refactor: enhancement log

This is the running implementation and evidence log for [analogjs/analog#2521](https://github.com/analogjs/analog/pull/2521), addressing [analogjs/analog#2519](https://github.com/analogjs/analog/issues/2519). The goal is a maintainable compiler that demonstrates Effect through useful composition, precise contracts, resource ownership, and reproducible compatibility checks. Source line count is informational rather than an acceptance gate.

The PR remains in progress. The results below identify the checks already exercised; they do not claim that CI has passed on a final commit. Performance benefits remain hypotheses until the controlled measurements are recorded.

## Implemented enhancements

### Milestone: core composition and strictness

The package suite passed **895 tests with six existing skips** at this milestone. Source typecheck, test typecheck, and package ESLint have passed during the refactor; the publication checks are being refreshed. The native caller boundary now drains admitted transformations before runtime disposal so an already-started transform can return its result during shutdown.

### Source graph as an explicit dependency

**Change:** all three compiler modes compose `CompilerSourceGraph` into the backend Layer. TypeScript options, configured roots, additional includes, and reference expansion are resolved before entering the native compiler adapter. Contracts are separate from live adapters. Invalid configuration retains TypeScript's diagnostic objects in a typed failure, and the source-graph cache is cleared when the compiler scope closes.

**Benefit:** tests can substitute a complete source graph without reading a TypeScript project from disk. Compiler modes share include discovery and cache ownership while preserving their existing reference-expansion policies. Fast mode now receives the same integration-provided includes. Effect's array operations also replace the compiler package's direct `es-toolkit` dependency.

**Evidence:** focused tests supply an in-memory graph and verify invalid TypeScript configuration diagnostics. The package's source and test typechecks remain required publication gates.

**Code:** [source graph contract](src/lib/compiler-source-graph.ts), [live graph](src/lib/compiler-source-graph-live.ts), [backend composition](src/lib/compiler-backend-live.ts), [graph tests](src/lib/compiler-source-graph.spec.ts).

### Serialized emission and explicit optimizer ownership

**Change:** lazy TypeScript emission and fast transforms share the compiler's permit. Reads recheck the current generation after acquiring it, and failed compilations remain failures for subsequent reads. Optimizer factories must register a disposer with their compiler owner, including when Astro disables the early optimizer cleanup hook. Owned resources are released even if compilation never initializes or compiler disposal fails.

**Benefit:** a transform cannot race a mutation of its compiler state. Disabling one cleanup hook no longer means losing the resource owner. Native callers admitted before shutdown can finish before their runtime is disposed.

**Evidence:** lifecycle and dependency-adapter tests cover cold shutdown, failed disposal, externally retained transformers, and output completion while shutdown is pending.

### Releasing retained native state

**Change:** compiler scope cleanup drops builders, source caches, emitted output, metadata, and resource-resolution caches. JIT inline styles retain separate compiler owners, so closing one environment preserves another environment's shared stylesheet and the last owner releases it.

**Benefit:** retaining a plugin object after shutdown does not require retaining its previous Angular program and compiler-generated JIT styles. Lazy emit callbacks capture the builder for their own compilation rather than reading a reassigned global builder.

**Code:** [native compiler](src/lib/angular-vite-plugin.ts), [source cache](src/lib/utils/source-file-cache.ts), [JIT style ownership](src/lib/utils/jit-inline-styles.ts).

### Typed stylesheet pipeline

**Change:** ngtsc and the Compilation API use the same `transformStylesheet` program and `StylesheetCompiler` service. The program retains its compiler requirement until the native adapter supplies it. Stylesheet requests carry the containing file, resource file, class identity, order, preprocessor, and registry explicitly.

**Benefit:** preprocessing, resource registration, and CSS compilation have one implementation. Externalized CSS enters Vite's CSS pipeline once. Inline CSS is compiled before returning to Angular. An empty compiled stylesheet remains a valid result. Failures carry a stage, filename, original cause, and useful message instead of silently discarding CSS.

**Evidence:** focused tests exercise substitute compiler Layers, externalization without duplicate compilation, empty CSS, typed requirements, and error classification. The existing host regression is being strengthened to require a reported stylesheet failure.

**Code:** [pipeline](src/lib/stylesheet-pipeline.ts), [pipeline tests](src/lib/stylesheet-pipeline.spec.ts), [TypeScript host](src/lib/host.ts), [Compilation API adapter](src/lib/compilation-api/compilation-api-plugin.ts).

### Composable compiler backend and scheduler

**Change:** `CompilerBackend` and `CompilationScheduler` separate native compiler work from scheduling. Pending invalidations combine into the following compilation, and a full invalidation supersedes individual file lists. Successful superseded generations defer completion to the newest queued generation.

**Benefit:** both Angular compilation paths share concurrency and readiness rules. Callers cannot consume an older successful snapshot while newer queued work is unfinished. The backend can be replaced by a test Layer without starting Angular workers.

**Evidence:** 100 queued invalidations coalesce into one following compilation while retaining all affected files. Tests verify newest-generation results, isolation, failure recovery, and readiness recorded before asynchronous Layer initialization.

**Code:** [backend contract](src/lib/compiler-backend.ts), [scheduler](src/lib/compilation-scheduler.ts), [scheduler tests](src/lib/compilation-scheduler.spec.ts).

### Explicit lifetime and cancellation ownership

**Change:** the native compiler session has a tagged lifecycle. It removes owned listeners, drains non-abortable work, and disposes its runtime. A cancelled waiter does not release Angular's shared mutable compiler. Subsequent build cycles open another scope after the previous scope closes.

**Benefit:** cancellation, shutdown, watch mode, and plugin reuse follow one ownership model. An abandoned caller cannot cause another compilation to overlap the still-running Angular operation.

**Evidence:** tests cover waiter cancellation, queued work during shutdown, repeated close, reopening during disposal, partial Layer acquisition failure, and exactly-once release.

**Code:** [session](src/lib/compiler-session.ts), [session tests](src/lib/compiler-session.spec.ts).

### Environment-specific compiler state

**Change:** Vite's `applyToEnvironment` hook creates separate compiler instances for client and server environments. The browser instance remains connected to Angular HMR. Server environments receive their own invalidation hook, including resource-change invalidation. Fast compilation uses the shared session for initialization and rescans.

**Benefit:** concurrent client/server builds have independent Angular state, configuration, and scopes. Closing one environment does not dispose the compiler used by another.

**Evidence:** the Analog application has completed its client/server build with environment isolation. Concurrent-environment, restart, and complete Vite-matrix qualification remain in progress. Server resource changes currently invalidate that environment's module graph; their cost must be measured.

**Code:** [environment adapter](src/lib/compiler-environments.ts), [fast compiler](src/lib/fast-compile-plugin.ts).

### One owned JavaScript transformer implementation

**Change:** dependency optimization, fallback linking, and build linking use `DependencyTransformer` and a shared native host. Workers are acquired lazily, work is serialized, and shutdown drains transformations before release. Acquisition, transformation, and release failures have explicit contracts.

**Benefit:** worker lifecycle logic is shared across esbuild and Rolldown and the other linker entry points. The build optimizer now has cleanup hooks. Expected transform failures are no longer described as infallible Effects.

**Evidence:** both dependency adapters are tested for lazy allocation, reuse, test-mode behavior, external ownership, failures, shutdown during work, and reacquisition after a build cycle.

**Code:** [transformer service](src/lib/javascript-transformer.ts), [dependency adapters](src/lib/compiler-plugin.ts), [adapter tests](src/lib/compiler-plugin.spec.ts).

### Bounded, observable transform caching

**Change:** `CacheStorage` and `TransformCache` compose disk storage with a memory cache bounded by both entry count and bytes. Native cache keys are validated branded SHA-256 values. Disk writes use unique temporary files and atomic rename. Only a missing file counts as a disk miss; other I/O failures remain visible. Cache namespaces include compiler, builder, TypeScript, Node, and format versions.

**Benefit:** long-running dev servers have a defined retention limit. Incorrect toolchain reuse and hidden permission/storage errors become easier to diagnose. Storage can be substituted in tests independently of the Angular worker.

**Evidence:** tests verify LRU behavior, memory accounting, cross-instance persistence, missing-entry versus I/O-failure behavior, and unsafe-key rejection. `TestClock` verifies measured work duration without real sleeps.

**Code:** [cache services](src/lib/utils/transform-cache.ts), [cache tests](src/lib/utils/transform-cache.spec.ts).

### Lazy, checked Angular private capabilities

**Change:** Angular's private builder exports are loaded when a capability is needed. Version-specific loading is centralized, callable exports are checked at the module boundary, and unsupported Compilation API selection produces an actionable error.

**Benefit:** importing the compiler or constructing a plugin does not start Angular workers. Private API assumptions are concentrated in one adapter instead of spreading across compiler consumers. The checks establish capability presence; the version matrix must still establish behavior.

**Code:** [toolchain adapter](src/lib/utils/devkit.ts).

### Strict source and test contracts

**Change:** the compiler package enables `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. Source and test typechecks are separate targets. Unsafe indexing is checked, native nullable identities are modeled, and fixture assertions require values to exist before inspecting them. Public options and integration/registry contracts are separated from implementation modules.

**Benefit:** missing values and optional-field semantics become compiler-checked. Public declarations can avoid pulling Effect and Angular private implementation types into older consumers. The latter is being qualified with installed-package declaration checks.

**Evidence:** source typecheck, test typecheck, and package ESLint passed together before the subsequent source-graph work. New changes are being checked again; the final requirement is zero diagnostics on the published PR head.

**Code:** [package tsconfig](tsconfig.json), [public entry](src/index.ts), [options](src/lib/plugin-options.ts), [integration contracts](src/lib/analog-plugin-types.ts), [registry contracts](src/lib/compiler/registry-types.ts).

### Configuration decoded at the native boundary

**Change:** Analog-owned plugin configuration is decoded once before compiler construction. Explicit `false` remains meaningful, explicit `undefined` selects the existing default, lazy tsconfig getters remain lazy, and malformed settings are rejected. Vite-owned configuration stays with Vite.

**Benefit:** errors such as a string-valued boolean or misspelled option fail near their source. Internal code receives a normalized contract rather than repeatedly interpreting loosely shaped options.

**Evidence:** tests cover defaults, false values, lazy getters, combined browser/server replacements, invalid compiler modes, incomplete replacements, and unknown keys.

**Code:** [option boundary](src/lib/plugin-options-schema.ts), [option tests](src/lib/plugin-options-schema.spec.ts).

### Structured resource identities and older-Vite guards

**Change:** component resource resolvers return relative/absolute path records instead of delimiter-concatenated strings. Request queries are separated from file paths, and HMR component IDs split at the final class separator. Compiler transform handlers enforce their source filters even on Vite releases that ignore hook filters.

**Benefit:** path relationships are checked by TypeScript. Resource names containing delimiters cannot be confused with encoded pairs. Older Vite releases receive the same filtering behavior as newer releases.

**Evidence:** resolver tests preserve the expected paths and cache behavior. The installed Vite 6.0 consumer passes default and Compilation API browser/HMR cases; fast browser and the expanded matrix remain to be recorded.

**Code:** [resource resolvers](src/lib/component-resolvers.ts), [request identities](src/lib/utils/module-id.ts).

### Dedicated Compilation API regression coverage restored

**Change:** `compilation-api-plugin.spec.ts` is restored as a dedicated suite. Constructor and configuration assertions do not depend on the stylesheet HMR fixture automatically running build hooks. The HMR file keeps its six stylesheet-focused cases.

**Benefit:** lifecycle ordering, root inclusion, iterable output, transform readiness, and HMR metadata have an identifiable regression suite. Test consolidation no longer obscures whether a constructor or hook was actually tested before compilation.

**Evidence:** the dedicated suite passes 13 tests. The package passed 884 tests with six existing skips before the additional stylesheet/source-graph tests were added; later counts will replace this checkpoint.

**Code:** [dedicated API suite](src/lib/compilation-api/compilation-api-plugin.spec.ts), [stylesheet HMR suite](src/lib/angular-vite-plugin-live-reload.spec.ts).

### Reproducible compatibility and CI repairs

**Change:** applicable public compiler compatibility fixes from [analogjs/analog#2520](https://github.com/analogjs/analog/pull/2520) are incorporated with attribution. These include compiler roots, HMR metadata, declaration refresh, Node bootstrap, and installed-package fixtures. CI path filters cover the compiler package and dependency/build metadata. Alternate compiler API tests avoid unrelated workspace prepare builds.

**Benefit:** compatibility is exercised against installed packages and actual Angular/Vite toolchains. Compiler changes trigger the relevant gates, and bootstrap failures can be distinguished from compilation failures.

**Evidence:** packed Vite 6.0/Angular 22 checks pass for the current fixture. The complete supported matrix, dependency lifecycle qualification, and final-head CI are still required.

### No-SSR route regression repaired during CI qualification

**Change:** the Nitro renderer reads Analog's no-SSR marker from matched route-rule headers before rendering. Response headers are applied too late, and h3 treats false-valued rules as resets.

**Benefit:** a client-only route does not accidentally execute Angular SSR or emit server-side JSON-LD.

**Evidence:** the previously failing real-browser JSON-LD regression now passes, together with all eight JSON-LD E2E tests. The full E2E suite will be rerun for final qualification.

**Code:** [Nitro integration](../platform/src/lib/nitro/analog-nitro-plugin.ts), [renderer](../platform/src/lib/nitro/renderers.ts), [existing E2E regression](../../apps/analog-app-e2e/tests/json-ld.spec.ts).

## Work in progress

- Qualify the composed source graph and retained-state cleanup across the installed consumer matrix.
- Finish native state cleanup, concurrent-environment and restart regressions, shared test fixtures, and remaining composition review.
- Run installed-package declaration checks and the complete Angular/Node/TypeScript/Vite matrix, including fast/full/partial, HMR, SSR, resource, and source-map cases.
- Record controlled baseline/candidate timing, memory, retained dependencies, duplicate work, and browser module-graph evidence. Investigate regressions rather than inferring speed from code structure.
- Run every required CI gate on the final PR head, inspect review findings, and update this log, the PR, and the issue with exact results.

## Attribution

Compatibility changes are derived from public Analog commits `5277af9f7547e95cc4cebaec9cb05085a23e8647`, `47ca5f2ac44a54c16f98f810d395357e5b6832e5`, and `b3482e5e06b474869cdc21e01ffb3267da35f267`. Effect architecture and TypeScript practices are applied as portable engineering patterns; no private application implementation or private package dependency is introduced.

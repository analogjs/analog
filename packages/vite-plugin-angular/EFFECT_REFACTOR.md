# Effect compiler refactor: implementation and evidence log

This is the canonical implementation and measurement record for [analogjs/analog#2521](https://github.com/analogjs/analog/pull/2521), tracked by [analogjs/analog#2519](https://github.com/analogjs/analog/issues/2519). The PR remains a draft. Native `angular(options): Plugin[]` usage is retained; Effect `4.0.0-rc.112` is a prerelease runtime dependency of the compiler package.

This log preserves historical measurements and records the HMR follow-up at `56001cdf1` separately. There is **no overall speedup claim**: import time and retained heap improve, while construction, several warm builds, development transforms, and independent SSR compilation have measured costs. The cause of the warm-build regressions has not been isolated.

## Composition and audit record

### Compiler operations and source discovery

`CompilerBackend` and `CompilerSourceGraph` expose precise success, failure, and service requirements. Live Layers own configuration/root/include discovery before native Angular work. Tests replace those capabilities without starting compiler workers. All three modes receive integration includes while preserving their own reference-expansion policies. TypeScript configuration failures retain native diagnostics. Closed scopes clear source, builder, metadata, output, and resource caches; lazy emit closures capture their own builder.

Code: [backend composition](src/lib/compiler-backend-live.ts), [source graph](src/lib/compiler-source-graph-live.ts).

### Scheduling, reads, and resource ownership

`CompilationScheduler` serializes compilation and lazy emission, coalesces pending file sets, lets full invalidation supersede individual files, and waits for the newest successful queued generation. `CompilerSession` owns listeners, its runtime, native callers, and finalizers. Cancelling a waiter does not abort Angular; shutdown drains admitted work before disposal. Reopening waits for the previous close. Optimizer factories register final release even where Astro disables an early cleanup hook.

Vite environment selection is keyed by environment identity and shares only in-flight initialization for that exact environment. Dependency scans cannot own the live compiler. Real client/server build tests hold the server transform until after client close. Browser HMR remains on the primary compiler. JIT inline styles have separate owners and are removed only when the last owner releases them. Server resource edits now publish dirtiness synchronously at the watcher boundary and invalidate known Angular resource owners and their Vite importers. Unknown ownership retains whole-graph invalidation. Compilation is deferred until the next server read; a request arriving during client HMR still enters the compiler read barrier. The historical measurements below used eager server compilation and whole-graph invalidation.

Restart qualification exposed overlapping server lifetimes: Vite can configure a replacement before closing its predecessor. Each resolved plugin configuration now owns a complete plugin set, including compiler, stylesheet registry, caches, and HMR middleware. Environment hooks retain that configuration when a later restart begins, so old cleanup cannot erase new state or detach new watchers. See [configuration lifetime adapter](src/lib/restartable-plugins.ts).

Code: [scheduler](src/lib/compilation-scheduler.ts), [session](src/lib/compiler-session.ts), [environment selection](src/lib/compiler-environments.ts).

### Stylesheets and HMR

The typed stylesheet program and replaceable compiler service handle preprocessing, externalization, inline compilation, and phase/file/cause failures for ngtsc, the Compilation API, and inline JIT styles. Empty CSS is valid. Fast-mode and external-registry paths now surface failures instead of dropping CSS. Registry refresh removes collision-prone basename aliases. JIT CSS is serialized as a JavaScript string, so backticks and interpolation text remain data.

Fast HMR uses a bidirectional resource index: every component sharing a template or stylesheet is invalidated, old references are removed, and paths are normalized. HMR metadata targets the original live class across successive module evaluations. Windows registry filenames and Vite module IDs are normalized before identifying those declarations. Packed browser tests update a template, a stylesheet, and resources shared by two components; the separate runtime protocol measures file-write-to-DOM/computed-style latency.

Ordinary component CSS now uses Angular's native metadata replacement. Explicitly externalized component CSS in the Compilation API retains a full reload because Angular's original stylesheet link can otherwise be reattached after Vite replaces it, overriding newer rules. Registry ownership also recognizes CSS cached by the browser after restart without a new module-graph request. Eligible template and ordinary component-CSS HMR preserve instance state; an external-style full reload resets it. Windows ngtsc external-style references use Vite filesystem URLs in normal emit and HMR metadata, preventing drive letters from being interpreted as browser URL schemes.

Angular HMR identifiers use the compiler host's filename casing policy. Update messages now preserve class-name case while canonicalizing file paths, and middleware resolves canonical requests back to actual Vite module IDs. Compilation API template updates use the same lookup against known emitted files. This covers projects nested under directories containing uppercase letters on Windows.

Code: [stylesheet pipeline](src/lib/stylesheet-pipeline.ts), [resource ownership](src/lib/resource-dependencies.ts), [HMR metadata](src/lib/compiler/hmr.ts).

### Transformers and caches

Dependency optimization, fallback linking, and build linking share a lazy `DependencyTransformer` host with typed acquisition/transform/release errors, serialized work, and drained shutdown. Storage is replaceable through `CacheStorage`; `TransformCache` adds LRU limits of 256 entries and 64 MiB. Namespaces include compiler, builder, TypeScript, Node, and format versions.

Native cache keys must be 64 lowercase hexadecimal characters. ENOENT is a miss; other I/O is a typed failure. Publication writes an exclusive temporary file and creates a no-replace hard link; an existing complete entry wins. This does not defend parent directories controlled by a local adversary. `ANALOG_TRANSFORM_CACHE=0` disables disk persistence while retaining bounded memory. TestClock accounting and coalescing counts are correctness evidence, not benchmarks.

Code: [transformer lifecycle](src/lib/javascript-transformer.ts), [cache services](src/lib/utils/transform-cache.ts).

### TypeScript and native boundaries

Source and tests enable `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`, with separate typecheck targets. Analog-owned options decode once, preserve explicit false and lazy getters, normalize undefined, and reject malformed or unknown settings. The migration guide documents this behavioral tightening and the new visible stylesheet errors. Angular private capabilities are loaded lazily and checked centrally; installed-version tests qualify behavior.

The public root declaration contract is Effect-free and passes packed checks with `skipLibCheck: false`. Shipped internal declarations retain Effect implementation types; package exports do not make those supported public subpaths. Pure compiler algorithms and synchronous TypeScript host callbacks remain native. Structured resource identities replace delimiter-joined path pairs, and handlers enforce filters on Vite releases that ignore hook filters. The dedicated Compilation API regression suite is restored, with 13 tests separate from the six stylesheet HMR cases.

The transferable Effect/TypeScript practices are explicit service/error channels, Layer composition at native boundaries, scoped lifetimes, one decode of owned configuration, checked optional/indexed values, and substitute test capabilities. No private application implementation or private dependency was imported. More infrastructure and tests increase line count; net reduction is not an acceptance gate.

Code: [public entry](src/index.ts), [option decoder](src/lib/plugin-options-schema.ts), [toolchain adapter](src/lib/utils/devkit.ts), [packed qualification](scripts/compiler-vite-fixture.mjs).

## HMR follow-up: behavior and tradeoffs

This follow-up replaces the earlier PR's HMR paths. Historical results remain attributed to their original compiler revisions. It does not remove the separate SSR compiler or change production compilation, public `angular()` options, eager integration invalidation, or shutdown's admitted-work drain.

| Code path                                                            | Earlier PR behavior                                                                                          | Current behavior and benefit                                                                                                                                                                           | Tradeoff / fallback                                                                                                                                                        |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server resource change (`compiler-environments`, `compiler-session`) | Each client edit also awaited a server compilation and invalidated the whole SSR graph.                      | Watcher publishes dirty resource IDs immediately. Known owners and importers are invalidated; edits coalesce until the next server read. Browser-only editing avoids unused SSR compilation.           | The next SSR request pays compilation cost. Unknown ownership invalidates the whole graph. This does not reduce cold SSR initialization cost.                              |
| Read versus edit race (`compiler-session`)                           | Reads waited for eagerly queued generations.                                                                 | A read flushes deferred work; edits during admitted reads queue a newer generation. Reads retain the existing latest-generation barrier.                                                               | Extra dirtiness/reader bookkeeping. Close discards never-requested dirty work but still drains admitted native calls; restart owns a fresh scope.                          |
| ngtsc emit (`angular-vite-plugin`)                                   | Changed owners could be emitted once during compilation and again when middleware or transform read them.    | Each source emits once per compiler generation, including its map and HMR metadata. Subsequent reads reuse that generation's output.                                                                   | The cache is intentionally generation-local; TS/program changes still regenerate output and diagnostics.                                                                   |
| Shared resources (`resource-dependencies`, compiler hosts)           | Fast mode tracked direct resources; other paths often relied on Vite resource lookup and broad invalidation. | Angular owners plus preprocessor dependencies identify all affected components. Sass partial edits reach their owning stylesheet.                                                                      | Dependency edges must be replaced and released. Unrecognized changes retain conservative reload/invalidation; Angular's Compilation API can decline HMR.                   |
| Default / Compilation API component CSS                              | Enabling HMR automatically externalized styles; CSS commonly reloaded the document and reset state.          | Ordinary styles stay in Angular metadata and use Angular component HMR. CSS and template edits retain component instance state.                                                                        | Angular recreates views: focus, selection and child-view state are not guaranteed. This is component replacement, not a DOM-preserving CSS swap.                           |
| CSS integrations (`analog-plugin-interop`, stylesheet pipeline)      | Component CSS re-entered Vite's plugin pipeline automatically during HMR.                                    | Vite preprocessing and PostCSS remain available through `preprocessCSS`. `@tailwindcss/vite` keeps external styles automatically; other integrations can call existing `externalizeComponentStyles()`. | Arbitrary Vite CSS transform hooks require externalization. That path can reload and lose state. Fast mode continues its existing inline-style pipeline.                   |
| Fast component replacement (`compiler/hmr`)                          | Donor metadata could change the component definition/factory's class identity.                               | Replacement definitions and factories keep targeting the original live class across successive updates.                                                                                                | Uses Angular's private replacement API; directives/pipes and failed replacements retain reload fallback. Fast-mode ordinary method changes can still need a manual reload. |
| Compatibility / disabled branches                                    | HMR availability relied on configuration and private API shape.                                              | Angular 19.0.0 reloads around its upstream `Map.remove` bug; 19.0.1+ uses native HMR. Vite `server.hmr: false` and Analog `liveReload: false` disable replacement.                                     | Angular 17/18 and JIT retain compatibility behavior; Compilation API remains version-gated. Vite 6–8 use progressive fallbacks.                                            |

A final source-read follow-up (`d1459a857`) extends the watcher boundary to TypeScript: it publishes compiler dirtiness and calls Vite's source-module invalidation before an incoming SSR read can reuse cached JavaScript. Compiler build-info files are excluded. The default, fast and Compilation API paths pass direct source/resource SSR race checks on Vite 6.0, 6.4 and 8.2: 36 edit pairs, 18 restarts and 900 queued callers. The benchmark and 15-minute-soak compiler remains explicitly frozen to `56001cdf1`; this additional TypeScript branch does not change the measured resource-edit path. Final package checks pass 936 tests (six existing skips), source/test typechecks, ESLint, build and artifact validation. The shared-Sass fixture also asserts the actual Emulated/None/ShadowDom DOM behavior in all nine combinations.

The [migration guide](../../apps/docs-analog/src/content/guides/migrating-v2-to-v3.md) includes the stylesheet integration opt-in and development SSR timing change. Browser qualification checks repeated template → CSS → template updates, shared resources, enabled/disabled HMR, JIT, restart and SSR isolation. A separate packed Sass fixture checks two owners and repeated partial edits in Emulated, None and ShadowDom modes.

### Further resource-invalidation correction

The [downside investigation](HMR_DOWNSIDES.md) follows the `0cf3f8002` control in a separate worktree. Known owners now invalidate all loaded Vite query variants; unloaded owners no longer cause unrelated SSR modules to be discarded. File-invalidation timestamps also prevent a new SSR request from reusing a pre-edit pending Vite transform. Unknown ownership still invalidates the whole graph. This changes the environment adapter only; it does not speculate server compilation, change CSS replacement, or fix the historical first-SSR regression. New measurements and their controls are separate in [hmr-downsides-qualification.json](hmr-downsides-qualification.json).

### HMR comparison (`56001cdf1`)

Angular 22.0.0, TypeScript 6.0.2, Node 24.15.0, pnpm 10.33.0, Chromium via Playwright 1.59.1; Linux 6.17 x86_64 on AMD EPYC 7773X. Three sides: compatibility-corrected alpha `4225f4509`, the original PR compiler at `4305f920b`, and optimized compiler `56001cdf1`. Five fresh processes per side, alternating order, ten template/CSS edit pairs per process. All 45 processes and 450 edit pairs passed. These comparative runs were serial and separate from other local qualification jobs.

Each median is the median of five per-process means; p95 pools the 50 individual edits. Times include file write, watcher, websocket, compilation and browser DOM/computed-style observation. All three sides use the same explicit SSR graph refresh policy for timing comparability. Native SSR freshness is tested separately without that helper. [Machine-readable HMR results and raw-file hashes](hmr-qualification.json) retain per-process observations and archive provenance.

| Vite  | Edit     | Corrected alpha median / p95 (ms) | Original PR median / p95 (ms) | Optimized median / p95 (ms) |
| ----- | -------- | --------------------------------: | ----------------------------: | --------------------------: |
| 6.0.0 | Template |                      69.5 / 113.0 |                 127.3 / 174.1 |                63.2 / 122.1 |
| 6.0.0 | CSS      |                     171.4 / 196.8 |                 134.1 / 185.0 |                 48.5 / 63.6 |
| 7.3.6 | Template |                      75.4 / 123.5 |                 133.0 / 180.7 |                57.8 / 108.7 |
| 7.3.6 | CSS      |                     137.4 / 158.0 |                 152.2 / 164.7 |                 46.9 / 64.7 |
| 8.2.2 | Template |                       63.2 / 86.8 |                  94.8 / 109.0 |                 50.6 / 73.8 |
| 8.2.2 | CSS      |                     153.4 / 160.5 |                 154.3 / 174.1 |                 56.7 / 65.5 |

Template median latency is **1.88–2.30× faster than the original PR** and 9–23% lower than corrected alpha. CSS median latency is **2.72–3.24× faster than the original PR**. Vite 6's template p95 remains 8% above alpha despite a lower median; these fixtures do not establish a universal latency win. Candidate CSS retained state in **150/150 edits**, checked both immediately and after rendered SSR to detect delayed reloads; both older sides retained it in 0/150. All template edits retained state on all sides.

| Vite  | First SSR: alpha / original PR / optimized (ms) | SSR after edits: alpha / original PR / optimized (ms) |
| ----- | ----------------------------------------------: | ----------------------------------------------------: |
| 6.0.0 |                           237.7 / 723.0 / 730.5 |                                    42.3 / 20.7 / 48.2 |
| 7.3.6 |                           229.3 / 714.9 / 723.1 |                                    40.5 / 25.4 / 47.1 |
| 8.2.2 |                           228.7 / 740.0 / 731.6 |                                    34.7 / 24.1 / 40.2 |

The next SSR read now includes deferred compiler work: 40–48 ms versus the earlier PR's 21–25 ms in this fixture. In this one-component fixture, cold SSR remains about three times alpha's cost because independent server compilation remains. SSR measures module import plus Angular rendering, excluding HTTP transport and the subsequent computed-style assertion. This HMR follow-up makes no new production-build, cold-start or memory-improvement claim.

### Larger fixtures and sustained qualification

Five fresh processes per side on Vite 8.2.2 with 100 and 500 components; ten template/CSS edit pairs in every process. All 30 processes and 300 edit pairs passed. The root template/CSS changes while all child components are asserted in browser and rendered SSR. This measures larger component trees, not many independent simultaneous file edits. Values remain process-mean medians / pooled edit p95.

| Components | Edit     | Corrected alpha (ms) | Original PR (ms) | Optimized (ms) |
| ---------- | -------- | -------------------: | ---------------: | -------------: |
| 100        | Template |        133.1 / 181.2 |    166.0 / 243.3 |  106.8 / 156.4 |
| 100        | CSS      |        383.2 / 454.4 |    397.0 / 472.8 |   97.8 / 125.2 |
| 500        | Template |        409.4 / 593.3 |    517.0 / 723.9 |  305.6 / 451.5 |
| 500        | CSS      |       903.9 / 1186.5 |  1071.4 / 1426.4 |  279.8 / 369.4 |

Candidate CSS retained state in 100/100 larger-fixture edits. Together with the small fixtures, all 250 candidate CSS edits retained state. SSR and shutdown measurements remain available in the JSON; the cold-SSR ratios in the one-component table must not be generalized to these larger trees.

Nine new **15-minute, 100-component** soaks cover ngtsc, fast and Compilation API on Vite 6.0.0 (Environment Runner), 6.4.3 and 8.2.2 (legacy SSR loader). All **540 edit pairs, 27 restarts and 900 queued invalidations** passed. Each CSS edit starts an SSR read at the watcher boundary while client HMR is in flight; rendered HTML/CSS must be fresh without explicit graph refresh. CSS and template state remain preserved between intentional server restarts. Soaks run concurrently for correctness and memory observation; their latencies are not comparative evidence.

| Vite  | Mode  | Sampled peak Node RSS (MiB) | Heap after close/GC (MiB) | Shutdown with 100 queued calls (ms) |
| ----- | ----- | --------------------------: | ------------------------: | ----------------------------------: |
| 6.0.0 | api   |                      1203.0 |                     120.2 |                               620.9 |
| 6.0.0 | fast  |                       477.8 |                     121.0 |                                10.0 |
| 6.0.0 | ngtsc |                       862.5 |                     135.0 |                               228.1 |
| 6.4.3 | api   |                      1187.3 |                     113.1 |                               591.6 |
| 6.4.3 | fast  |                       502.7 |                     115.0 |                                10.7 |
| 6.4.3 | ngtsc |                       851.8 |                     129.9 |                               218.3 |
| 8.2.2 | api   |                      1823.1 |                     128.4 |                               621.6 |
| 8.2.2 | fast  |                      1088.9 |                     133.2 |                                11.0 |
| 8.2.2 | ngtsc |                      1494.1 |                     146.1 |                               219.4 |

RSS excludes Chromium and is sampled once per second; it is not a kernel high-water measurement. The JSON also records kernel peak RSS and intermediate GC checkpoints. These durations and fixtures do not establish leak freedom or a memory improvement over the original PR.

### Reproduce the comparison

Use Node 24.15.0 and pnpm 10.33.0. Build and pack the three revisions separately; the alpha control includes only the two compatibility corrections described in the original qualification. Keep timing phases serial and separate from other qualification jobs.

```sh
pnpm exec nx run vite-plugin-angular:build
node packages/vite-plugin-angular/scripts/compiler-hmr-benchmark.mjs --root=dist/hmr-paired --control=/path/control.tgz --pr=/path/original-pr.tgz --candidate=/path/optimized.tgz
node packages/vite-plugin-angular/scripts/compiler-hmr-benchmark.mjs --root=dist/hmr-100 --control=/path/control.tgz --pr=/path/original-pr.tgz --candidate=/path/optimized.tgz --vites=8.2.2 --components=100
node packages/vite-plugin-angular/scripts/compiler-hmr-benchmark.mjs --root=dist/hmr-500 --control=/path/control.tgz --pr=/path/original-pr.tgz --candidate=/path/optimized.tgz --vites=8.2.2 --components=500
```

## Supporting work

- [analogjs/analog#2520](https://github.com/analogjs/analog/pull/2520) supplies public compatibility work for roots, HMR metadata, declarations, Node bootstrap, and packed fixtures. Reconcile when it merges.
- Source-map behavior adapts [analogjs/analog#2506](https://github.com/analogjs/analog/pull/2506): production honors Vite's map setting, fast mode composes the final OXC/esbuild map, and the Compilation API retains its native inline map until Vite consumes it. Checked normalization preserves contents, extension fields, and URL roots; packed tests assert source file and line.
- The supporting `platform` no-SSR repair reads the matched route-rule header before rendering. It is distinct from the compiler refactor and is not shipped by updating only `@analogjs/vite-plugin-angular`.

## Completed qualification (6dea9aeff)

Qualification uses compiler `6dea9aeff` and alpha `4225f4509`, Angular 22.0.0, TypeScript 6.0.2, Node 24.15.0, pnpm 10.33.0, and Chromium via Playwright 1.59.1. Linux host: AMD EPYC 7773X, 128 logical CPUs. [Machine-readable results and raw-file hashes](https://github.com/benpsnyder/analog/blob/refactor/effect-compiler-session/packages/vite-plugin-angular/qualification.json). Production comparisons use untouched alpha. Browser comparisons use alpha with only the missing Rolldown test-mode argument and the older-Vite FESM fallback-linker guard corrected; they are explicitly a compatibility-corrected control.

### Production comparison

Five fresh processes per side, alternating order; 20 standalone Angular components and three builds per process. Every build asserts 20 emitted component definitions. Warm time is the mean of builds two and three; tables show five-process medians [min, max]. Heap uses decimal MB and is sampled after explicit GC with all three closed plugin sets retained. No overall speedup is claimed.

| Vite / mode   | Metric                              |            Untouched alpha |                Refactor | Change |
| ------------- | ----------------------------------- | -------------------------: | ----------------------: | -----: |
| 6.0.0 / ngtsc | Import                              |    877.7 [869.6, 889.1] ms | 712.0 [688.9, 727.5] ms | -18.9% |
| 6.0.0 / ngtsc | Construct                           |    1.237 [1.190, 1.288] ms | 5.190 [5.175, 5.243] ms | 319.7% |
| 6.0.0 / ngtsc | First build                         |   986.3 [950.5, 1029.2] ms | 962.7 [907.9, 995.7] ms |  -2.4% |
| 6.0.0 / ngtsc | Warm build                          |    523.2 [518.9, 546.5] ms | 527.4 [459.0, 559.5] ms |   0.8% |
| 6.0.0 / ngtsc | Heap after three closed plugin sets | 266.41 [266.40, 266.42] MB | 63.23 [63.20, 63.24] MB | -76.3% |
| 6.0.0 / fast  | Import                              |    866.2 [854.6, 877.9] ms | 707.8 [692.4, 714.8] ms | -18.3% |
| 6.0.0 / fast  | Construct                           |    1.199 [1.116, 1.423] ms | 5.214 [5.174, 6.197] ms | 335.0% |
| 6.0.0 / fast  | First build                         |    306.0 [295.0, 322.3] ms | 336.1 [335.1, 345.6] ms |   9.8% |
| 6.0.0 / fast  | Warm build                          |    145.1 [144.9, 150.1] ms | 172.6 [160.4, 177.0] ms |  18.9% |
| 6.0.0 / fast  | Heap after three closed plugin sets |    59.38 [59.32, 59.39] MB | 55.69 [55.68, 55.69] MB |  -6.2% |
| 8.2.2 / ngtsc | Import                              |    882.7 [875.3, 886.3] ms | 715.5 [699.8, 725.9] ms | -18.9% |
| 8.2.2 / ngtsc | Construct                           |    1.213 [1.135, 1.473] ms | 4.987 [4.847, 5.125] ms | 311.1% |
| 8.2.2 / ngtsc | First build                         |    810.4 [773.7, 846.9] ms | 859.1 [805.8, 921.4] ms |   6.0% |
| 8.2.2 / ngtsc | Warm build                          |    476.7 [463.5, 486.6] ms | 529.1 [486.1, 544.5] ms |  11.0% |
| 8.2.2 / ngtsc | Heap after three closed plugin sets | 263.19 [263.17, 263.22] MB | 60.21 [60.19, 60.21] MB | -77.1% |
| 8.2.2 / fast  | Import                              |    884.7 [875.6, 889.2] ms | 723.1 [707.3, 737.1] ms | -18.3% |
| 8.2.2 / fast  | Construct                           |    1.206 [1.192, 1.252] ms | 5.192 [5.110, 5.242] ms | 330.5% |
| 8.2.2 / fast  | First build                         |    206.9 [206.3, 220.1] ms | 218.4 [214.6, 226.6] ms |   5.5% |
| 8.2.2 / fast  | Warm build                          |    127.2 [125.4, 132.6] ms | 131.6 [127.6, 134.0] ms |   3.4% |
| 8.2.2 / fast  | Heap after three closed plugin sets |    56.28 [56.26, 56.29] MB | 52.45 [52.45, 52.46] MB |  -6.8% |

### Dependency and package cost

The qualified tarball is **347,764 bytes (339.61 KiB)** versus untouched alpha **311,339 bytes (304.04 KiB)**. SHA-256: `cff8c1fcfdc0ac48b26fc258e779c01851e59936f1a0e1511dd44e386cf123ff`. This is a compiler-tarball increase; the earlier smaller 52c8825cf tarball remains historical evidence. Effect package-file contents total 47,533,320 bytes versus alpha es-toolkit's 4,231,890 bytes. Those totals are not incremental shared-pnpm-store allocation or download size. Effect loads in the Node compiler, while checked application/browser graphs exclude it.

### Paired browser HMR and rendered SSR

Five fresh processes per side on each Vite version; ten template/CSS edit pairs per process. All 30 processes passed: 150/150 candidate and 150/150 control template-state checks and rendered HTML/CSS checks. Latencies are file write → changed DOM/computed style. SSR time is module import plus Angular renderApplication, excluding the browser CSS assertion and HTTP transport. Each rendered document is checked in a fresh browser context, covering both linked control CSS and inline candidate CSS. Both paired sides use the same explicit SSR-module refresh policy; the native soak cases below do not use that helper. Each edit metric first averages the ten edits within a process, then reports the five-process median [min, max].

| Vite  | Metric                     |    Corrected alpha control |                   Refactor | Change |
| ----- | -------------------------- | -------------------------: | -------------------------: | -----: |
| 6.0.0 | Template write → DOM       |    63.55 [59.89, 64.68] ms |  117.33 [99.49, 124.62] ms |  84.6% |
| 6.0.0 | CSS write → computed style | 182.57 [162.67, 183.36] ms | 135.23 [103.09, 161.06] ms | -25.9% |
| 6.0.0 | First rendered SSR         | 213.09 [208.77, 236.96] ms | 700.30 [618.88, 703.77] ms | 228.6% |
| 6.0.0 | Rendered SSR after edits   |    32.62 [30.49, 39.26] ms |    19.18 [17.83, 21.58] ms | -41.2% |
| 6.0.0 | Idle close                 |       1.72 [1.70, 1.78] ms |       2.64 [2.56, 2.77] ms |  53.5% |
| 7.3.6 | Template write → DOM       |    78.82 [60.57, 91.61] ms | 111.23 [101.15, 131.71] ms |  41.1% |
| 7.3.6 | CSS write → computed style |  125.72 [94.98, 148.25] ms | 147.51 [126.54, 152.66] ms |  17.3% |
| 7.3.6 | First rendered SSR         | 233.65 [217.19, 235.77] ms | 655.10 [649.15, 719.52] ms | 180.4% |
| 7.3.6 | Rendered SSR after edits   |    31.38 [27.58, 37.69] ms |    19.15 [17.47, 20.42] ms | -39.0% |
| 7.3.6 | Idle close                 |       1.83 [1.81, 1.90] ms |       2.85 [2.76, 3.18] ms |  55.6% |
| 8.2.2 | Template write → DOM       |    61.89 [57.89, 66.87] ms |    91.60 [84.52, 94.57] ms |  48.0% |
| 8.2.2 | CSS write → computed style | 152.17 [147.95, 153.26] ms | 152.31 [149.40, 153.04] ms |   0.1% |
| 8.2.2 | First rendered SSR         | 202.28 [186.22, 202.53] ms | 701.39 [693.97, 722.92] ms | 246.7% |
| 8.2.2 | Rendered SSR after edits   |    36.63 [29.32, 38.53] ms |    18.64 [17.87, 20.53] ms | -49.1% |
| 8.2.2 | Idle close                 |       1.91 [1.83, 2.39] ms |       2.79 [2.70, 2.86] ms |  45.6% |

Untouched alpha failed startup in the original 5/5 runs because its positional argument incorrectly enabled test mode and omitted the Rolldown linker. The refactor fixes that handoff with named options. The original failures are preserved; the corrected control does not replace untouched-alpha evidence or attribute the startup repair to Effect alone.

### Sustained edit, restart, and shutdown qualification

Nine independent **15-minute, 100-component** processes cover ngtsc, fast, and Compilation API modes. Each performs 60 template/CSS edit pairs, checks every child in the browser and rendered SSR, restarts three times, and admits 100 compiler invalidations immediately before close. All **540 edit pairs, 27 restarts, and 900 admitted caller promises** passed. Template updates preserve the current counter; component-CSS full reloads intentionally reset browser state. The final cohort runs concurrently to qualify behavior and memory; its timings are not comparative performance benchmarks.

| Vite / SSR loader | Mode  | Template + CSS edit pairs | Restarts | Queued callers drained |     Close |
| ----------------- | ----- | ------------------------: | -------: | ---------------------: | --------: |
| 6.0.0 / runner    | ngtsc |                        60 |        3 |              100 / 100 | 212.33 ms |
| 6.0.0 / runner    | fast  |                        60 |        3 |              100 / 100 |   9.71 ms |
| 6.0.0 / runner    | api   |                        60 |        3 |              100 / 100 | 645.86 ms |
| 6.4.3 / compat    | ngtsc |                        60 |        3 |              100 / 100 | 214.59 ms |
| 6.4.3 / compat    | fast  |                        60 |        3 |              100 / 100 |  10.10 ms |
| 6.4.3 / compat    | api   |                        60 |        3 |              100 / 100 | 624.14 ms |
| 8.2.2 / compat    | ngtsc |                        60 |        3 |              100 / 100 | 217.77 ms |
| 8.2.2 / compat    | fast  |                        60 |        3 |              100 / 100 |  10.01 ms |
| 8.2.2 / compat    | api   |                        60 |        3 |              100 / 100 | 637.84 ms |

### Sustained Node memory

RSS and heap use MiB (1,048,576 bytes). Kernel peak RSS is the Node process high-water mark; sampling runs once per second, with explicit-GC checkpoints after ten edits and each restart. The trajectory is ready → before compiler close → after close. Browser contexts are closed before the last two samples, and the closed server remains referenced. These measurements exclude Chromium and separate child processes. Whole-graph SSR reevaluation also produces Angular development-mode duplicate-component-ID warnings; browser page-error checks remain clean. The measurements expose retained growth; they do not establish zero retention, a fixed memory ceiling, or multi-hour leak freedom.

| Vite  | Mode  | Kernel peak RSS (MiB) | RSS ready → before close → closed (MiB) | Heap ready → before close → closed (MiB) |
| ----- | ----- | --------------------: | --------------------------------------: | ---------------------------------------: |
| 6.0.0 | ngtsc |                 828.4 |                   641.3 → 825.2 → 803.8 |                    283.7 → 305.9 → 136.8 |
| 6.0.0 | fast  |                 495.0 |                   413.0 → 459.8 → 458.8 |                    106.6 → 120.1 → 118.7 |
| 6.0.0 | api   |                1197.0 |                  928.4 → 1059.0 → 928.7 |                    105.1 → 119.8 → 117.5 |
| 6.4.3 | ngtsc |                 904.9 |                   629.7 → 902.4 → 876.7 |                    275.0 → 298.7 → 130.0 |
| 6.4.3 | fast  |                 509.9 |                   394.7 → 463.1 → 462.1 |                     97.9 → 113.2 → 112.3 |
| 6.4.3 | api   |                1216.0 |                  961.1 → 1072.7 → 941.2 |                     96.4 → 113.6 → 111.8 |
| 8.2.2 | ngtsc |                1589.4 |                1198.6 → 1548.6 → 1541.8 |                    281.7 → 315.2 → 146.6 |
| 8.2.2 | fast  |                1099.7 |                1045.6 → 1058.0 → 1053.6 |                    104.9 → 131.4 → 130.5 |
| 8.2.2 | api   |                1802.0 |                1582.6 → 1667.7 → 1537.2 |                    103.0 → 129.2 → 127.3 |

### Middleware shutdown

All 12 additional SSR middleware cases passed: Vite 6.0.0 and 8.2.2 × three compiler modes × zero or 100 queued invalidations. Each imports a 20-component SSR module without opening an HTTP listener, closes the server, verifies every admitted caller settled, and exits. This qualifies the supported middleware host lifecycle. Earlier probes that transformed client modules on an unstarted non-middleware server remain excluded; they are not listening-server or middleware shutdown measurements.

### Vite 6.0 legacy SSR boundary

A plain-JavaScript reproduction **without Analog** confirms Vite 6.0.0 retains its legacy SSR runner across server.restart; a subsequent module load times out. Vite 6.4.3 passes that same reproduction. The 6.0 soak therefore uses Vite's [Environment Runner](https://vite.dev/guide/api-environment-frameworks#runnabledevenvironment); 6.4.3 and 8.2.2 use the legacy ssrLoadModule API. Hosts on 6.0 needing SSR restart must use the runner or upgrade within Vite 6. This is an upstream host limitation, not an unpaid Effect refactor fix.

### Completed acceptance

- [x] Browser file-write-to-DOM/CSS latency and template-state retention, paired on Vite 6/7/8.
- [x] Rendered SSR HTML/CSS after edits, including whole-environment invalidation.
- [x] Idle, queued, and middleware shutdown; all admitted caller promises drain.
- [x] Sustained RSS/heap observations in nine 15-minute edit/restart processes.
- [x] 924 compiler-package tests passed, with six existing skips; source/test typechecks, ESLint, build, and artifact validation passed.
- [x] 13 installed consumer CI cells: 12 Linux Angular 17–22/Vite 6–8 cells plus Angular 22/Vite 8.2.2 on Windows. Expanded runtime cases cover 100 components, edits after restart, and queued close.

The four previously unpaid categories are complete for this explicit protocol. Chromium, these fixtures/toolchains, and the stated duration bound the results. Warm-build regressions, independent SSR memory, prerelease-dependency acceptance, other browsers, and multi-hour behavior are not claimed away. Final GitHub checks are reverified after the documentation push.

### Reproduction

Use Node 24.15.0 and pnpm 10.33.0 for the Angular 22 measurements. Build and pack each revision separately with normal native dependency scripts enabled. Prepare matching installed consumers named `vite{6,7,8}-{control,candidate}` using Vite 6.0.0/7.3.6/8.2.2, plus `vite6-latest-candidate` on 6.4.3. Preserve the two control-only corrections described above and the tarball hashes.

- `pnpm exec nx run vite-plugin-angular:build` builds and validates the package.
- `node packages/vite-plugin-angular/scripts/compiler-vite-smoke.mjs --angular=22.0.0 --vite=8.2.2` prepares a fresh installed consumer and runs its full fixture. Select other matrix pins through the same CLI.
- `node packages/vite-plugin-angular/scripts/compiler-qualification-suite.mjs --root=<prepared-consumers> --phase=paired` runs the 30 serial browser comparisons.
- `node packages/vite-plugin-angular/scripts/compiler-qualification-suite.mjs --root=<prepared-consumers> --phase=soak` runs the nine 15-minute cases.
- `node packages/vite-plugin-angular/scripts/compiler-benchmark.mjs --baseline=<untouched-alpha-consumer> --candidate=<candidate-consumer> --output=<report.json>` runs the production comparison. Set optional `ANALOG_PERF_FAST=1` for full fast mode, leave it unset for ngtsc.

Keep comparative timing phases serial and separate from other local qualification jobs. Raw JSON/logs and packed consumers are retained locally; the committed summary retains per-process production/browser statistics, GC checkpoints, and raw-file SHA-256 digests. CI uploads the installed-consumer results and runtime failure diagnostics.

## Historical frozen measurements (`52c8825cf`)

### Provenance and method

| Item              | Value                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------ |
| Candidate source  | `52c8825cfaeb309bb703a0b03177cd2b2bb3cdb6`                                                             |
| Candidate tarball | SHA-256 `b96abb704ba145b36b34405474eb29c70d439dd860b7ff5b0f977c5efa5cd786`, 302,074 bytes (294.99 KiB) |
| Baseline source   | `4225f45090a4cf4bdfb562a788e908787b6ec73c`                                                             |
| Baseline tarball  | SHA-256 `8e34dd1dff78cb638b3ce7fa8f83b77eda4d1b8d6469233fb54fe85d77988804`, 311,339 bytes (304.04 KiB) |
| Consumer pins     | Angular 22.0.0, TypeScript 6.0.2, Node 24.15.0, pnpm 10.33.0; Vite 6.0.0 and 8.2.2                     |
| Installation      | Fresh isolated consumers, normal native scripts enabled for esbuild, watcher, lmdb, and msgpackr       |
| Host              | Linux 6.17 x86_64, AMD EPYC 7773X, 128 logical CPUs, 247 GiB RAM                                       |

Every production cell uses five fresh Node processes per revision in alternating
order. Each process imports the packed package, constructs `angular()`, then
performs three production library builds of 20 standalone Angular components.
The worker asserts exactly 20 `defineComponent` occurrences in each emitted
bundle. “Warm” is the mean of builds two and three within each process. Results
are medians with the five-sample min/max range. Production heap uses decimal MB (1,000,000 bytes); RSS growth uses MiB (1,048,576 bytes).

The candidate package is the exact frozen rebuilt `dist` snapshot. Earlier
exploratory measurements are superseded by the JSON files in `results/`.

### Production builds

#### Default ngtsc

| Vite  | Metric                                |     Alpha median [range] | Candidate median [range] |  Change |
| ----- | ------------------------------------- | -----------------------: | -----------------------: | ------: |
| 6.0.0 | Import                                |  881.0 [875.5, 887.4] ms |  711.6 [702.6, 715.9] ms |  -19.2% |
| 6.0.0 | Import heap                           |  45.71 [45.36, 45.71] MB |  40.95 [40.47, 40.95] MB |  -10.4% |
| 6.0.0 | `angular()` construct                 |  1.206 [1.176, 1.384] ms |  5.038 [4.872, 5.110] ms | +317.6% |
| 6.0.0 | First build                           | 988.5 [963.7, 1021.3] ms | 984.6 [932.6, 1000.3] ms |   -0.4% |
| 6.0.0 | Warm build                            |  543.0 [516.0, 547.1] ms |  569.0 [511.7, 605.0] ms |   +4.8% |
| 6.0.0 | Heap after three retained plugin sets |                266.39 MB |                 63.02 MB |  -76.3% |
| 8.2.2 | Import                                |  889.5 [886.1, 907.9] ms |  725.9 [699.6, 731.1] ms |  -18.4% |
| 8.2.2 | Import heap                           |  47.07 [46.71, 47.08] MB |  42.31 [42.16, 42.53] MB |  -10.1% |
| 8.2.2 | `angular()` construct                 |  1.221 [1.178, 1.237] ms |  5.028 [4.867, 5.133] ms | +311.8% |
| 8.2.2 | First build                           |  864.1 [822.2, 881.8] ms |  894.8 [872.2, 910.0] ms |   +3.6% |
| 8.2.2 | Warm build                            |  500.3 [488.3, 513.6] ms |  575.4 [533.2, 595.6] ms |  +15.0% |
| 8.2.2 | Heap after three retained plugin sets |                263.19 MB |                 59.99 MB |  -77.2% |

#### Fast compile

| Vite  | Metric                                |    Alpha median [range] | Candidate median [range] | Change |
| ----- | ------------------------------------- | ----------------------: | -----------------------: | -----: |
| 6.0.0 | First build                           | 326.7 [307.7, 329.1] ms |  351.3 [342.2, 360.1] ms |  +7.5% |
| 6.0.0 | Warm build                            | 156.9 [151.3, 158.2] ms |  182.8 [176.1, 188.3] ms | +16.5% |
| 6.0.0 | Heap after three retained plugin sets |                59.38 MB |                 55.47 MB |  -6.6% |
| 8.2.2 | First build                           | 216.2 [212.1, 219.3] ms |  221.7 [219.8, 224.0] ms |  +2.5% |
| 8.2.2 | Warm build                            | 126.3 [125.0, 130.0] ms |  138.1 [131.9, 140.7] ms |  +9.4% |
| 8.2.2 | Heap after three retained plugin sets |                56.28 MB |                 52.23 MB |  -7.2% |

Import and construction results are the same package-level operation in both
modes: candidate import is 18–20% faster and ~10% lower heap, while construction
adds about 3.8 ms. The measured warm-build regressions remain visible. No
overall speedup is claimed.

### Dev transform and dual-environment RSS

This is a module-transform harness, not a browser benchmark. It creates a Vite
server without listening on a TCP port, transforms an Angular bootstrap module
in client and SSR environments, and verifies five watcher-triggered template
edits compile to updated `defineComponent` output. The process exits after each
sample, so this does not measure shutdown or browser websocket/DOM HMR latency. RSS values are increases from the pre-construction baseline, not total process RSS. Template-update timings start after a 25 ms wait following the watcher event; they are module-request timings, not end-to-end edit latency.

| Vite  | Metric                          |    Alpha median [range] | Candidate median [range] |
| ----- | ------------------------------- | ----------------------: | -----------------------: |
| 6.0.0 | Setup before first compiler use | 713.4 [674.7, 748.3] ms |     21.3 [20.9, 21.4] ms |
| 6.0.0 | First TypeScript transform      |   53.2 [53.0, 201.7] ms |  722.4 [716.3, 740.4] ms |
| 6.0.0 | First template update           |    12.1 [11.2, 24.2] ms |     46.7 [46.3, 49.5] ms |
| 6.0.0 | Later template update mean      |      8.9 [7.6, 15.9] ms |     35.1 [32.9, 65.3] ms |
| 6.0.0 | Client / client+SSR RSS growth  |        166 / 169.04 MiB |         164 / 241.02 MiB |
| 6.0.0 | SSR transform                   |     70.0 [8.9, 71.6] ms |  535.2 [507.5, 882.6] ms |
| 8.2.2 | Setup before first compiler use | 703.5 [656.6, 713.1] ms |     16.5 [16.5, 17.1] ms |
| 8.2.2 | First TypeScript transform      |    50.9 [49.5, 53.7] ms |  719.5 [693.4, 754.9] ms |
| 8.2.2 | First template update           |    54.4 [51.3, 70.9] ms |  118.7 [110.1, 126.2] ms |
| 8.2.2 | Later template update mean      |    31.5 [18.6, 39.9] ms |     65.0 [58.0, 84.8] ms |
| 8.2.2 | Client / client+SSR RSS growth  |     175.94 / 178.94 MiB |      168.64 / 244.64 MiB |
| 8.2.2 | SSR transform                   |    75.0 [71.7, 83.9] ms |  539.9 [504.5, 545.7] ms |

The candidate defers initialization, making setup much faster but moving work to
first transform. Separate compiler ownership is a correctness invariant, with a
measured approximately 76–77 MiB incremental client+SSR RSS cost and slower SSR
module transforms in this harness. These are costs to investigate without
weakening lifecycle or environment isolation.

Candidate fast-compile dev transforms are materially smaller than candidate
ngtsc in this harness: Vite 6 first transform 131.2 [127.0, 164.0] ms and Vite
8 first transform 111.2 [109.5, 112.2] ms. This is mode behavior, not a
comparison against a browser HMR outcome.

### Dependency cache and burst accounting

The candidate-only Vite 8 dependency workload explicitly transforms Angular
core's FESM module. It writes 376 KiB under `node_modules/.cache/analog`.
Default cache median is 309.5 [307.3, 463.7] ms versus 456.8 [452.4, 459.2] ms
with `ANALOG_TRANSFORM_CACHE=0`, a 32.2% lower median. The first default sample
populates the cache and accounts for the high end of its range.

Five fresh candidate ngtsc processes each enqueue 100 concurrent
`compiler.api.invalidate` calls after an initial compilation. Effect metric
snapshots consistently move `analog.compiler.compilations` from 1 to 3 and set
`analog.compiler.coalesced` to 99. This demonstrates queue coalescing without
claiming a latency multiplier. Alpha does not expose an equivalent metric/API, so no paired counter comparison exists. Fast mode exposes the internal invalidation API too; its burst behavior was not measured in this protocol.

### Footprint and limits

Packed gzip files: candidate **302,074 bytes (294.99 KiB)** versus alpha **311,339 bytes (304.04 KiB)**, a 9,265-byte reduction. Regular package-file contents total **47,533,320 bytes for Effect** versus **4,231,890 bytes for alpha's es-toolkit**. These are package contents, not the incremental allocation of a shared pnpm store. Filesystem allocation and download size are different measures. The compiler tarball excludes dependencies, so it does not establish an installed-size win.

The production/module-transform protocol above does not measure browser HMR state retention, rendered SSR
HTML/CSS updates, shutdown latency, production request latency, or peak RSS
under a sustained server. It does not attribute warm-build regressions to a
specific internal cause. All raw machine-readable records are retained in
`dist/effect-evidence/perf/results/` in the working checkout.

## Historical verification and evidence boundaries (52c8825cf)

- 911 compiler-package tests passed, with six existing skips. Source typecheck, test typecheck, package ESLint, compiler/builders build, and artifact checks passed.
- All 12 installed consumer cells passed: Angular 17.3.12/18.2.14/19.0.0/20.0.0/20.1.0 on Node 20.19.5 and matching TypeScript; Angular 21.0.0 on Node 24.15.0/Vite 7.0.0; Angular 22.0.0 on Node 24.15.0 with Vite 6.0.0, 6.4.3, 7.0.0, 7.3.6, 8.0.0, and 8.2.2.
- Packed checks cover public declarations, normal/fast full/partial/supported API output, source-map positions, replacements/includes, and built application graphs. Angular 21/22 browser cases cover AOT/JIT, HMR enabled/disabled, shared resources, and restarts. Vite 6.0/8.2 endpoint reruns also verify SSR development graphs and native dependency scripts. Those application graphs contain no Effect modules; the compiler's Node process does load Effect.
- The Analog app produced seven prerendered routes, six sitemap URLs, and real SSR HTML (14,102-byte home and 4,008-byte shipping output). This is output qualification, not a request-latency benchmark.
- GitHub CI passed on implementation `52c8825cf` and documentation head `1461fd389`, including Linux, Windows, compiler conformance, all installed consumers, and previews. Every subsequent push requires a new CI check.
- Compiler failures retain local paths and original causes for terminal/dev-overlay diagnostics. No compiler-owned HTTP/SSR error serializer was found; this is not a redaction guarantee.

Raw frozen JSON and the exact local measurement scripts are retained under `dist/effect-evidence/perf/results/` and `dist/effect-evidence/perf/scripts/`. The committed `scripts/compiler-benchmark.mjs` reproduces the default-mode production comparison between prepared consumers. These local artifacts are not published package exports.

### Bounded browser, rendered-SSR, shutdown, and memory follow-up

This follows the same frozen compiler implementation `52c8825cf`, with Angular 22.0.0, Vite 8.2.2, Node 24.15.0, and Chromium. Five fresh candidate processes each keep a real Vite server running through ten template and ten CSS edits over 60 seconds. Values are five-process medians [min, max]; edit timings first average ten edits within each process. Browser timing starts before the file write and ends when the DOM/computed style changes. SSR timing is module load plus `renderApplication` after the browser update, not HTTP request latency.

| Candidate metric                        |                 Median [range] |
| --------------------------------------- | -----------------------------: |
| Template write → browser DOM            |        93.18 [88.98, 95.84] ms |
| CSS write → browser computed style      |     153.27 [151.73, 156.53] ms |
| First rendered SSR call                 |     723.57 [713.30, 740.81] ms |
| Rendered SSR call after edits           |        21.88 [20.16, 24.13] ms |
| Idle server close                       |           2.58 [2.49, 2.62] ms |
| Close after admitting 100 invalidations |        68.67 [66.39, 69.56] ms |
| Sampled peak Node RSS                   | 1181.40 [1170.46, 1206.80] MiB |
| End-of-window Node RSS after GC         | 1181.40 [1170.34, 1205.50] MiB |
| End-of-window heap after GC             |    271.90 [271.87, 271.94] MiB |
| Heap after server close and GC          |    111.86 [111.84, 111.88] MiB |

Template HMR retained the counter in **50/50** edits. Rendered SSR HTML and CSS contained the edited values in **50/50** checks. In the separate shutdown workload, **500/500** admitted caller promises completed; none had settled when close was invoked. RSS is the Node process only, sampled every 250 ms; it excludes Chromium and is not a kernel high-water mark or a long-duration leak test. The closed server object remains referenced during the final heap sample.

All five exact-alpha consumers failed before browser startup because `PlatformLocation` remained partially compiled without the Angular compiler available. That prevents a valid paired comparison for this follow-up; it is a package-level compatibility result, not proof that Effect alone fixes browser startup. No browser/SSR speedup is claimed.

At that checkpoint the four categories had only bounded candidate observations. The completed qualification section above supersedes that coverage limit. Raw data and the exact local harness are retained in `dist/effect-evidence/perf/` (`browser-supplement.json`, `browser-vite8-*.json`, and `shutdown-queued-*.json`).

A separate server-without-listen probe exited with an unsettled close on both revisions, including with zero queued compiler calls. Those historical probes are excluded from the listening-server table; the completed middleware protocol above qualifies the supported host lifecycle.

## Attribution

Compatibility attribution: public commits `5277af9f7547e95cc4cebaec9cb05085a23e8647`, `47ca5f2ac44a54c16f98f810d395357e5b6832e5`, and `b3482e5e06b474869cdc21e01ffb3267da35f267`. Source-map attribution: `ea55ddabd86c6160e4741ade9d5cb4096a791d35`. Prepared with OpenAI Codex. Grok independently reviewed the earlier description and frozen measurement protocol. Squash merge remains the recommendation.

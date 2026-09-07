# Effect compiler refactor: implementation and evidence log

This is the canonical implementation and measurement record for [analogjs/analog#2521](https://github.com/analogjs/analog/pull/2521), tracked by [analogjs/analog#2519](https://github.com/analogjs/analog/issues/2519). The PR remains a draft. Native `angular(options): Plugin[]` usage is retained; Effect `4.0.0-rc.112` is a prerelease runtime dependency of the compiler package.

The measurements below compare frozen implementation `52c8825cf` with alpha `4225f4509`. Subsequent documentation changes do not change that measured implementation. There is **no overall speedup claim**: import time and retained heap improve, while construction, several warm builds, development transforms, and independent SSR compilation have measured costs. The cause of the warm-build regressions has not been isolated.

## Composition and audit record

### Compiler operations and source discovery

`CompilerBackend` and `CompilerSourceGraph` expose precise success, failure, and service requirements. Live Layers own configuration/root/include discovery before native Angular work. Tests replace those capabilities without starting compiler workers. All three modes receive integration includes while preserving their own reference-expansion policies. TypeScript configuration failures retain native diagnostics. Closed scopes clear source, builder, metadata, output, and resource caches; lazy emit closures capture their own builder.

Code: [backend composition](src/lib/compiler-backend-live.ts), [source graph](src/lib/compiler-source-graph-live.ts).

### Scheduling, reads, and resource ownership

`CompilationScheduler` serializes compilation and lazy emission, coalesces pending file sets, lets full invalidation supersede individual files, and waits for the newest successful queued generation. `CompilerSession` owns listeners, its runtime, native callers, and finalizers. Cancelling a waiter does not abort Angular; shutdown drains admitted work before disposal. Reopening waits for the previous close. Optimizer factories register final release even where Astro disables an early cleanup hook.

Vite environment selection is keyed by environment identity and shares only in-flight initialization for that exact environment. Dependency scans cannot own the live compiler. Real client/server build tests hold the server transform until after client close. Browser HMR remains on the primary compiler. JIT inline styles have separate owners and are removed only when the last owner releases them. Server HTML/CSS edits currently invalidate that server environment's whole module graph: Angular-inlined resource owners are not discoverable through a Vite-only lookup. This is a correctness fallback with an unmeasured rendered-SSR edit cost.

Code: [scheduler](src/lib/compilation-scheduler.ts), [session](src/lib/compiler-session.ts), [environment selection](src/lib/compiler-environments.ts).

### Stylesheets and HMR

The typed stylesheet program and replaceable compiler service handle preprocessing, externalization, inline compilation, and phase/file/cause failures for ngtsc, the Compilation API, and inline JIT styles. Empty CSS is valid. Fast-mode and external-registry paths now surface failures instead of dropping CSS. Registry refresh removes collision-prone basename aliases. JIT CSS is serialized as a JavaScript string, so backticks and interpolation text remain data.

Fast HMR uses a bidirectional resource index: every component sharing a template or stylesheet is invalidated, old references are removed, and paths are normalized. HMR metadata targets the original live class across successive module evaluations. Packed browser tests update a template, a stylesheet, and resources shared by two components. These tests prove behavior, not websocket/DOM latency.

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

## Supporting work

- [analogjs/analog#2520](https://github.com/analogjs/analog/pull/2520) supplies public compatibility work for roots, HMR metadata, declarations, Node bootstrap, and packed fixtures. Reconcile when it merges.
- Source-map behavior adapts [analogjs/analog#2506](https://github.com/analogjs/analog/pull/2506): production honors Vite's map setting, fast mode composes the final OXC/esbuild map, and the Compilation API retains its native inline map until Vite consumes it. Checked normalization preserves contents, extension fields, and URL roots; packed tests assert source file and line.
- The supporting `platform` no-SSR repair reads the matched route-rule header before rendering. It is distinct from the compiler refactor and is not shipped by updating only `@analogjs/vite-plugin-angular`.

## Frozen measurements

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

## Verification and evidence boundaries

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

These observations supply bounded data for the four previously unpaid categories. Paired alpha comparisons, larger applications, longer memory soaks, and other browser/Vite versions remain unqualified. Raw data and the exact local harness are retained in `dist/effect-evidence/perf/` (`browser-supplement.json`, `browser-vite8-*.json`, and `shutdown-queued-*.json`).

A separate server-without-listen probe exited with an unsettled close on both revisions, including with zero queued compiler calls. Those probes are excluded from the listening-server shutdown table and remain an unqualified lifecycle case.

## Unpaid qualification

- [ ] Browser websocket/DOM HMR latency, including state retention under timed edits.
- [ ] Rendered SSR HTML/CSS after edits, including the cost of whole-environment invalidation.
- [ ] Shutdown latency and resource release under measured workloads.
- [ ] Peak/retained RSS of a sustained server, beyond these short process samples.

The follow-up supplies bounded Vite 8 candidate data for these categories; paired alpha measurements and broader qualification remain incomplete. Keep these items open in [analogjs/analog#2519](https://github.com/analogjs/analog/issues/2519). Investigate the reported regressions without weakening ownership or hiding failures. Re-run the packed protocol after any compiler change; a new documentation commit does not turn frozen measurements into measurements of different code.

## Attribution

Compatibility attribution: public commits `5277af9f7547e95cc4cebaec9cb05085a23e8647`, `47ca5f2ac44a54c16f98f810d395357e5b6832e5`, and `b3482e5e06b474869cdc21e01ffb3267da35f267`. Source-map attribution: `ea55ddabd86c6160e4741ade9d5cb4096a791d35`. Prepared with OpenAI Codex. Grok independently reviewed the description and measurement protocol. Squash merge remains the recommendation.

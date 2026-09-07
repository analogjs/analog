# HMR downside investigation

Follow-up to [analogjs/analog#2521](https://github.com/analogjs/analog/pull/2521).
Comparison control: `0cf3f80025f2c7db8080700a2ac63d1874598de1`, kept in
`hmr-2521`. Work branch: `perf/hmr-downsides-2521`, branched from that control.
Historical comparison revision: `4305f920b154d424b8645e70cf71a9005c404001`.

## Hypotheses before implementation

1. **Solvable now: known resource owners with lazy or query-qualified SSR modules.**
   `compiler-environments.ts:166-178` at the control revision mistakes missing exact module IDs for
   unknown ownership. A loaded bare module also hides other query variants,
   leaving those variants stale. Use Vite's file-to-module index for every known
   owner. An owner with no loaded module has no cached output to invalidate;
   its compiler still receives the resource invalidation before any read.
   Change only this shared environment adapter and its tests. Measure unrelated
   SSR module retention and fresh output from every loaded variant, then lazy
   loading, immediate concurrent SSR reads, and restart. Keep whole-graph
   invalidation when Angular cannot establish any owner.
2. **Needs experiment: deferred SSR compilation latency.** Starting `api.invalidate`
   after client HMR could warm a previously used server compiler through its
   existing scheduler. Do not change `CompilerSession` or Effect layers. First
   experiment: compare idle delay and immediate SSR reads with a deliberately
   slow backend, rapid edits, failure, and close. Background CPU/memory use and
   error delivery need proof before enabling speculation. Last-request-only
   warming also needs import tracking; native Angular still analyzes a program.
3. **Needs experiment: generation output reuse beyond existing ngtsc protection.**
   `angular-vite-plugin.ts:1716-1805` already deduplicates owner emission in a
   generation. Compilation API exposes emitted files and `templateUpdates`
   separately. Measure native emission before introducing any cross-generation
   cache; source/resource/mode hashes alone do not capture program dependencies
   or diagnostic changes. Next experiment: instrument a shared-template edit,
   remove an owner, fail compilation, recover, and request JS/maps/HMR payloads.
4. **Cannot safely fix yet: CSS-only updates without view recreation.** Ordinary
   CSS already uses Angular metadata replacement; `compiler/hmr.ts:53-72`
   invokes replacement that recreates views. A DOM-preserving style swap needs
   ownership of Angular renderer style records, including future instances and
   ShadowDom. Next experiment: official external-style mode with two instances,
   a focused input, nested views, lazy creation, and template→CSS→template edits.
5. **Cannot safely fix yet: explicit external styles.** Compilation API's reload
   at `compilation-api/compilation-api-plugin.ts:738-756` addresses reattachment
   of the original unversioned link after Vite replaces it. Angular CLI tracks
   `ComponentStyleRecord.used/reload` and reloads ShadowDom. First prove shared
   ownership of old/new link elements and correct `:host`/`:host-context` after
   preprocessing; merely removing the reload would restore stale styles.
6. **Solvable for the chosen adapter change; broader unification needs experiment.**
   ngtsc, Compilation API, and fast mode already pass ownership/deferred work
   through `isolateCompilerEnvironments` (`angular-vite-plugin.ts:1388-1398`).
   Apply the graph correction once here, preserving their compiler selection,
   HMR/JIT/version capabilities and public options. A separate rewrite of the
   three native compilation pipelines is unnecessary and outside this follow-up.

## Prior art

- [Analog two-phase style repair](https://github.com/analogjs/analog/pull/2493):
  inline/encapsulated first paint, later external styles, and a fresh program
  when external-style compiler flags change.
- Angular CLI 22 installed source: `src/builders/dev-server/vite/index.js:143-149`
  separates `externalRuntimeStyles` (`NG_HMR_CSTYLES`) from `templateUpdates`;
  `src/tools/angular/compilation/aot-compilation.js:108-160` builds update payloads;
  `src/builders/dev-server/vite/index.js:250` sends `angular:component-update`;
  `src/builders/dev-server/vite/hmr.js:56-110` and
  `src/tools/vite/middlewares/assets-middleware.js:84-110` track component style
  usage, encapsulation and ShadowDom reloads.
- [Vite 6 file-to-module graph](https://github.com/vitejs/vite/blob/v6.0.0/packages/vite/src/node/server/moduleGraph.ts#L89)
  explicitly indexes every query variant of a file. The same API is present in
  [Vite 8](https://github.com/vitejs/vite/blob/v8.2.2/packages/vite/src/node/server/moduleGraph.ts).

The selected implementation and qualification results follow. Historical
Effect-refactor first-SSR measurements remain in `EFFECT_REFACTOR.md` and
`qualification.json`; this investigation does not claim to fix that regression.

## Source map and selected design

Paths below are relative to `packages/vite-plugin-angular/src/lib`. Unless a
revision is specified, citations describe the candidate source.

| Requested path                                    | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unknown ownership becomes broad invalidation      | Control `compiler-environments.ts:166-178` conflates unknown owners with missing exact module IDs. Candidate `compiler-environments.ts:166-180` reserves `invalidateAll()` for an empty owner set and uses every `getModulesByFile()` entry for known owners.                                                                                                                                                                                                                                                                                             |
| Eager versus deferred SSR compile                 | `4305f920b` `compiler-environments.ts:157-166` awaits the server invalidation callback. Current `angular-vite-plugin.ts:1388-1396` supplies `api.defer`; `compiler-session.ts:99-108,156-164` flushes dirty work on reads. Public `api.invalidate` still awaits `compilation.run` in `angular-vite-plugin.ts:404-406`, `fast-compile-plugin.ts:713-715`, and `compilation-api/compilation-api-plugin.ts:583-585`.                                                                                                                                         |
| CSS reload                                        | `compilation-api/compilation-api-plugin.ts:738-756` reloads explicit external component styles. ngtsc's external-style branch reloads at `angular-vite-plugin.ts:805-843` for missing/unpatchable wrappers or ShadowDom; its proven wrapper path can send CSS updates at `748-802`. The ordinary metadata path is separate at `592-625`.                                                                                                                                                                                                                  |
| Generation cache keys                             | `angular-vite-plugin.ts:309-325,1716-1779` looks up output by normalized filename but guards native emission with a Set captured by that generation's builder closure. Output includes maps, diagnostics and HMR metadata; close clears it at `346-363`. Compilation API stores native output and template updates by normalized filename at `compilation-api/compilation-api-plugin.ts:475-525`. Fast mode delegates changed-source/resource emission to its serialized transform at `fast-compile-plugin.ts:854-866`. No new persistent cache is added. |
| Dependency transformer cache                      | `utils/transform-cache.ts:15-21,145-162,209-244`: branded content hashes, bounded memory, toolchain-version disk namespace. This is not the component-generation cache.                                                                                                                                                                                                                                                                                                                                                                                   |
| Owner JS emitted twice before the first follow-up | At `4305f920b`, `angular-vite-plugin.ts:885-907` queues owner compilation; `1692-1694` emits its JS. Middleware/transform subsequently calls `fileEmitter` (`292-296`), which unconditionally calls `outputFile`; `1630-1639` emits again. Control/candidate already contain the generation-local guard at `1716-1718`. This investigation does not claim that inherited improvement as new.                                                                                                                                                              |

The production change is confined to `compiler-environments.ts`. Compiler
ownership is still published synchronously before graph invalidation. Each
known owner's canonical file key is looked up using Vite's own file-to-module
index, including all query variants. Unloaded owners have no cached Vite module;
Angular's existing dirty/read barrier supplies their first output. One shared
visited set invalidates loaded owners and their importers without traversing
unrelated modules.

A fifth regression test exposed an additional requirement: passing `isHmr=true`
to `invalidateModule` updates only `lastHMRTimestamp`. Vite can then reuse an
older pending transform for a request admitted after the edit. File invalidation
updates `lastInvalidationTimestamp`, rejects that pending result for new readers,
and prevents the older completion from overwriting the new cache entry. The
real-Vite test holds the old transform until the new read finishes, then checks
the cached result again. No additional generation token, worker, timer, retained
cache, session API, or Effect layer is necessary.

| Change                                                           | Benefit                                                                             | Tradeoff or fallback                                                                                |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Use the file index for known SSR resource owners                 | Update all loaded query variants; lazy owners no longer evict unrelated SSR modules | Unknown ownership still clears the SSR graph. Compiler analysis is still program-wide.              |
| Use file-invalidation timestamps for those modules and importers | A request admitted after an edit cannot share an older pending Vite transform       | Superseded transforms may finish for callers admitted earlier, but cannot populate the newer cache. |

## Enabled, disabled, experimental, and fallback paths

- **Default AOT/ngtsc:** enabled automatically in the existing isolated SSR
  environment adapter. Angular resource dependencies provide owners.
- **Experimental Compilation API:** the same adapter and change apply when
  `experimental.useAngularCompilationAPI` selects that compiler. No selection,
  typechecking or native `templateUpdates` behavior changes.
- **Fast full/partial compilation:** the same adapter uses the fast compiler's
  resource index. Both compile modes build in the packed matrix; full-mode
  browser/SSR ownership is additionally measured.
- **`liveReload: false`, `server.hmr: false`, and JIT:** browser replacement
  remains disabled according to existing settings. The server freshness adapter
  does not enable browser HMR; unknown/unindexed owners retain broad invalidation.
  Packed browser tests cover the disabled/JIT branches for all three compilers.
- **Angular 17 fallback:** packed builds pass and the unsupported Compilation API
  option still rejects explicitly. This run does not add Angular 17 browser
  certification. Existing Angular 18 and 19.0.0 fallbacks are unchanged; native
  metadata replacement remains version-gated to 19.0.1+.
- **Vite 6–8:** use the existing `getModulesByFile`/`invalidateModule` APIs, with
  Vite's `normalizePath` and query stripping. No optional capability is assumed
  outside this supported range. Browser HMR remains on the primary compiler;
  dependency scanning and independent production environments keep their current
  selection and lifetime rules.
- **Explicit external styles and ShadowDom:** retain their existing correctness
  reloads and preprocessing/encapsulation pipelines. This change never mutates
  browser style records, metadata or stylesheet links.

## Verification

Five regression cases failed before their fixes: loaded-plus-lazy owners,
all-lazy owners, query-only owners, bare-plus-query owners, and an in-flight Vite
transform reused by a later read. The final environment suite passes 11 tests.
The package suite passes **941 tests, six existing skips**, with source/test
TypeScript checks, ESLint, package build and artifact verification passing.

The existing compiler tests exercised one emission per source/generation,
updated JS/maps/diagnostics, shared ownership and removal, configuration
invalidation, compile failure/recovery, stylesheet failures, cache I/O errors,
edits during compilation, cancellation, admitted-work draining and reopen after
close. These are bounded tests of those contracts, not a new universal
cross-generation-cache proof. In particular:

- `angular-vite-plugin-transform.spec.ts:166-211` checks emit counts and refreshed
  JS/maps/diagnostics after awaited invalidation.
- `resource-dependencies.spec.ts:5-20`, `stylesheet-pipeline.spec.ts:105` and the
  tsconfig resolver/source graph suites cover edge replacement/removal,
  preprocessing dependencies and configuration invalidation/diagnostics.
- `compiler-session.spec.ts:17-114,205-255` and `compilation-scheduler.spec.ts`
  cover reopen, coalescing, failed compile/recovery, cancellation, close and
  newest-generation reads during edits.

Fresh packed verification:

- Angular 22 on Vite **6.0.0, 7.3.6 and 8.2.2**: 29 checks per tuple, including
  public declarations with `skipLibCheck:false`, all compiler builds, concurrent
  client/server environments, browser HMR enabled/disabled and JIT.
- Angular 17.3.12 / TypeScript 5.4.5 / Node 20.19.5 / Vite 6.0.0: nine successful
  build/declaration checks and explicit rejection of unsupported Compilation API.
- New ownership fixture: all **nine mode/Vite combinations** pass, with 36
  template/CSS edits, 144 fresh rendered SSR results, unrelated module retention,
  signal/instance/form-value retention, view-recreation observations and later
  browser/SSR loading of a third shared-resource owner.
- Existing runtime fixture: ngtsc/fast/API on Vite 6.0 and 8.2 pass **24 edit
  pairs, 12 restarts and 600 queued callers**. Both resource and source reads race
  client HMR. Vite 6.0 uses its Environment Runner for restart qualification;
  Vite 8 uses the legacy SSR loader.
- The shared Sass partial fixture passes **nine compiler/encapsulation cases**
  (Emulated, None, ShadowDom), including repeated preprocessing-dependency edits
  and actual rendered encapsulation assertions.

These runs are Linux/Chromium evidence. Windows path normalization follows
Vite's existing platform-aware convention; a native Windows run was not added.
No sustained memory-soak or entire-monorepo build claim is made.

## Measurements against `4305f920b` and the current control

Three fresh processes per side in alternating order, three template/CSS pairs
per process. Comparisons ran serially with other qualification processes stopped.
Angular 22, TypeScript 6.0.2, Vite 8.2.2, Node 24.15.0, Playwright 1.59.1, Linux
x86_64. Two visible shared-resource owners, three loaded variants of owner A,
and a third owner compiled but not yet imported by SSR. SSR starts at the watcher
boundary with no manual graph refresh. Its cost includes four concurrent module
reads and four serial Angular renders. Edit times are medians of per-process
means; first SSR and memory are process medians.

| Metric                              |             Original `4305f920b` | Control `0cf3f8002` | Candidate |
| ----------------------------------- | -------------------------------: | ------------------: | --------: |
| Template write-to-DOM (ms)          |                            175.9 |               135.6 |     138.3 |
| CSS write-to-style (ms)             |                            192.4 |               123.9 |     121.9 |
| First SSR group (ms)                |                            778.1 |               730.4 |     751.1 |
| SSR group after edit (ms)           | 149.6 **(includes stale reads)** |               144.4 |     136.7 |
| Fresh SSR render results            |                            60/72 |               72/72 |     72/72 |
| Unrelated SSR module retained       |                             0/18 |                0/18 |     18/18 |
| Actual browser reloads              |                                9 |                   0 |         0 |
| CSS component instance retention    |                              0/9 |                 9/9 |       9/9 |
| View recreation observed            |                            18/18 |               18/18 |     18/18 |
| Node RSS after initial SSR/GC (MiB) |                           1131.6 |              1129.8 |    1119.1 |
| Node heap after close/GC (MiB)      |                            113.0 |               112.2 |     112.0 |

The new benefit is precise SSR cache invalidation and freshness. CSS state
retention and most of the improvement over `4305f920b` predate this change.
Template latency and first SSR are slightly higher than the current control;
three processes do not establish a latency or memory improvement. RSS excludes
Chromium and is not a peak measurement. Original-PR after-edit timings include
stale first-template responses and must not be compared as successful SSR costs.
The historical Effect-refactor first-SSR regression remains separate and unfixed.

Separate fast/API before/after fixtures reproduce stale query variants on the
current control and fresh variants on the candidate. Compilation API emits a
`full-reload` message scoped to `/src/shared.html`, which Vite's browser client
ignores for this page; the fixture records message counts and actual page
navigations separately. Instance, signal and signal-backed input values survive,
but CSS updates still recreate views. No DOM-preserving CSS update is claimed.

[Machine-readable evidence](hmr-downsides-qualification.json) contains each
comparison, the version matrix, archive/source hashes and raw artifact hashes.
Controls intentionally fail the new ownership assertions; their raw observations
remain included. Early development runs with substring-based reload counting are
excluded from the final comparison.

## Reproduction

From the candidate worktree, select Node 24.15.0 and pnpm 10.33.0. Installation
uses the unchanged frozen lockfile; the targeted Nx build performs package setup.

```sh
pnpm install --frozen-lockfile --ignore-scripts
NX_DAEMON=false NX_NO_CLOUD=true pnpm nx run-many --projects=vite-plugin-angular --targets=test,typecheck,typecheck-tests,build --parallel=2
pnpm exec eslint packages/vite-plugin-angular/src/lib/compiler-environments.ts packages/vite-plugin-angular/src/lib/compiler-environments.spec.ts packages/vite-plugin-angular/scripts/compiler-ownership-qualification.mjs
node packages/vite-plugin-angular/scripts/compiler-vite-smoke.mjs --vite=6.0.0 --angular=22.0.0
node packages/vite-plugin-angular/scripts/compiler-vite-smoke.mjs --vite=7.3.6 --angular=22.0.0
node packages/vite-plugin-angular/scripts/compiler-vite-smoke.mjs --vite=8.2.2 --angular=22.0.0
node packages/vite-plugin-angular/scripts/compiler-vite-smoke.mjs --vite=6.0.0 --angular=17.3.12 --node-executable=/path/to/node-20.19.5
```

Each smoke command prints its installed consumer directory. Copy the new fixture
into each Angular 22 consumer, then run all three modes:

```sh
cp packages/vite-plugin-angular/scripts/compiler-ownership-qualification.mjs /path/to/consumer/ownership.mjs
cd /path/to/consumer
node --expose-gc ownership.mjs --mode=ngtsc --edits=2 --output=ownership-ngtsc.json
node --expose-gc ownership.mjs --mode=fast --edits=2 --output=ownership-fast.json
node --expose-gc ownership.mjs --mode=api --edits=2 --output=ownership-api.json
```

For the comparison, build and pack `4305f920b`, `0cf3f8002` and the candidate in
separate worktrees. Install each archive into a separate identical Vite 8.2.2 /
Angular 22 consumer and copy the **candidate** ownership fixture into all three.
Run `node --expose-gc ownership.mjs --mode=ngtsc --edits=3 --label=SIDE
--output=sample-N.json`, alternating side order for three samples. Controls exit
1 because their ownership/freshness assertions fail; inspect the saved records.
Do not add `invalidateAll()` or refresh helpers to the fixture.

The original-PR archive SHA-256 is checked against the already committed
`hmr-qualification.json` provenance. Local final raw files are under
`dist/hmr-downsides` and `dist/compiler-vite-smoke`; these generated consumers and
logs remain untracked. [Paste-ready PR text](HMR_DOWNSIDES_PR.md) describes this
follow-up without replacing the historical Effect report.

## Remaining limits and next experiments

Truly unknown ownership still invalidates broadly. No sticky heuristic is used
to guess an owner after removal or configuration changes. SSR compilation remains
deferred and program-wide; no last-request warming or background compilation is
enabled. Generation reuse remains local to existing compilers. CSS metadata HMR
still recreates views, and explicit external styles keep their correctness
reloads. First-paint preprocessing and encapsulation are unchanged.

The smallest subsequent experiments are the hypotheses above: use only the
existing environment adapter for speculative server scheduling; instrument
`angular-vite-plugin.ts` and `compilation-api-plugin.ts` before changing emit
caches; and qualify link ownership in `stylesheet-registry.ts`,
`encapsulate-component-styles-plugin.ts` and the HMR middleware before changing
external CSS or renderer metadata. Each needs its own failing test and comparison
before production code changes.

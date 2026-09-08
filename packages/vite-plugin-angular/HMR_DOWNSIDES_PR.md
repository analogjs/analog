Suggested title: **fix(vite-plugin-angular): invalidate SSR resource variants without clearing unrelated modules**

> Historical record. The qualified SSR invalidation fix is integrated. See [the current integration report](HMR_INTEGRATION.md) for lazy Effect loading, SSR warming, style capabilities, new qualification, and remaining latency cautions. Measurements below retain their original revisions and protocols.

## PR Checklist

Follow-up to [Effect compiler refactor analogjs/analog#2521](https://github.com/analogjs/analog/pull/2521), tracked by [analogjs/analog#2519](https://github.com/analogjs/analog/issues/2519).

Resource edits currently clear unrelated SSR modules when a known shared-resource owner has not been loaded. If both bare and query-qualified modules are loaded, exact-ID lookup can instead miss a query variant and serve stale output. Separately, HMR-only graph timestamps let a later SSR request share an older pending Vite transform.

## Affected scope

- Primary scope: `vite-plugin-angular`
- Supporting scope: development behavior documentation in `docs-analog`

## Recommended merge strategy for maintainer [optional]

- [x] Squash merge
- [ ] Rebase merge
- [ ] Other

## What is the new behavior?

The existing environment adapter uses Vite's file-to-module index for every known Angular resource owner, including all query variants. An unloaded owner has no Vite cache to evict; its first read still enters the existing compiler barrier. File-invalidation timestamps prevent pre-edit pending transforms from being reused by newly admitted SSR requests or overwriting the new cache.

| Change                                                           | Benefit                                                                                         | Tradeoff or fallback                                                                    |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Invalidate every loaded SSR module for each known resource owner | Fresh shared-resource/query-variant output without discarding unrelated modules for lazy owners | Unknown ownership still invalidates the graph; Angular compilation remains program-wide |
| Use file-invalidation timestamps                                 | New SSR reads cannot share an older pending transform                                           | Superseded transforms can drain for callers admitted earlier                            |

This is one production-file change shared by ngtsc, fast mode, and experimental Compilation API. Compiler selection, typechecking, HMR-disabled/JIT/older-Angular paths, eager public `invalidate()`, environment isolation, failure propagation, shutdown and reopen semantics remain intact. `CompilerSession`, Effect layers, and the public `angular(options)` signature are unchanged.

Browser CSS replacement is unchanged. Ordinary CSS still uses Angular metadata HMR and recreates views; explicit external styles retain their existing correctness fallbacks. The historical Effect-refactor first-SSR regression is not fixed by this change.

## Test plan

- [x] Five regression cases failed before the fixes and pass afterward: loaded/lazy, all-lazy, query-only, bare/query, and pending-transform races
- [x] Package suite: 941 passed, six existing skips
- [x] Source and test typechecks, ESLint, package build/artifact verification
- [x] Formatting check for touched files
- [x] Angular 22 packed consumers on Vite 6.0.0, 7.3.6, and 8.2.2; 29 checks per tuple including enabled/disabled HMR, JIT, public declarations and all compiler paths
- [x] Angular 17.3.12 build/declaration fallback and unsupported Compilation API rejection
- [x] Nine real ownership/browser/SSR combinations; 36 edits, 144 fresh rendered results, shared resources, lazy loading and state checks
- [x] Existing runtime qualification: 24 edit pairs, 12 restarts, 600 queued callers; resource and source reads during HMR
- [x] Shared Sass partial edits across three compiler modes and Emulated/None/ShadowDom encapsulation
- [ ] Entire-workspace `pnpm build` / `pnpm test`
- [ ] Native Windows browser/runtime qualification

```sh
pnpm install --frozen-lockfile --ignore-scripts
NX_DAEMON=false NX_NO_CLOUD=true pnpm nx run-many --projects=vite-plugin-angular --targets=test,typecheck,typecheck-tests,build --parallel=2
node packages/vite-plugin-angular/scripts/compiler-vite-smoke.mjs --vite=6.0.0 --angular=22.0.0
node packages/vite-plugin-angular/scripts/compiler-vite-smoke.mjs --vite=7.3.6 --angular=22.0.0
node packages/vite-plugin-angular/scripts/compiler-vite-smoke.mjs --vite=8.2.2 --angular=22.0.0
```

Copy `scripts/compiler-ownership-qualification.mjs` into each reported Angular 22 consumer, then run `node --expose-gc ownership.mjs --mode=ngtsc --edits=2 --output=ownership.json`; repeat with `--mode=fast` and `--mode=api`. Full control-comparison commands and file:line analysis are in `packages/vite-plugin-angular/HMR_DOWNSIDES.md`.

## Does this PR introduce a breaking change?

- [ ] Yes
- [x] No

## Other information

The separate worktree starts at the current PR control `0cf3f8002`. Three fresh serial processes per side, three template/CSS pairs per process, Angular 22 / Vite 8.2.2 / Node 24.15.0 / Chromium. SSR requests begin at the watcher boundary without manual graph refresh. Times are medians of process means except first SSR and memory, which are process medians.

| Metric                         |                 `4305f920b` | `0cf3f8002` control | Candidate |
| ------------------------------ | --------------------------: | ------------------: | --------: |
| Template latency (ms)          |                       175.9 |               135.6 |     138.3 |
| CSS latency (ms)               |                       192.4 |               123.9 |     121.9 |
| First SSR group (ms)           |                       778.1 |               730.4 |     751.1 |
| SSR after edit (ms)            | 149.6, includes stale reads |               144.4 |     136.7 |
| Fresh SSR results              |                       60/72 |               72/72 |     72/72 |
| Unrelated module retained      |                        0/18 |                0/18 |     18/18 |
| Actual page reloads            |                           9 |                   0 |         0 |
| CSS instance retention         |                         0/9 |                 9/9 |       9/9 |
| RSS after initial SSR/GC (MiB) |                      1131.6 |              1129.8 |    1119.1 |
| Heap after close/GC (MiB)      |                       113.0 |               112.2 |     112.0 |

The ownership fix accounts for retained unrelated modules and fresh query variants. CSS retention and most gains versus `4305f920b` predate this follow-up. Template latency and first SSR are slightly higher than the current control; these samples do not establish a latency or memory win. RSS excludes Chromium and is not peak RSS. All sides recreate views. Compilation API path-scoped reload messages are recorded separately from actual page navigations.

`hmr-downsides-qualification.json` retains per-process observations, compatibility results, source/archive hashes and raw-evidence hashes. Existing historical qualification remains separate. Background SSR warming, broader generation caching, DOM-preserving style replacement and external-link lifecycle changes remain experiments; the report identifies the next bounded experiment for each.

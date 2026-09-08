# HMR integration: implementation and qualification

Latest follow-up: [two-hour p95 sprint and short-soak qualification](HMR_P95_SPRINT.md). The tables and 15-minute soaks below remain the earlier `e66dfc` cohort; they are not pooled with the new repaired-control comparison.

This is the current implementation record for [analogjs/analog#2521](https://github.com/analogjs/analog/pull/2521), tracked by [analogjs/analog#2519](https://github.com/analogjs/analog/issues/2519). The issue retains the maintainer's adoption decision. Earlier results in [EFFECT_REFACTOR.md](EFFECT_REFACTOR.md) and [HMR_DOWNSIDES.md](HMR_DOWNSIDES.md) remain historical cohorts.

**Correctness qualification passes, but the strict 5% performance gate remains unmet in the cells marked below. Automatic ordinary-style externalization was removed; established metadata/reload fallbacks remain. No overall speedup or completed performance-acceptance claim is made.**

## Revisions and measurement boundaries

| Role                      | Revision                                   | Packed SHA-256                                                     |
| ------------------------- | ------------------------------------------ | ------------------------------------------------------------------ |
| Correctness-only control  | `fd8b2890295b396c762d7a7d8e9b6a90759a0ae5` | `777f380cd44fb2e1b3dce41ee3a076634e398c9fc6fa62056f39c0265ccac694` |
| Final runtime and workers | `e66dfc92058e49c89efa722b88a9b0300a4a2707` | `182e0d97d4b9cc9def89eafb4868c8cb438df66bec8ff5d70809618877fa4d2c` |

Published raw archive: [qualification-results.tar.gz](evidence/hmr-integration/qualification-results.tar.gz), SHA-256 `382845a7efa3509fac345acf5ad89e83a5d6b75a4b5f6a9f8fd8e0998a9094d4` (1,923,986 bytes). Documentation/evidence commits after the runtime revision do not change the measured package.

The control includes qualified SSR invalidation and fast behavioral reloads. The candidate also fixes a subsequently discovered Angular renderer cache problem for previously destroyed components, shared external-style fallback freshness and Angular 19 reload replay. Those correctness differences remain a comparison confound. This is not an experiment isolating Effect's contribution, and there is no equivalent optimized implementation without Effect.

Worker filenames and pinned consumer directories identify the comparison side; some raw workers retained the default `label: candidate` even in the control directory. The summarizer groups by filename, not that label. All new comparative workers use installed tarballs, Angular 22.0.0, TypeScript 6.0.2, Node 24.15.0, pnpm 10.33.0 and Playwright 1.59.1 on Linux. Vite pins are 6.0.0, 6.4.3, 7.3.6 and 8.2.2. Processes run serially, alternating control/candidate order, with warm filesystem/package caches. Correctness jobs and soaks do not overlap these measurements. Browser latency is file write to observed DOM/computed style, including filesystem notification and HMR transport. SSR measures module import and Angular rendering, excluding HTTP transport. No new worker manually invalidates the SSR graph.

The last cohort was fixed before execution at 15 fresh processes per build side and five fresh processes with 25 template/CSS edit pairs per HMR side and tuple. Every edit remains in its cohort. Browser figures are pooled edit medians and nearest-rank p95; first SSR, CPU and memory are process medians. A single first edit is 10% of a ten-edit process and 4% of a 25-edit process, so changing sample size changes the meaning of p95. Earlier failures remain reported; this follow-up does not retroactively pass them.

Initial and intermediate browser cohorts used frame-polled conditions. Later paired-HMR cohorts arm a MutationObserver and stylesheet load listener before the file write; this removes an extra requestAnimationFrame polling delay. Neither probe measures browser paint. The SSR-idle and soak workers retain the frame-polled browser assertions; their foreground SSR timers remain separate. Do not pool the two protocols or compare their absolute latencies directly.

## Correctness and ownership

| Area                         | Implemented behavior                                                                                                                                                                                                                                                                                                                                                                    | Evidence                                                                                                                                                                                                             |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SSR invalidation             | Publish compiler dirtiness synchronously before Vite invalidation. Use the file-to-module index for every loaded owner/query variant and its importers. Known unloaded owners retain unrelated modules; unknown ownership keeps whole-graph invalidation. File-invalidation timestamps prevent new readers sharing old pending transforms and old completions overwriting newer caches. | Five owner/query/pending-transform regressions in [compiler-environments.spec.ts](src/lib/compiler-environments.spec.ts); packed native races and [ownership fixture](scripts/compiler-ownership-qualification.mjs). |
| Fast behavioral edits        | The existing AST distinguishes proven literal template/style metadata changes. Methods, fields, constructors, changed dependencies, directives, pipes and ambiguous edits reload automatically. Replacement preserves the original live component class and factory; it does not copy donor prototypes or mutate directive/pipe definitions before reload.                              | [AST tests](src/lib/compiler/hmr.spec.ts), [browser behavior fixture](scripts/compiler-fast-behavior-qualification.mjs).                                                                                             |
| Session lifecycle            | ManagedRuntime is allocated on first execution. Listeners, owned finalizers and native-operation tracking work before execution. Concurrent first use shares the owning session's runtime. Close-before-start and reopen preserve drain ordering. Client, server and restarted configurations own separate runtimes and memo maps.                                                      | [Session tests](src/lib/compiler-session.spec.ts), [scheduler tests](src/lib/compilation-scheduler.spec.ts), [restart tests](src/lib/restartable-plugins.spec.ts).                                                   |
| Includes and instrumentation | `undefined` means uncomputed; `[]` is a computed empty include result. Add/unlink/config changes invalidate it. Existing integration discovery and tsconfig caches remain; no general or cross-generation emit cache was added.                                                                                                                                                         | [Resolver tests](src/lib/utils/tsconfig-resolver.spec.ts). Metric timers `analog.compiler.integrations` and `analog.compiler.native`; debug timings for include discovery and tsconfig parsing.                      |
| Lazy components              | Before Angular metadata replacement, use its renderer factory's existing `componentReplaced` hook to clear previously used renderer entries even when no view is alive. Missing hooks reload. Angular 19 shared-resource edits reload to avoid stale parent definitions. The HMR endpoint suppresses replay during that reload transition so the fresh page stays interactive.          | [Style fixture](scripts/compiler-native-style-qualification.mjs): lazy creation/destruction and template → CSS → template.                                                                                           |

All runtime Effect imports use supported module subpaths; the direct dependency remains exactly `4.0.0-rc.112` and Schema validation remains enabled. Subpaths reduce loaded code, not installed package contents. See [pinned exports](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/package.json) and [pinned ManagedRuntime implementation](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/ManagedRuntime.ts). Public `angular(options): Plugin[]` usage remains native; packed root declarations do not require consumers to use Effect services. Internal shipped declarations still contain Effect types.

## SSR warming

`experimental.ssrHmrWarmup` defaults to true in development. Eligibility begins after an actual development SSR module transform/read; scans do not qualify. After the client handler and compiler readiness settle, the environment adapter arms a single 75 ms quiet-period task for an eligible dirty server compiler. That point is update dispatch settlement, not browser paint.

The delay uses `Effect.sleep` in a fiber owned by the session runtime's scope. New edits replace the delay. Admitted work goes through the existing scheduler; there is no second stream queue or detached fiber. Incoming reads bypass the delay and retain the latest-generation barrier. Background failures remain observable through readiness and the next read; observing a rejection does not turn it into success. A later edit can recover. Close cancels waiting work and drains admitted native compilation; restart gets a fresh scope.

Effect's test clock covers coalescing, immediate reads, edits during warming, failure/recovery, cancellation before admission, drain after admission and restart isolation. Environment tests prove unused SSR and dependency scans cannot trigger speculation. Builds, tests, host HMR disabled and explicit false disable warming; the host configuration controls eligibility, independently of the server child's browser-reload flag.

Warming trades CPU scheduling for foreground request latency. It may compile a used SSR environment even when no subsequent request arrives. It cannot eliminate independent server startup. Fast mode has little program-wide work to precompute and the measured idle tests show no consistent benefit.

| Mode  | Idle ms | Startup order | Foreground SSR median / p95 ms, off → default | First SSR ms, off / default | Node CPU ms, off / default | Node peak RSS MiB, off / default |
| ----- | ------- | ------------- | --------------------------------------------- | --------------------------- | -------------------------- | -------------------------------- |
| ngtsc | 0       | browser       | 90.0 / 131.9 → 87.9 / 139.9                   | 1151.9 / 1124.5             | 16147.9 / 16594.7          | 1289.2 / 1304.3                  |
| ngtsc | 0       | server        | 84.8 / 118.6 → 84.7 / 118.9                   | 1747.1 / 1713.5             | 16569.5 / 16909.0          | 1320.7 / 1300.2                  |
| ngtsc | 250     | browser       | 90.5 / 130.1 → 33.1 / 38.5                    | 1148.7 / 1146.9             | 15964.6 / 16686.3          | 1285.7 / 1294.3                  |
| ngtsc | 250     | server        | 93.4 / 135.4 → 32.0 / 51.7                    | 1758.2 / 1712.3             | 16694.2 / 15932.5          | 1344.0 / 1310.7                  |
| ngtsc | 1000    | browser       | 91.3 / 136.4 → 40.1 / 57.3                    | 1124.9 / 1123.4             | 16672.4 / 15339.6          | 1279.4 / 1261.0                  |
| ngtsc | 1000    | server        | 99.2 / 135.9 → 42.6 / 58.4                    | 1722.1 / 1767.1             | 15334.8 / 16386.0          | 1314.7 / 1300.2                  |
| fast  | 0       | browser       | 36.0 / 52.9 → 36.5 / 54.1                     | 756.8 / 743.9               | 9074.8 / 8982.8            | 1054.5 / 1061.9                  |
| fast  | 0       | server        | 37.7 / 49.2 → 37.8 / 48.8                     | 1281.0 / 1286.5             | 9319.9 / 9218.2            | 1090.3 / 1083.4                  |
| fast  | 250     | browser       | 53.0 / 75.3 → 60.0 / 77.4                     | 745.4 / 782.4               | 8875.4 / 9622.0            | 1048.9 / 1074.9                  |
| fast  | 250     | server        | 62.1 / 77.1 → 57.7 / 78.6                     | 1296.5 / 1317.2             | 9790.2 / 9706.3            | 1084.2 / 1075.6                  |
| fast  | 1000    | browser       | 44.6 / 88.6 → 59.4 / 80.4                     | 740.7 / 762.4               | 8634.4 / 9473.7            | 1033.1 / 1048.3                  |
| fast  | 1000    | server        | 61.2 / 80.1 → 59.6 / 79.0                     | 1281.5 / 1275.5             | 9510.9 / 9508.3            | 1083.8 / 1075.1                  |
| api   | 0       | browser       | 218.3 / 329.2 → 233.0 / 323.7                 | 1928.7 / 1900.5             | 21974.3 / 22969.8          | 1880.4 / 1908.8                  |
| api   | 0       | server        | 224.5 / 584.4 → 220.2 / 338.4                 | 1956.3 / 1954.7             | 22474.8 / 22425.6          | 1797.3 / 1874.9                  |
| api   | 250     | browser       | 234.1 / 303.8 → 45.0 / 149.4                  | 1949.8 / 1892.7             | 22049.0 / 22348.4          | 1847.9 / 1789.2                  |
| api   | 250     | server        | 237.2 / 314.3 → 45.3 / 135.1                  | 1929.1 / 1962.2             | 23058.0 / 22018.9          | 1890.7 / 1841.0                  |
| api   | 1000    | browser       | 235.6 / 348.9 → 51.7 / 60.1                   | 1901.4 / 1901.5             | 23442.5 / 24140.4          | 1861.1 / 1803.4                  |
| api   | 1000    | server        | 223.2 / 346.5 → 41.9 / 60.3                   | 1954.1 / 1944.0             | 23155.2 / 24066.9          | 1762.4 / 1830.7                  |

Server-first workers import/render SSR after Vite listens and before the first browser navigation. Browser-first workers navigate before their first SSR import/render. These are separate startup protocols, not total process cold-start measurements. Fixed waits of 0, 250 and 1000 ms start after browser update assertions. Each flag/order/interval/compiler group contains three fresh processes and five edit pairs with 100 components. The 75 ms delay plus native work can exceed 250 ms; tail latency need not disappear.

## Stylesheet capabilities and fallbacks

| Configuration                                                                                 | CSS-only behavior                                                  | State claim                                                                                                                 |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Ordinary ngtsc, fast or Compilation API styles                                                | Existing Angular metadata update or compatibility reload           | Eligible component instances may survive; focus, selection, DOM identity and child views are not guaranteed.                |
| Integration already externalizes styles, ngtsc, Angular 20–22 / Vite 6–8, `auto`              | Update every recorded non-ShadowDom stylesheet usage in place      | Qualified Emulated/None fixture preserves DOM identity, focus, selection, parent/component counters and nested child state. |
| Integration already externalizes styles, Compilation API, Angular 21–22 / Vite 7–8, `auto`    | Same qualified native update                                       | Same bounded preservation claim.                                                                                            |
| `metadata`, unsupported Angular/Vite capability, ShadowDom, missing identity or failed update | Metadata or explicit full reload with refreshed stylesheet sources | Correctness fallback can reset state.                                                                                       |

Automatic externalization for ordinary ngtsc and Compilation API styles was tested and removed after it missed template-latency gates. The native mechanism remains useful where an integration already pays the external-style cost. Existing integration requests, including detected Tailwind Vite integration, remain respected. The `metadata` escape hatch preserves the ordinary-style policy; external integration requirements still take precedence over inlining.

Native updates change the existing link's `href`; Angular retains ownership of that link. Registry source contents refresh before graph invalidation and update dispatch. Both generated browser identities and Vite's rewritten Sass identities are sent for every recorded usage. Recreating a component or reattaching an original URL cannot restore old stylesheet contents. Sass/Less/PostCSS still use Vite preprocessing and dependency tracking. Shared partial edits in fallback mode traverse the same recorded usages, refresh their sources and reload. A fallback test caught and corrected an incomplete-module-list case on Vite 6.

Templates and unsupported inline styles use Angular metadata replacement. Angular's [metadata HMR implementation](https://github.com/angular/angular/blob/main/packages/core/src/render3/hmr.ts) recreates views; this integration neither snapshots/restores the DOM nor duplicates Angular's renderer. The strongest fixture includes two shared owners, a third lazy owner, repeated Sass partial/direct edits, a focused text input with selection [1,4], stable node references, parent/component/grandchild counters, and template → CSS → template sequences. ShadowDom is checked inside real shadow roots. Counter survival alone is not evidence of native DOM preservation.

## Performance results and acceptance

The acceptance limit is at most 5% regression in browser median/p95 and first/warm build medians. A correctness pass or faster CSS does not override a failed template gate.

| Mode  | Import ms              | Construction ms   | First build ms          | Warm build ms           | First/warm gate |
| ----- | ---------------------- | ----------------- | ----------------------- | ----------------------- | --------------- |
| ngtsc | 725.8 → 652.7 (-10.1%) | 5.2 → 5.1 (-0.9%) | 870.7 → 884.0 (+1.5%)   | 544.9 → 550.5 (+1.0%)   | Pass            |
| fast  | 730.1 → 652.3 (-10.7%) | 5.3 → 5.2 (-2.5%) | 238.7 → 251.4 (+5.3%)   | 146.4 → 144.7 (-1.2%)   | **Miss**        |
| api   | 719.1 → 644.4 (-10.4%) | 5.4 → 5.3 (-2.0%) | 1531.1 → 1558.6 (+1.8%) | 1116.9 → 1110.3 (-0.6%) | Pass            |

| Mode  | Import heap MiB control / candidate | Retained heap MiB control / candidate | Import CPU ms control / candidate | First build CPU ms control / candidate | Warm build CPU ms control / candidate |
| ----- | ----------------------------------- | ------------------------------------- | --------------------------------- | -------------------------------------- | ------------------------------------- |
| ngtsc | 40.4 / 36.6                         | 57.3 / 53.6                           | 953.7 / 867.2                     | 2781.3 / 2978.3                        | 1970.7 / 1997.5                       |
| fast  | 40.4 / 36.6                         | 49.9 / 46.2                           | 971.4 / 849.1                     | 1121.6 / 1138.5                        | 1076.5 / 1061.3                       |
| api   | 40.4 / 36.6                         | 61.7 / 58.0                           | 931.8 / 835.3                     | 3625.5 / 3739.2                        | 3154.7 / 3160.4                       |

Build workers compile 20 components three times in each fresh process. First/warm builds are timed separately from package import and plugin construction. Warm values are each process's mean of builds two and three. All three closed plugin sets remain retained during explicit GC, exposing lifecycle retention. Node CPU excludes native child processes and Chromium. RSS excludes Chromium; the build import RSS delta is not peak memory. Runtime peak RSS uses Node's OS high-water measurement. GC and retained-heap samples are bounded observations, not leak-freedom proof.

| Mode / Vite      | Template median / p95 ms control → candidate | CSS median / p95 ms control → candidate | Largest regression | Gate     |
| ---------------- | -------------------------------------------- | --------------------------------------- | ------------------ | -------- |
| ngtsc / 6-latest | 39.5 / 66.1 → 38.0 / 88.8                    | 32.9 / 50.6 → 32.9 / 52.2               | +34.4%             | **Miss** |
| ngtsc / 7        | 37.9 / 46.8 → 38.9 / 47.7                    | 33.5 / 51.9 → 33.7 / 53.1               | +2.7%              | Pass     |
| ngtsc / 8        | 39.2 / 47.1 → 38.2 / 48.7                    | 32.4 / 39.0 → 32.1 / 41.4               | +6.1%              | **Miss** |
| fast / 6         | 25.0 / 29.3 → 24.8 / 28.6                    | 16.1 / 20.2 → 18.0 / 20.4               | +11.7%             | **Miss** |
| fast / 6-latest  | 25.2 / 29.0 → 25.3 / 29.3                    | 17.7 / 19.9 → 17.8 / 20.8               | +4.2%              | Pass     |
| fast / 7         | 24.6 / 28.1 → 24.8 / 28.4                    | 17.7 / 22.5 → 17.6 / 20.7               | +1.0%              | Pass     |
| fast / 8         | 25.7 / 31.5 → 25.8 / 29.1                    | 17.8 / 20.2 → 18.3 / 20.9               | +3.5%              | Pass     |
| api / 6          | 46.0 / 72.4 → 45.7 / 71.5                    | 46.2 / 57.2 → 45.0 / 57.2               | +0.1%              | Pass     |
| api / 6-latest   | 44.4 / 62.6 → 47.2 / 70.4                    | 45.1 / 57.7 → 47.4 / 59.0               | +12.5%             | **Miss** |
| api / 7          | 40.7 / 61.6 → 44.8 / 68.8                    | 41.4 / 55.6 → 44.0 / 56.3               | +11.6%             | **Miss** |
| api / 8          | 40.8 / 67.2 → 45.8 / 70.3                    | 42.6 / 54.6 → 45.4 / 54.0               | +12.2%             | **Miss** |

Each complete cell has 125 edits per side. Failed workers are retained without replacement and make their complete comparison cell unavailable. The summary records incomplete cells and completed-edit counts. This latency fixture checks the component counter; the separate native-style fixture establishes DOM identity/focus/selection/child-state preservation. First SSR, CPU and Node peak RSS remain in the raw worker JSON; the summary aggregates complete comparison cells only.

| Unavailable comparison | Failed workers         |
| ---------------------- | ---------------------- |
| ngtsc / 6              | control after 17 edits |

| Earlier candidate | Protocol                                                  | Browser cells passing all four latency gates | First/warm build gate misses |
| ----------------- | --------------------------------------------------------- | -------------------------------------------- | ---------------------------- |
| df2671339         | 5 build processes/side; 10 edit pairs/process; frame poll | 4/11                                         | ngtsc coldBuildMs: +5.7%     |
| ac5934a65         | 5 build processes/side; 10 edit pairs/process; frame poll | 8/12                                         | None                         |
| 64f979c3d         | 5 build processes/side; 10 edit pairs/process; DOM events | 4/12                                         | fast coldBuildMs: +6.7%      |

Automatic ngtsc externalization missed gates in repeated frame cohorts, including +31.7% template median on Vite 6.0 in `ac5934a65`. API/Vite 8 in `64f979c3d` improved CSS median by 83.2% but regressed template median by 16.7%; API/Vite 7 template p95 regressed 11.5%. Those optimizations were removed for ordinary styles. A separate 36-process ablation investigated native externalization and the metadata wrapper; it is diagnostic evidence, not a passing acceptance cohort. The fast compiler now emits the metadata wrapper directly in its existing footer, avoiding an extra post-transform AST/map pass.

The Effect prerelease status, maintenance vocabulary and installation footprint remain costs. Historical package-file accounting was 47,533,320 bytes for Effect, not compressed download size or incremental pnpm-store allocation. The exact dependency is unchanged here; no new installation-size saving is claimed. Browser and production application graphs remain Effect-free in packed checks. Server-first and browser-first measurements do not establish universal production startup performance.

## Qualification and reproduction

- **980 package tests pass**, six existing skips, source/test typechecks, ESLint and build/artifact verification.
- **13 packed Linux tuples pass:** Angular 17.3.12, 18.2.14, 19.0.0, 19.0.1, 20.0.0 and 20.1.0 / Vite 6.0.0; Angular 21.0.0 / Vite 7.0.0; Angular 22.0.0 / Vite 6.0.0, 6.4.3, 7.0.0, 7.3.6, 8.0.0 and 8.2.2. Older Angular rows use Node 20.19.5.
- Angular 22/Vite 8.2.2 includes **19 native/metadata/encapsulation cases**, **six fast behavioral reload cases**, the existing nine shared-Sass cases and native SSR/source/resource races. Angular 19.0.1 now includes both shared-resource reload strategies and lazy interaction afterward.
- **15 further style cases** cover Vite 6.0/6.4/7.3/8.2, plus **21 further checks**: eight explicit metadata/external-style fallbacks, ten Angular 19–21 style cases, and three ownership fixtures. These are correctness results, not comparative latency samples.
- **Nine new 15-minute soaks pass:** 540 edit pairs, 27 restarts and 900 queued callers drained. Concurrent soaks qualify behavior and memory observations, not comparative latency. All resource SSR reads begin at the watcher boundary without manual graph refresh.

| Vite  | Mode  | Update window seconds | Kernel peak Node RSS MiB | Heap after close/GC MiB | Shutdown with 100 queued calls ms |
| ----- | ----- | --------------------- | ------------------------ | ----------------------- | --------------------------------- |
| 6.0.0 | api   | 900.0                 | 1182.4                   | 114.7                   | 596.7                             |
| 6.0.0 | fast  | 900.0                 | 492.5                    | 116.9                   | 8.0                               |
| 6.0.0 | ngtsc | 900.0                 | 848.3                    | 130.5                   | 208.5                             |
| 6.4.3 | api   | 900.0                 | 1173.3                   | 109.4                   | 615.6                             |
| 6.4.3 | fast  | 900.0                 | 478.3                    | 109.1                   | 9.5                               |
| 6.4.3 | ngtsc | 900.0                 | 884.3                    | 125.4                   | 204.0                             |
| 8.2.2 | api   | 900.0                 | 1759.2                   | 123.4                   | 583.1                             |
| 8.2.2 | fast  | 900.0                 | 1105.8                   | 128.2                   | 9.8                               |
| 8.2.2 | ngtsc | 900.0                 | 1385.8                   | 141.7                   | 211.8                             |

The Windows job uses the same expanded packed runner. A dated, revision-specific CI snapshot is maintained in the [PR test plan](https://github.com/analogjs/analog/pull/2521#user-content-test-plan-and-current-ci); an old green run is not evidence for a newer head. The PR remains draft pending maintainer review.

The raw archive and [machine-readable summary](hmr-integration-qualification.json) keep historical, intermediate, final, diagnostic and soak cohorts separate. They record revision/toolchain/worker/package hashes, failures and bounded evidence. Workspace, fixture, packed-consumer and Node installation roots in published evidence are replaced with declared placeholders; normalization is declared and archive hashes apply to the published bytes. No installed dependencies or credentials are included.

Use Node **24.15.0** and pnpm **10.33.0** for the workspace and comparison. The older Angular consumer rows use a separate Node **20.19.5** executable. Start at the published documentation head in an Analog checkout containing the recorded commits and evidence archive. The commands create separate detached worktrees and packed consumers; use a new, empty qualification directory.

```sh
export QUAL_ROOT=/tmp/analog-hmr-reproduction
export CONTROL=fd8b2890295b396c762d7a7d8e9b6a90759a0ae5
export CANDIDATE=e66dfc92058e49c89efa722b88a9b0300a4a2707
export NX_DAEMON=false NX_NO_CLOUD=true
mkdir -p "$QUAL_ROOT/evidence"
export QUAL_EVIDENCE="$QUAL_ROOT/evidence"
tar -xzf packages/vite-plugin-angular/evidence/hmr-integration/qualification-results.tar.gz -C "$QUAL_EVIDENCE"
git worktree add --detach "$QUAL_ROOT/control-src" "$CONTROL"
git worktree add --detach "$QUAL_ROOT/candidate-src" "$CANDIDATE"
for side in control candidate
do
  (
    cd "$QUAL_ROOT/$side-src"
    pnpm install --frozen-lockfile
    pnpm nx run-many -t test,typecheck,typecheck-tests,build -p vite-plugin-angular --parallel=1
    pnpm nx run eslint:lint
    cd packages/vite-plugin-angular/dist
    pnpm pack --pack-destination "$QUAL_ROOT/artifacts/$side"
  )
done
export QUAL_SCRIPTS="$QUAL_ROOT/candidate-src/packages/vite-plugin-angular/scripts"
```

Prepare exact direct dependencies for each installed consumer. Published consumer lockfiles in the archive retain the measured transitive resolutions; tarball paths must be replaced with the locally packed artifact paths when replaying those lockfiles.

```sh
python3 - <<'PY'
import json, os, pathlib
root = pathlib.Path(os.environ['QUAL_ROOT'])
for vite, version in [('6', '6.0.0'), ('6-latest', '6.4.3'), ('7', '7.3.6'), ('8', '8.2.2')]:
    for side in ['control', 'candidate']:
        consumer = root / f'vite{vite}-{side}'
        consumer.mkdir()
        deps = {f'@angular/{name}': '22.0.0' for name in ['build', 'common', 'compiler', 'compiler-cli', 'core', 'platform-browser', 'platform-server']}
        deps.update({'@analogjs/vite-plugin-angular': 'file:' + str(next((root / 'artifacts' / side).glob('*.tgz'))), '@jridgewell/trace-mapping': '0.3.31', '@types/node': '24.13.3', 'playwright': '1.59.1', 'rxjs': '7.8.2', 'sass': '1.97.3', 'tslib': '2.8.1', 'typescript': '6.0.2', 'vite': version, 'zone.js': '0.16.1'})
        (consumer / 'package.json').write_text(json.dumps({'name': 'analog-hmr-qualification', 'private': True, 'type': 'module', 'packageManager': 'pnpm@10.33.0', 'pnpm': {'onlyBuiltDependencies': ['esbuild', '@parcel/watcher', 'lmdb', 'msgpackr-extract']}, 'dependencies': deps}, indent=2) + '\n')
PY
for consumer in "$QUAL_ROOT"/vite*-control "$QUAL_ROOT"/vite*-candidate
do
  (cd "$consumer" && pnpm install --ignore-workspace --prefer-offline)
done
(cd "$QUAL_ROOT/vite8-candidate" && pnpm exec playwright install chromium)
```

Run correctness before timing. Set `NODE_20` to the absolute Node 20.19.5 executable. The smoke runner builds installed consumers from the already-built candidate package and retains their evidence paths. Angular 22/Vite 8.2.2 runs the 19 expanded style cases and six fast behavior cases; Angular 19.0.1 additionally exercises both shared-resource reload strategies.

```sh
cd "$QUAL_ROOT/candidate-src"
for angular in 17.3.12 18.2.14 19.0.0 19.0.1 20.0.0 20.1.0
do
  node "$QUAL_SCRIPTS/compiler-vite-smoke.mjs" --angular="$angular" --vite=6.0.0 --node-executable="$NODE_20" > "$QUAL_ROOT/packed-$angular-6.0.0.log"
done
node "$QUAL_SCRIPTS/compiler-vite-smoke.mjs" --angular=21.0.0 --vite=7.0.0 > "$QUAL_ROOT/packed-21.0.0-7.0.0.log"
for vite in 6.0.0 6.4.3 7.0.0 7.3.6 8.0.0 8.2.2
do
  node "$QUAL_SCRIPTS/compiler-vite-smoke.mjs" --angular=22.0.0 --vite="$vite" > "$QUAL_ROOT/packed-22.0.0-$vite.log"
done
for consumer in "$QUAL_ROOT"/vite*-candidate
do
  cp "$QUAL_SCRIPTS/compiler-native-style-qualification.mjs" "$consumer/native-style.mjs"
  cp "$QUAL_SCRIPTS/compiler-ownership-qualification.mjs" "$consumer/ownership.mjs"
  for mode in ngtsc api
  do
    for strategy in auto metadata
    do
      (cd "$consumer" && NODE_ENV=development node native-style.mjs --mode="$mode" --strategy="$strategy" --externalize --output="external-$mode-$strategy.json")
    done
  done
done
for mode in ngtsc fast api
do
  (cd "$QUAL_ROOT/vite8-candidate" && NODE_ENV=development node --expose-gc ownership.mjs --mode="$mode" --edits=2 --output="ownership-$mode.json")
done
```

Run the ten additional older-version style cases in the retained packed consumers. Export `NODE_20` so the Python driver can select it for Angular 19 and 20.

```sh
export NODE_20
python3 - <<'PYTHON'
import os, pathlib, re, shutil, subprocess
root, scripts = pathlib.Path(os.environ['QUAL_ROOT']), pathlib.Path(os.environ['QUAL_SCRIPTS'])
env = {**os.environ, 'NODE_ENV': 'development'}
for angular, vite, modes in [('19.0.1', '6.0.0', ['ngtsc']), ('20.0.0', '6.0.0', ['ngtsc']), ('20.1.0', '6.0.0', ['ngtsc']), ('21.0.0', '7.0.0', ['ngtsc', 'api'])]:
    log = (root / f'packed-{angular}-{vite}.log').read_text()
    consumer = pathlib.Path(re.search('Installed-package evidence retained at (.+)', log).group(1))
    shutil.copyfile(scripts / 'compiler-native-style-qualification.mjs', consumer / 'native-final.mjs')
    subprocess.run(['pnpm', 'add', '--ignore-workspace', 'sass@1.97.3'], cwd=consumer, check=True)
    node = 'node' if angular.startswith('21') else os.environ['NODE_20']
    for mode in modes:
        for strategy in ['auto', 'metadata']:
            subprocess.run([node, 'native-final.mjs', f'--mode={mode}', f'--strategy={strategy}', f'--output=extra-{mode}-{strategy}.json', *([] if angular.startswith('19') else ['--externalize'])], cwd=consumer, env=env, check=True)
PYTHON
```

Run the fixed final protocol serially on an otherwise idle host. Do not overlap it with package builds or correctness workers. The portable archive driver copies the runtime worker into all eight consumers, then runs 90 build processes, 120 paired HMR processes and 108 SSR-idle processes. It retains existing JSON observations, including failures, and continues the remaining paired cells without replacement. It returns a failing exit status if any worker failed. The recorded orchestration scripts are archived separately; the portable version accepts local paths and labels control/candidate explicitly.

```sh
python3 "$QUAL_EVIDENCE/reproduce/fixed-cohort.py" --root="$QUAL_ROOT" --scripts="$QUAL_SCRIPTS" --output="$QUAL_ROOT/final-results"
python3 "$QUAL_EVIDENCE/reproduce/summarize.py" "$QUAL_ROOT/final-results" > "$QUAL_ROOT/summary.json"
```

The repository suite is also available for individual phases; it stops on the first failure. Do not rerun a failed sample to replace it. Use the archive driver to continue untouched cells, and retain its failed exit status and raw observations when assessing acceptance.

Run soaks only after comparative workers finish. The suite runs nine concurrent correctness jobs with 100 components, 60 edit pairs, a 900,000 ms update window, three restarts and 100 queued shutdown callers each. Vite 6.0 uses the Environment Runner; 6.4.3 and 8.2.2 use the legacy SSR loader because Vite 6.0 retains an old legacy runner on restart.

```sh
NODE_ENV=development node "$QUAL_SCRIPTS/compiler-qualification-suite.mjs" --root="$QUAL_ROOT" --phase=soak --hmr --output="$QUAL_ROOT/soaks"
```

See the [migration guide](../../apps/docs-analog/src/content/guides/migrating-v2-to-v3.md#development-updates-and-component-styles) for both escape hatches. The PR holds revision-specific metrics and a dated CI snapshot. The issue holds implementation-obligation disposition and the outstanding adoption decision.

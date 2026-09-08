# HMR p95 sprint: implementation and qualification

This follow-up to [analogjs/analog#2521](https://github.com/analogjs/analog/pull/2521) keeps the original acceptance limits: at most 5% regression in each browser median/p95 and each first/warm build median. The sprint began on 2026-09-08 at 03:18 UTC with a two-hour implementation budget and seven isolated worktrees. The maintainer's adoption decision remains in [analogjs/analog#2519](https://github.com/analogjs/analog/issues/2519).

**The strict 5% acceptance gate remains unmet: 6/12 browser cells pass all four latency limits; first/warm build gates pass. The latency misses are detailed below. No overall speedup or completed performance-acceptance claim is made.**

## CI follow-up and unresolved correctness

The documentation head `5cf1a8a1858eb77cdefed65a4e6fdebe346215a7` exposed two failures in [the 2026-09-08 compatibility run](https://github.com/analogjs/analog/actions/runs/34187310136), despite an unchanged measured runtime and the preceding source-head CI passing. **Overall correctness acceptance is therefore open.** The passing local cohorts below remain attributed evidence, not proof that these failures are eliminated.

- **Angular 22/Vite 6.0 shared styles:** after shared HTML and CSS edits, both owners received Angular and Vite update events, but the final child nodes lost emulated encapsulation attributes and stylesheet application. The exact fresh local packed fixture passed. This is an intermittent observed output defect; its root cause is unproven. No speculative renderer-cache reordering was applied. [Failed job](https://github.com/analogjs/analog/actions/runs/34187310136/job/101938134944), [browser failure artifact](evidence/hmr-p95-sprint/ci-shared-style-failure.json).
- **Windows Angular 22/Vite 8.2.2:** the API ShadowDom fixture timed out waiting for its initial element, before any edit. Earlier browser/runtime checks and the other encapsulation cases passed. A fresh Linux consumer using the same packed artifact passed all nine style cases, including API ShadowDom and shared-Sass edits. The Windows artifact lacks browser diagnostics for this bootstrap timeout, so it does not establish a cause. [Failed job](https://github.com/analogjs/analog/actions/runs/34187310136/job/101938135017).

GitHub rejected the failed-job rerun because the current account lacks repository admin rights. Subsequent passing checks cannot by themselves establish that these intermittent failures are fixed. The PR records the latest exact-head snapshot; both failures remain qualification limitations until diagnosed and resolved.

## Implemented changes and retained boundaries

- Fast compilation shares the original OXC parse between the behavioral HMR signature and resource discovery. The compiler reuses it only if resource inlining leaves the source byte-identical; otherwise it parses the rewritten source. Parse errors still decline metadata HMR. Existing external SCSS preprocessing, JIT and disabled-HMR behavior remain covered.
- The Compilation API normalizes compilation-wide error/warning strings once for all affected outputs. The outputs share those arrays; current consumers only read them. Diagnostics and generation barriers are unchanged.
- The qualification suite retains failed/incomplete evidence, validates a cohort manifest on resume, and completes untouched paired cells after a failure. Soaks use a four-minute update window with a five-minute total process timeout, including setup and shutdown.

No new stylesheet cache was accepted. Review found that an attempted path-identity cache could retain stale content, including after actual stylesheet deletion. Its revisions remain unqualified local experiments. A warmup enabled/off diagnostic did not identify warming as the cause of the observed ngtsc tail; the 75 ms policy and after-client-settlement ordering remain intact.

The [integrated correctness and capability record](HMR_INTEGRATION.md#correctness-and-ownership) continues to apply: synchronous SSR dirtiness, every loaded query/importer, pending-transform timestamps, automatic fast behavioral reloads, lazy independent Effect runtimes, empty include-cache reuse and scoped warming only after SSR use. Effect remains exactly `4.0.0-rc.112`, with Schema and its installation/prerelease costs. No equivalent optimized Effect-free implementation was measured.

Native CSS preservation remains limited to existing integration externalization: ngtsc on Angular 20–22/Vite 6–8 and Compilation API on Angular 21–22/Vite 7–8. Separate fixtures check focus, selection, DOM identity and child state through shared/lazy Sass and template → CSS → template sequences. Ordinary styles retain metadata updates; metadata recreates views, and ShadowDom/unsupported/missing-identity/failed paths retain reload fallbacks. `experimental.componentStyleHmr: 'metadata'` and `experimental.ssrHmrWarmup: false` remain escape hatches. Warming may spend CPU without a subsequent request and cannot remove independent server startup.

## Revisions and fair-control repair

| Role                              | Source identity                            | Packed SHA-256                                                     |
| --------------------------------- | ------------------------------------------ | ------------------------------------------------------------------ |
| Correctness-only repaired control | `2283861272f094b0773841bb10895502f88c8235` | `64740753ba2edc3fbd6ced0cc1b180cc2b34f729e80bbbe98da9cb393d19ca90` |
| Candidate                         | `97366bd010567b8e8d9dc731007d54a1d8f0fd6b` | `fb1d30c89842a8261ea88437f30dbe1d4fede2008bd5c68b1af8bc98d838f988` |

Candidate runtime source tree: `b3edbd16cb4c8dd323d976cba072d852fff26860`; pre-publication complete tree: `4ea425acbb412933f0198e131394a60e14343d48`. Control tree: `52db2d9a9a3c5bed2afa0518cf58a1c9845ae6fc`. [Raw archive](evidence/hmr-p95-sprint/qualification-results.tar.gz), SHA-256 `8eaac46ee49766ae5fc3f8d623449b5c409bbd04fc26baa6e7e6e8b75e89a37e` (3,053,768 bytes; 917 files). [Machine-readable summary](hmr-p95-sprint-qualification.json).

The control starts at the original correctness-only `fd8b289` and backports the candidate's Angular renderer-factory cache invalidation before metadata replacement. The fast footer uses the same direct helper path and early post-transform return as the candidate; it does not add control-only AST parsing, rewriting or source-map generation. The repair does not backport Effect subpath/lazy-runtime changes, SSR warming or native CSS updates.

The historical original-control failure after 17 edit pairs remains in the [previous archive](evidence/hmr-integration/qualification-results.tar.gz). Four fresh 100-pair original runs and two repaired 100-pair diagnostic runs passed without reproducing it. The final fair control separately passed 25-pair fast and ngtsc checks before measurement. These runs qualify behavior but do not establish that the intermittent failure is eliminated. Superseded control variants and diagnostics are separately attributed; their timings are not acceptance samples.

The measured candidate runtime was published as `97366bd010567b8e8d9dc731007d54a1d8f0fd6b` during this run. Its archived patch applies to the recorded published base, and its source-tree hash identifies the exact measured runtime. The final publication adds documentation/evidence without changing that source tree. The archive includes both exact packed artifacts and reproducible source patches, so local-only control commits are not required to replay it.

## Fixed comparison protocol

All comparative workers use Angular 22.0.0, TypeScript 6.0.2, Node 24.15.0, pnpm 10.33.0 and Playwright 1.59.1 on the same Linux AMD EPYC 7773X host with 128 logical CPUs. Vite versions are 6.0.0, 6.4.3, 7.3.6 and 8.2.2. All 249 installed files in each of eight consumers were byte-checked against its tarball. Original transitive dependency pins were retained; only tarball paths/integrities changed.

Processes run serially, alternating sides, after all owned correctness/build/profiling jobs finish. At the user’s request, the driver paused between workers for the interim commit/push/PR update; the current worker finished before local hooks ran, and the same fixed cohort resumed without replacing samples. The pause interval is archived. Orchestrator elapsed time for the finishing worker includes this pause; its in-worker edit/SSR/CPU measurements are unchanged. Unrelated host services are preserved; whole-host busy percentage and load averages are recorded every ten seconds. This is not a dedicated machine or a statistical confidence bound. Filesystem/package caches are warm.

Builds use 15 fresh processes per side/mode, 20 components and three builds per process, with explicit GC and all three closed plugin sets retained. Browser comparisons use five fresh processes per side/mode/Vite and 25 template/CSS pairs per process. Browser median and nearest-rank p95 pool all 125 edits per side, including first edits. DOM MutationObserver/style-load listeners are armed before each file write; timings observe DOM/computed style, not paint. The latency fixture's counter is not the native CSS DOM-preservation proof. No manual SSR graph invalidation is used.

SSR idle groups use three fresh processes per flag/startup order/interval/mode, 100 components and five pairs. Fixed 0/250/1000 ms waits follow frame-polled browser assertions; foreground SSR import/render timing is separate. Server-first imports/renders after Vite listens and before browser navigation; browser-first navigates first. Neither is total process cold-start time. Do not pool frame-polled and DOM-event browser latencies.

Failed workers remain in the cohort without replacement; a missing/failed side makes its comparison cell unavailable. The prior `e66dfc` cohort remains historical and is not pooled with this repaired-control cohort. Node CPU/RSS exclude Chromium and native child processes; retained heap is not proof of leak freedom.

## Performance results and acceptance

| Mode  | Import ms              | Construction ms   | First build ms          | Warm build ms           | First/warm gate |
| ----- | ---------------------- | ----------------- | ----------------------- | ----------------------- | --------------- |
| ngtsc | 728.1 → 652.2 (-10.4%) | 5.2 → 5.1 (-1.9%) | 892.4 → 899.7 (+0.8%)   | 566.4 → 563.1 (-0.6%)   | Pass            |
| fast  | 724.2 → 646.5 (-10.7%) | 5.3 → 5.1 (-2.9%) | 239.3 → 249.0 (+4.0%)   | 146.4 → 145.2 (-0.8%)   | Pass            |
| api   | 722.4 → 646.5 (-10.5%) | 5.4 → 5.2 (-2.4%) | 1567.2 → 1559.0 (-0.5%) | 1132.1 → 1145.0 (+1.1%) | Pass            |

| Mode  | Import heap MiB control / candidate | Retained heap MiB control / candidate | Import CPU ms control / candidate | First build CPU ms control / candidate | Warm build CPU ms control / candidate |
| ----- | ----------------------------------- | ------------------------------------- | --------------------------------- | -------------------------------------- | ------------------------------------- |
| ngtsc | 40.4 / 36.6                         | 57.3 / 53.6                           | 983.3 / 880.3                     | 2969.8 / 3076.3                        | 2080.2 / 2128.7                       |
| fast  | 40.4 / 36.6                         | 49.9 / 46.2                           | 972.7 / 861.1                     | 1137.2 / 1185.8                        | 1136.9 / 1069.8                       |
| api   | 40.4 / 36.6                         | 61.6 / 58.0                           | 949.0 / 862.8                     | 3790.5 / 3782.2                        | 3427.0 / 3315.3                       |

| Mode / Vite      | Template median / p95 ms control → candidate | CSS median / p95 ms control → candidate | Largest regression | Gate     |
| ---------------- | -------------------------------------------- | --------------------------------------- | ------------------ | -------- |
| ngtsc / 6        | 39.0 / 50.2 → 39.1 / 90.7                    | 32.6 / 51.9 → 33.2 / 53.3               | +80.8%             | **Miss** |
| ngtsc / 6-latest | 39.5 / 47.8 → 39.1 / 48.3                    | 34.0 / 52.7 → 33.9 / 54.1               | +2.7%              | Pass     |
| ngtsc / 7        | 38.9 / 52.4 → 38.8 / 48.0                    | 33.4 / 50.6 → 34.0 / 53.4               | +5.5%              | **Miss** |
| ngtsc / 8        | 39.6 / 46.8 → 38.8 / 48.2                    | 32.9 / 38.4 → 32.0 / 42.9               | +11.8%             | **Miss** |
| fast / 6         | 25.6 / 28.9 → 24.7 / 28.5                    | 17.6 / 20.1 → 17.9 / 20.6               | +2.7%              | Pass     |
| fast / 6-latest  | 25.5 / 29.3 → 25.0 / 29.8                    | 17.9 / 20.7 → 17.6 / 20.1               | +1.6%              | Pass     |
| fast / 7         | 25.0 / 28.6 → 24.9 / 30.0                    | 17.5 / 20.3 → 17.5 / 20.7               | +4.9%              | Pass     |
| fast / 8         | 25.5 / 28.7 → 25.7 / 28.9                    | 17.7 / 19.9 → 17.6 / 21.0               | +5.5%              | **Miss** |
| api / 6          | 47.2 / 75.9 → 47.9 / 81.1                    | 43.9 / 57.3 → 43.4 / 50.2               | +6.9%              | **Miss** |
| api / 6-latest   | 47.6 / 68.6 → 48.4 / 74.2                    | 45.4 / 56.2 → 48.1 / 57.5               | +8.0%              | **Miss** |
| api / 7          | 46.0 / 74.4 → 45.9 / 74.3                    | 42.2 / 54.3 → 44.3 / 54.4               | +4.9%              | Pass     |
| api / 8          | 47.8 / 76.7 → 47.6 / 71.8                    | 48.1 / 57.2 → 46.2 / 56.3               | -0.5%              | Pass     |

Each complete cell has 125 edits per side. Failed workers are retained without replacement and make their complete comparison cell unavailable. The summary records incomplete cells and completed-edit counts. This latency fixture checks the component counter; the separate native-style fixture establishes DOM identity/focus/selection/child-state preservation. First SSR, CPU and Node peak RSS remain in the raw worker JSON; the summary aggregates complete comparison cells only.

## SSR idle, CPU and memory

| Mode  | Idle ms | Startup order | Foreground SSR median / p95 ms, off → default | First SSR ms, off / default | Node CPU ms, off / default | Node peak RSS MiB, off / default |
| ----- | ------- | ------------- | --------------------------------------------- | --------------------------- | -------------------------- | -------------------------------- |
| ngtsc | 0       | browser       | 90.3 / 129.7 → 87.4 / 127.8                   | 1169.9 / 1161.4             | 17067.7 / 17149.5          | 1315.3 / 1282.5                  |
| ngtsc | 0       | server        | 82.5 / 112.9 → 81.7 / 121.2                   | 1728.0 / 1702.9             | 16870.8 / 16802.6          | 1302.7 / 1308.8                  |
| ngtsc | 250     | browser       | 104.3 / 131.0 → 34.6 / 46.5                   | 1158.9 / 1184.8             | 17460.9 / 17749.4          | 1301.5 / 1320.0                  |
| ngtsc | 250     | server        | 101.2 / 141.2 → 35.7 / 52.0                   | 1777.0 / 1754.3             | 18111.8 / 17856.7          | 1319.6 / 1305.6                  |
| ngtsc | 1000    | browser       | 112.6 / 157.7 → 41.9 / 61.7                   | 1152.1 / 1174.5             | 17345.2 / 17744.0          | 1315.2 / 1305.2                  |
| ngtsc | 1000    | server        | 114.6 / 176.1 → 48.4 / 57.7                   | 1717.0 / 1776.7             | 18210.3 / 17671.9          | 1317.1 / 1285.1                  |
| fast  | 0       | browser       | 40.3 / 52.8 → 41.9 / 53.2                     | 780.4 / 758.6               | 9806.8 / 9383.7            | 1086.4 / 1088.1                  |
| fast  | 0       | server        | 38.2 / 49.3 → 40.4 / 48.5                     | 1298.1 / 1311.4             | 9831.5 / 9884.7            | 1093.5 / 1098.0                  |
| fast  | 250     | browser       | 58.6 / 77.8 → 60.5 / 77.6                     | 781.8 / 789.0               | 9970.5 / 10286.1           | 1043.7 / 1079.9                  |
| fast  | 250     | server        | 61.7 / 72.5 → 65.1 / 77.7                     | 1320.7 / 1287.2             | 10088.9 / 9706.0           | 1078.2 / 1064.5                  |
| fast  | 1000    | browser       | 67.5 / 83.9 → 65.4 / 81.1                     | 793.9 / 785.5               | 9751.7 / 10411.6           | 1056.8 / 1098.1                  |
| fast  | 1000    | server        | 66.1 / 81.4 → 60.5 / 81.2                     | 1297.3 / 1304.5             | 9771.5 / 9957.6            | 1087.1 / 1081.7                  |
| api   | 0       | browser       | 226.1 / 345.9 → 224.5 / 328.7                 | 1874.6 / 1894.1             | 22808.8 / 23097.6          | 1880.2 / 1858.3                  |
| api   | 0       | server        | 220.8 / 309.4 → 224.0 / 317.6                 | 1966.6 / 1942.7             | 22033.4 / 22961.6          | 1916.1 / 1820.7                  |
| api   | 250     | browser       | 222.3 / 334.6 → 47.2 / 96.5                   | 1894.2 / 1868.1             | 21629.4 / 21463.0          | 1805.3 / 1775.5                  |
| api   | 250     | server        | 225.1 / 304.9 → 42.0 / 121.3                  | 1946.6 / 1926.4             | 21148.6 / 22208.2          | 1767.6 / 1889.0                  |
| api   | 1000    | browser       | 207.0 / 339.2 → 50.1 / 62.3                   | 1862.8 / 1908.9             | 22172.3 / 21585.5          | 1832.4 / 1885.6                  |
| api   | 1000    | server        | 236.9 / 329.4 → 42.6 / 59.5                   | 1954.4 / 1994.9             | 22480.4 / 22902.7          | 1903.9 / 1904.1                  |

## Correctness and bounded soaks

- **983 package tests pass**, with six existing skips; library/test typechecks, ESLint and build/artifact gates pass.
- **13 packed Linux tuples pass:** Angular 17.3.12, 18.2.14, 19.0.0, 19.0.1, 20.0.0 and 20.1.0 / Vite 6.0.0; Angular 21.0.0 / Vite 7.0.0; Angular 22.0.0 / Vite 6.0.0, 6.4.3, 7.0.0, 7.3.6, 8.0.0 and 8.2.2. Older Angular consumers use Node 20.19.5.
- The expanded Angular 22/Vite 8.2.2 tuple includes 19 style/encapsulation cases, six fast behavioral reload cases, nine shared-Sass cases, and native source/resource SSR races, restarts and queued shutdown. Angular 19.0.1 covers both shared-resource reload strategies and lazy interaction.
- **15 additional native/style cases and 21 further metadata/version/ownership checks pass.** Their DOM/focus/selection/child-state assertions remain distinct from the counter-only latency fixture.
- **Nine new short soaks pass:** 540 edit pairs, 27 restarts and 900 queued callers drained. Each four-minute update window fits the five-minute total process cap. Total process times were 243.9–249.0 seconds. Concurrent soak latencies are not comparative evidence.

| Vite  | Mode  | Update seconds | Peak Node RSS MiB | Heap after close/GC MiB | Shutdown with 100 queued calls ms |
| ----- | ----- | -------------- | ----------------- | ----------------------- | --------------------------------- |
| 6.0.0 | api   | 240.7          | 1236.5            | 114.6                   | 594.9                             |
| 6.0.0 | fast  | 240.0          | 502.5             | 116.2                   | 6.9                               |
| 6.0.0 | ngtsc | 240.0          | 900.7             | 130.6                   | 196.5                             |
| 6.4.3 | api   | 240.6          | 1208.1            | 109.7                   | 626.0                             |
| 6.4.3 | fast  | 240.0          | 472.6             | 110.0                   | 6.4                               |
| 6.4.3 | ngtsc | 240.0          | 869.9             | 125.1                   | 190.1                             |
| 8.2.2 | api   | 240.7          | 1827.6            | 126.6                   | 611.9                             |
| 8.2.2 | fast  | 240.0          | 1092.7            | 127.9                   | 6.5                               |
| 8.2.2 | ngtsc | 240.0          | 1508.4            | 140.6                   | 193.3                             |

The dated, exact published-head Windows/CI snapshot is in the [PR test plan](https://github.com/analogjs/analog/pull/2521#user-content-test-plan-and-current-ci). A previous green run is not evidence for a new head. The PR remains draft pending maintainer review.

## Reproduction and evidence

Use the archived artifacts to replay the exact measured bytes. Use Node **24.15.0** and pnpm **10.33.0**, an Analog checkout at the published head, and a new empty output root. Workspace source checks use Nx; the installed-consumer scripts exercise the packed package.

```sh
export QUAL_ROOT=/tmp/analog-hmr-p95-reproduction
export QUAL_EVIDENCE="$QUAL_ROOT/evidence"
export NX_DAEMON=false NX_NO_CLOUD=true
mkdir -p "$QUAL_EVIDENCE"
tar -xzf packages/vite-plugin-angular/evidence/hmr-p95-sprint/qualification-results.tar.gz -C "$QUAL_EVIDENCE"
cp "$QUAL_EVIDENCE/artifacts/control-p95.tgz" "$QUAL_ROOT/control-p95.tgz"
cp "$QUAL_EVIDENCE/artifacts/candidate-p95.tgz" "$QUAL_ROOT/candidate-p95.tgz"
export QUAL_SCRIPTS="$PWD/packages/vite-plugin-angular/scripts"
pnpm install --frozen-lockfile
pnpm nx run-many -t test,typecheck,typecheck-tests,eslint:lint,build -p vite-plugin-angular --parallel=2
python3 - <<'PY'
import os,pathlib
root=pathlib.Path(os.environ['QUAL_ROOT']); evidence=pathlib.Path(os.environ['QUAL_EVIDENCE'])
for vite in [6,'6-latest',7,8]:
    for side in ['control','candidate']:
        name=f'vite{vite}-{side}'; consumer=root/name; consumer.mkdir()
        for file in ['package.json','pnpm-lock.yaml']:
            text=(evidence/'consumers'/name/file).read_text().replace('<fixtures>',str(root))
            (consumer/file).write_text(text)
PY
for consumer in "$QUAL_ROOT"/vite*-*
do
  (cd "$consumer" && pnpm install --ignore-workspace --frozen-lockfile)
done
```

To rebuild the exact sources instead, create separate worktrees at `fd8b2890295b396c762d7a7d8e9b6a90759a0ae5` for the control and `e64b7d012fb6778b31e03f9581393c11d19b870d` for the candidate, then `git apply` the archive's `source/control.patch` and `source/candidate.patch` respectively. Install frozen dependencies, run the package Nx gates above, and `pnpm pack` from `packages/vite-plugin-angular/dist`. The archive manifest records measured artifact hashes and source trees; a newly packed tar can have packaging metadata differences, so the archived tarballs are the byte-exact replay inputs.

Run correctness first. The archive includes the 13-tuple matrix and the further native/fallback/ownership drivers; their recorded absolute roots are declared placeholders to substitute locally. The full matrix requires a second Node **20.19.5** executable for Angular 17–20. Individual packed checks can be invoked directly:

```sh
node "$QUAL_SCRIPTS/compiler-vite-smoke.mjs" --angular=22.0.0 --vite=8.2.2
node "$QUAL_SCRIPTS/compiler-vite-smoke.mjs" --angular=19.0.1 --vite=6.0.0 --node-executable=/absolute/path/to/node-20.19.5
```

After all correctness/build/profiling jobs finish, run the fixed comparison serially. The driver labels sides explicitly, retains existing JSON and incomplete logs, continues untouched cells, and returns failure if any worker fails. Use a fresh directory for a new cohort; never replace failed observations with retries.

```sh
python3 "$QUAL_EVIDENCE/reproduce/fixed-cohort.py" \
  --root "$QUAL_ROOT" --scripts "$QUAL_SCRIPTS" \
  --output "$QUAL_ROOT/results" --node "$(command -v node)"
python3 "$QUAL_EVIDENCE/reproduce/summarize.py" "$QUAL_ROOT/results" > "$QUAL_ROOT/summary.json"
```

The new suite requires the cohort manifest and preserves all nine all-mode soak outcomes. Its default `ngtsc` filename suffix labels the invocation, not the mode coverage. Run it outside the comparative window:

```sh
NODE_ENV=development node "$QUAL_SCRIPTS/compiler-qualification-suite.mjs" \
  --root="$QUAL_ROOT" --manifest="$QUAL_EVIDENCE/revisions.json" \
  --phase=soak --hmr --output="$QUAL_ROOT/short-soaks"
```

Each soak has 100 components, 60 edit pairs, three restarts and 100 queued callers. A 240,000 ms update window allows a one-second timer tolerance; the hard 300,000 ms process timeout includes startup and shutdown. The nine workers run concurrently for correctness and memory observations, not comparative latency. Vite 6.0 uses the Environment Runner because of its historical legacy-loader restart limitation; Vite 6.4.3 and 8.2.2 also cover the legacy SSR loader. Resource SSR reads start at the watcher boundary without manual invalidation.

The new archive keeps raw comparison workers, short soaks, control diagnostics, setup failures, exact artifacts, source patches, manifests/locks and commands in separate directories. An early scratch lockfile-edit failure occurred before tarball verification; prematurely started style runs used missing/previous packages and are retained as unqualified setup evidence. Fresh correctness runs began only after the eight consumers were verified. No comparative worker ran during that setup failure. Gates use unrounded values.

Published logs replace absolute workspace, fixture and Node-installation roots with declared placeholders and remove ANSI presentation codes. Numeric observations are retained. Binary package artifacts and source patches are unchanged; per-file hashes describe the published bytes. The previous report/archive retain their own historical measurements and 15-minute soaks; this sprint's new soaks never exceed five minutes per process.

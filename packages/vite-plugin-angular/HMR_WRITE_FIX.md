# HMR write and pending-fetch repair

## Acceptance at the stopping point

Runtime revision `ca75a6d499a29fb765fe049db374f26319566585`, source tree `045f79d276f97738477f2112980d494d250dfddb`, fixes split-save source freshness, duplicate source-gate loss and invalidated pending SSR fetches. **Overall correctness remains open:** the final packed Angular 22/Vite 6.0/ngtsc run retained browser revision 3 after its second restart, which expected revision 4. All four preceding browser edits and SSR checks passed. The failed run is retained without replacement; its root cause is not established.

All current worktree lanes completed and their accepted fixes are integrated. No new comparative performance cohort was run. The [previous p95 report](HMR_P95_SPRINT.md) remains historical: 6/12 browser cells met all four 5% limits, and all first/warm build median gates passed. Those measurements do not qualify this newer source. The PR remains draft; [analogjs/analog#2519](https://github.com/analogjs/analog/issues/2519) retains the adoption decision.

## Repairs and proof boundaries

- **Split saves:** deterministic truncate/pause/write exposed empty component styles, which can change Angular encapsulation. Client paths use Vite's stable read. Server watchers publish compiler dirtiness and an abortable source-write gate synchronously before graph invalidation. The existing scheduler waits for stable source; duplicate invalidations retain an existing gate. Empty source is polled every 10 ms for at most 100 ms. Close aborts waiting gates and drains admitted native compilation.
- **Pending SSR fetches:** actual SSR captures and filesystem traces proved newer reads could receive older CSS before the new native compilation read the source. A plain-JavaScript Vite runner reproduction reproduced old/current/fresh generations 9/9/10 on Vite 6.0, 6.4, 7.3 and 8.2, including after clearing the runner cache. The final adapter wraps public environment graph invalidation and module fetching, records per-node sequences in a WeakMap, and retries a fetch only when its returned node was invalidated during that fetch. Retries bypass cached results and mark replacement results invalidated. Both methods are restored at close. No private runner mutation, second queue, emitted-code cache or wall-clock ordering is introduced. Native proofs return 10/10/10, including frozen-clock Vite 6.
- **Performance candidates, unmeasured:** narrow structural AST traversal around metadata replacement and suppress duplicate ngtsc client resource module re-evaluation after custom metadata dispatch. Existing behavior/reload fallbacks remain. These changes need the new fixed comparison.
- **Fixture repairs:** native CSS phases compare against their own pre-edit parent state and reject metadata/reload events during native updates. Runtime workers enforce consumer cwd and pinned Angular, capture the actual failing SSR page, and let Vite allocate its port. Failed observations predating these repairs remain separately attributed.

## Current qualification

| Check                                     | Result at runtime revision above                                                                                    |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Package tests                             | 995 passed, 6 skipped                                                                                               |
| Source and test typechecks, ESLint, build | Passed                                                                                                              |
| Frozen installed artifacts                | Four candidate consumers, 249 files each match the final tarball                                                    |
| Split-write SSR probes                    | 6/6 passed: Vite 6/8 × ngtsc/fast/API, 50 ms split writes                                                           |
| Final soaks                               | 9/9 passed: 60 edit pairs, 3 restarts and 100 queued/drained callers each; 240-second windows, 300-second total cap |
| Fresh packed Angular 22/Vite 8.2          | Passed: 23 runtime artifacts and native/style matrix                                                                |
| Fresh packed Angular 22/Vite 6.0          | **Failed after second ngtsc restart:** expected browser revision 4, captured revision 3; SSR checks passed          |
| New performance comparison                | **Not executed**; stopped at the user's requested handoff                                                           |

The final nine soaks total 540 edit pairs, 27 restarts and 900 queued/drained callers. They do not erase the separate packed restart failure or establish leak freedom. The earlier full packed matrix had 11/13 successful exits; two fixture assumptions were repaired and qualified with targeted rechecks, not rewritten as original passing exits. It is earlier-source evidence, not a fresh final-head Angular 17–22 matrix. The previous Windows API ShadowDom initial-render timeout remains unreproduced and its cause unproven; the PR records the dated live CI snapshot separately.

Failure lineage is preserved: invalid wrong-cwd cohorts are setup evidence; the valid write cohort had one unresolved failure; the barrier cohort and filesystem diagnostic each captured one actual stale SSR CSS failure. Those captures motivated the final fetch repair. The final packed Vite 6 restart failure is valid evidence, not classified as load noise or replaced by a rerun. Concurrent Vite 8 passed.

## Artifacts and reproduction

[Machine-readable disposition](hmr-write-fix-qualification.json), [raw archive](evidence/hmr-write-fix/qualification-results.tar.gz). Archive SHA-256 `59c01d1887e731f341f6211dc72d74e2d50319d6c127ce2502d38133cb7e98d6`, 13,818,727 bytes, 704 files. The embedded manifest hashes every payload. Paths are grouped by `write/`, `barrier/`, `final/` and supplemental evidence; rejected prototypes and failed runs retain their own source attribution.

| Artifact                 | Identity                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------- |
| Final candidate tar      | `final/candidate-final.tgz`; SHA-256 `2b4b09ddea722407d3a14330bfd0235e9266f0e6e4d7ddc248729d523913519f` |
| Correctness-only control | `01178bd6795454773e973d0b1e07100eb16b436e`; tree `cbdfe0fd92377c2daaf7e379b416e1045c74e12f`             |
| Control tar              | `final/control-final.tgz`; SHA-256 `c51ff1aabe4dbdea0fde16e0c30e8da40b34fae656e7ac87574d8eff57dddf65`   |
| Control source patch     | `final/control-final.patch`; SHA-256 `2291d9d6b07d93b436bd2effe99df842379c0398790d97778ae524d2fbd0a6de` |
| Final runtime worker     | SHA-256 `e4f0b6cd461172feec9ed5e06e40e0ad86b741af8e427764bb2693e098c69504`                              |

The control tar was built at `5c022ac37507e89bace0863c8c4d61fd0877ba3a`; the final control commit changes test typing only. Its 964 tests, build and test typecheck pass. It backports correctness repairs while retaining eager/barrel Effect loading and omitting warming/native-CSS/performance optimizations. Control manifests and locks are prepared but not installed or measured. Candidate consolidated changes from published `6df41ba6421c8cbebd2d9de4c7f809b35ceb510a` are in `final/candidate-from-6df41ba.patch`. Control metadata records its published patch base.

Use Node 24.15.0 and pnpm 10.33.0. Package validation:

```sh
NX_DAEMON=false NX_NO_CLOUD=true pnpm nx run-many -t test,typecheck,typecheck-tests,eslint:lint,build -p vite-plugin-angular --parallel=2
```

`final/package-gates-final.log` records the passing invocation. `final/packed-recheck/metadata.json` records commands and both final packed outcomes; its Vite 6 consumer `runtime-ngtsc.json` contains the stale browser capture. `final/final-soak-launch.json` records the nine final commands. The runner pending-fetch reproductions and all rejected timestamp variants remain under `barrier/`.

After resolving current correctness, prepare a fresh output directory and frozen consumers from the archived tarballs/locks, then run the archived `final/scripts/reproduce-fixed-cohort.py` and `summarize.py`. The protocol remains 90 fresh build processes, 120 browser workers (5 × 2 sides × 4 Vite versions × 3 modes, 25 pairs each), and 108 SSR-idle workers (0/250/1000 ms, both startup orders). Run comparative workers serially after owned correctness loads stop, preserve unrelated services, and record host load/CPU/memory. Include first edits and nearest-rank p95. Retain failures/incomplete samples without substitution; a code revision requires a new cohort. Require every browser template/CSS median/p95 and first/warm build median to regress by no more than 5%. No protocol execution is claimed here.

## Restart obligations

First reproduce and fix or decisively dispose of the Vite 6 browser restart failure. Requalify the live source across package, packed Angular 17–22/Vite 6–8, Windows, native SSR races, native CSS DOM/focus/selection/child-state and short-soak gates. Then complete the fixed performance cohort and address every miss without weakening thresholds. Retain Effect 4.0.0-rc.112, Schema, separate compiler ownership, scoped used-SSR warming, both escape hatches and qualified CSS fallbacks. Publish forward commits, updated PR progress and evidence, issue obligations and maintainer points. The PR comment supplies a copyable goal-mode restart prompt.

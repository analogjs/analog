---
name: handhold-pr
description: Watch a PR's CI, diagnose every failing check, fix what's actually broken, resolve CodeRabbit's major findings, and keep iterating until the PR is green. Use when the user says "handhold the PR", "check CI", "get CI green", "resolve any issues until green", or asks why a PR's checks are failing.
---

Take a pull request from "checks failing" to "all green". This skill owns **watching CI, diagnosing failures, deciding whether a failure is yours, and driving fixes** until every required check passes.

Target the PR the user names (number or URL). With no argument, use the PR for the current branch: `gh pr view --json number,url,headRefName`. If the branch has no PR, say so and stop — this skill doesn't open PRs (that's `open-pr`).

## 1. Get the current check state

- `gh pr checks <n>` — the whole picture in one call. Netlify `skipping` rows are noise; ignore them.
- If checks are still queued/running, don't guess at outcomes. Wait on them (see step 5) rather than reporting a partial state.
- Note which checks are **required** for merge vs. advisory (`gh pr view <n> --json statusCheckRollup`). A failing advisory check may not block, but still report it.

## 2. Get the real failure output

Don't diagnose from a check name. Read the log.

- `gh api repos/<owner>/<repo>/actions/runs/<runId>/jobs -q '.jobs[] | "\(.id) \(.name) \(.conclusion)"'` to find the failing job id.
- `gh run view --job <jobId> --log-failed` for the failing step.
- **`--log-failed` is often not enough on this repo.** Nx distributed execution prints a task summary table there; the actual test/build output is earlier in the full log. Pull it and search:
  `gh run view --job <jobId> --log | grep -n "FAIL\|Error:\|✖\|<task-name>"` then `sed -n '<start>,<end>p'` the surrounding block (pipe through `sed 's/\x1b\[[0-9;]*m//g'` to strip ANSI).
- Nx Cloud task-log URLs (`cloud.nx.app/logs/...`) are auth-gated — don't burn turns fetching them; the GitHub job log has the output.

## 3. Classify the failure before fixing anything

For each failure, answer: **is this caused by the diff on this branch?**

- Compare the failing area against `git diff <base>...HEAD --name-only`. A failure in a package the PR never touched is a strong signal it isn't yours.
- Check whether the base branch is green: `gh run list --branch beta --limit 5 --json conclusion,name`. A red base means pre-existing breakage.
- Known non-PR causes in this repo:
  - **Nx DTE ordering flakes** — a task fails to resolve a workspace package's subpath export (e.g. `@analogjs/vitest-angular/setup-testbed`) because `tsconfig.base.json` maps only the bare specifier, so `test → ^build` doesn't guarantee that dist is on the agent that picked up the task.
  - **Local-only reproductions** — if a task fails locally but passes in CI, check `node --version` against `.node-version`; a newer Node changes TS/ESM resolution in Vite config loading and produces failures CI never sees.
- Reproduce locally when the failure is plausibly yours: `nx test <project>`, `nx build <project>`, `nx format:check`, `nx lint <project>`. Say plainly when you could not reproduce.

## 4. Fix, or re-run, or escalate

- **Real failure from the diff** → fix it on the branch, verify locally, commit with a conventional message (same conventions as `open-pr`), push. Keep fixes scoped to the failure; don't fold in unrelated cleanups.
- **Flake** → re-run just the failed jobs: `gh run rerun <runId> --failed`. Re-run once. If the same task fails a second time, treat it as real and investigate — don't re-run a third time hoping.
- **Pre-existing breakage on the base** → don't fix it inside this PR. Report it to the user and suggest a separate issue/PR.
- Never edit workflow files, disable a test, or relax a check to make CI pass unless the user explicitly asks for that.

## 5. Wait for the next run, then loop

- Wait with a background command that exits on completion, not a bare sleep:
  `until [ "$(gh run view <runId> --json status -q .status)" = "completed" ]; do sleep 30; done`
  (run it with `run_in_background`, then read the output file when notified).
- After each run completes, go back to step 1. Keep looping until every non-skipping check passes or you hit something the user has to decide.

## 6. Resolve CodeRabbit's major findings

Green CI isn't done. CodeRabbit reports as a **passing check even when it has posted actionable inline comments**, so its review has to be read separately.

- `gh pr view <n> --json reviews` for the summary (it states how many actionable comments it posted), and `gh api repos/<owner>/<repo>/pulls/<n>/comments` for the inline findings. Each is tagged with a severity — `🟠 Major`, `🟡 Minor`, and so on.
- **Verify every finding against the current code before acting** — CodeRabbit is wrong often enough that you should reproduce the claim first. Where the finding is a real code path, add a test and confirm it fails without the fix.
- Fix the still-valid **major** findings on the branch, with their own commit. Lesser findings are a judgment call — apply the cheap correct ones, and say which you skipped and why rather than silently dropping them.
- Note when a finding is pre-existing (the same defect exists on the base branch) — it's still worth fixing if it sits in code the PR touches, but say so.
- Pushing the fix restarts CI, so go back to step 1 and wait for the new run.

## 7. Report

- State the final status plainly: green, or still red with what's left and why.
- For each failure you handled, give one line: what failed, root cause, what you did (fixed / re-ran as flake / left alone as pre-existing). Do the same for each CodeRabbit finding (fixed / skipped with reason).
- Don't claim green without having seen the checks pass — quote the actual `gh pr checks` result.
- Flag latent problems you noticed but didn't fix (e.g. a flake worth its own issue) instead of silently absorbing them.

## Notes

- Re-running CI and pushing commits are outward-facing. They're implied by "get this PR green", but confirm before anything broader (force-pushing, rewriting history, closing/reopening the PR).
- Don't post comments on the PR unless asked.
- If CI stays red after two focused attempts at the same failure, stop and hand the user the evidence rather than continuing to churn.

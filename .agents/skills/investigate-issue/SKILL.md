---
name: investigate-issue
description: Investigate a GitHub issue end to end — reproduce the reporter's repo or code snippet in an isolated sandbox outside the monorepo, trace the root cause in the source, and draft a reply back to the reporter for the maintainer to confirm before posting. Use when the user says "investigate issue <n>", "look into issue <n>", "can you reproduce this", or wants a triage answer rather than a fix.
---

Turn a reported issue into a verified verdict: **does it reproduce, why, and what should we tell the reporter?** This skill owns **reproduction, root-cause analysis, and drafting the response**. It does not fix the bug (`fix-issue`) and it does not post anything to GitHub without explicit approval.

Take the issue number/URL from the user. If none is given, ask for it.

## 1. Read the issue

- `gh issue view <n> --json title,body,state,labels,comments,author,createdAt`. Plain `gh issue view <n>` may fail on this repo with a Projects-classic GraphQL error — use the `--json` form. `gh api repos/analogjs/analog/issues/<n>` also works.
- Pull out the facts that decide the investigation:
  - **Versions** — Analog, Angular, Vite, Nx, Node, and the package manager. The bug report template asks for an environment; if it's vague, note the gap now rather than guessing later.
  - **Affected package** — the reporter's dropdown answer is a hint, not a verdict. Confirm it from the stack trace and the code you end up reading.
  - **The reproduction** — a git repo, a StackBlitz link, a code snippet, or nothing.
- Search for prior art before spending time: `gh issue list --search "<keywords>" --state all` and `git log --oneline --grep "<keywords>"`. An issue that a recent commit already fixed on `beta` is the single most common outcome — check that early.

## 2. Get the reproduction into an isolated sandbox

**Never install or run a reporter's project inside this monorepo.** `pnpm-workspace.yaml` will absorb it, its dependencies will resolve to workspace packages, and whatever you observe will be an artifact of your setup rather than their bug. Work in a scratch directory outside the repo (the session scratchpad, or `mktemp -d`).

By what the reporter gave you:

- **Git repo** → `git clone --depth 1 <url> <sandbox>/repro`, then install with the lockfile they committed (`pnpm i --frozen-lockfile`, `npm ci`, …). Their lockfile is evidence; replacing it changes the experiment.
- **StackBlitz / CodeSandbox link** → these can't be driven from here. If the project is backed by a git repo, clone that. Otherwise scaffold the equivalent locally: `npm create analog@latest` in the sandbox (`template-minimal` for a bare case, `template-latest` for a full app), then transplant the reporter's files.
- **Code snippet only** → build the smallest project that exercises it, same scaffold route. If the snippet is really about compiler or plugin behavior, a focused spec in the affected package (`packages/<pkg>/src/**/*.spec.ts`) is a faster and more durable reproduction than an app — prefer it when it can express the bug.
- **Nothing** → don't invent one. Try a good-faith minimal reproduction from the description; if it doesn't reproduce, that's a legitimate finding and the draft reply should ask for a repro rather than assert the bug isn't real.

Pin the reported versions first. Reproducing against the versions they named is the experiment; anything else is a different one.

## 3. Reproduce, and record what you actually ran

- Run the command from the issue — `dev`, `build`, `test`, `storybook`, whatever they reported — and capture the real output, not a paraphrase.
- Record the verdict plainly: **reproduced**, **not reproduced**, or **partially reproduced** (e.g. the error appears but only on build, not dev). "Partially" is a real answer and usually the most informative one.
- If it doesn't reproduce, vary one thing at a time — package manager, Node version against `.node-version`, Vite major, `jit` vs AOT, dev vs build vs SSR — and say which variable flipped it. A bug that only appears under one of these is a scoping fact the reporter needs.

## 4. Trace the root cause in this repo

- Once you can see the failure, find the code that causes it. Read the source — don't infer from the stack trace alone. Delegate broad searches to the Explore agent when the cause could live in several places.
- Cite evidence as `file:line`. A verdict without a line number is a hypothesis.
- Decide where the bug actually lives, and be willing to conclude it isn't ours:
  - **Analog bug** — our code does the wrong thing. Note every call path that hits it; a util with two callers usually needs both fixed.
  - **Upstream** (Angular, Vite/Rolldown, Nx, Nitro, Storybook) — say which project, and whether we can still be resilient to it on our side. Both can be true, and "we should tolerate this even though it's their bug" is a fine recommendation.
  - **Usage / configuration** — then the reply is documentation, not a patch. Check whether `apps/docs-analog` actually covers it; if it doesn't, that gap is the real finding.
- Check the current `beta` too, not just the reported version. If it's already fixed, identify the commit that fixed it — that's the whole answer.

## 5. Validate the diagnosis against local changes when it matters

When the diagnosis implies a specific fix and you want confidence before recommending it:

- Build the package into the workspace `node_modules` (that's its `outputPath`): `nx build <package>`.
- Pack it and install the tarball into the sandbox so the repro runs against your build:
  `npm pack node_modules/@analogjs/<package>` → install the resulting `.tgz` in the sandbox project.
- Re-run the failing command. A diagnosis that survives this is worth reporting as confirmed; one that doesn't is a hypothesis you should label as such.

This step is optional — skip it when the root cause is unambiguous from reading the source, and say you skipped it.

## 6. Draft the response — don't post it

Write the reply as a draft for the maintainer to review. **Do not run `gh issue comment`, add labels, close, or reopen anything until the user explicitly approves.**

Keep it short and concrete, in the maintainer's voice — direct, no filler thanks-for-the-report padding:

- Whether it reproduced, and under exactly what versions/commands.
- The root cause in one or two sentences, with the `file:line` evidence.
- Where it lives: our bug, upstream, or usage — and for upstream, whether we plan to be resilient anyway.
- What happens next: a fix is coming, a repro is needed, a doc will be updated, or it's already fixed on `beta` (name the commit).
- Any question the reporter has to answer for this to move.

Present the draft inline for approval. On approval, post with `gh issue comment <n> --body-file <path>`. If the reporter needs to supply something, say so once and clearly rather than hedging.

## 7. Report to the user, then hand off

- Summarize: reproduced or not, root cause with evidence, where it belongs, and your recommendation.
- If it's a real Analog bug and the user wants it fixed, hand off to **`fix-issue`** — it owns branching and implementation. Don't start editing `packages/` from this skill.
- If the investigation turns up something adjacent (a second bug, a missing doc, a flaky path), flag it as its own issue instead of folding it in.

## Notes

- Clean up sandboxes when you're done, and never point a sandbox's dependencies at the working monorepo except via a packed tarball.
- Report reproduction attempts faithfully. "I couldn't get their repo to install" is useful; a confident verdict built on a broken sandbox is not.
- Timebox variable-hunting. After a few honest attempts at reproducing, the better answer is a draft asking the reporter for the missing piece.

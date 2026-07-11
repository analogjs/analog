<!--
SUMMARY: Audit of analogjs/analog's agentic-workflow tooling against a 19-point rubric.
SCOPE: Reporting only — scores what exists today with file evidence; recommends a roadmap.
TALLY: 0 fully present, 7 partial, 12 missing (as of 2026-07-11).
STRONGEST: AGENTS.md (now a router), .agents/skills/, CodeRabbit + Nx MCP, generated llms.txt.
WEAKEST: session memory (worksheets/feedback/task-queue), self-healing docs, all quality gates.
NEXT: Foundation docs layer first (items 0,1,2,7,8,11,13); then scripts/skills; then CI gates.
GREP: search "## Item" for per-item detail, "## Roadmap" for build order, "## Drift" for fixups.
-->

# Agentic Workflow Tooling Audit

This document audits the repo's tooling for **agentic (AI-agent) workflows** against a
19-point rubric. It is a reporting artifact: it scores the current state with file
evidence and lays out a prioritized roadmap. Nothing except this file and a router update
to `AGENTS.md` was changed in the pass that created it.

Legend: ✅ Present · 🟡 Partial · ❌ Missing

## Baseline: what already exists

- `AGENTS.md` — agent onboarding + contributor guide (now also a **router**; see item 0).
- `.agents/skills/pr-description.md`, `.agents/skills/review-pr.md` — two markdown skills.
- `.githooks/pre-commit` (→ `lint-staged` → `prettier --write`), `.githooks/commit-msg`
  (→ `commitlint`); `.lintstagedrc`, `commitlint.config.cjs`.
- `eslint.config.mjs` — flat config (Nx + angular-eslint). No custom in-repo rules.
- Vitest units (`*.spec.ts`), Playwright e2e (`apps/*-e2e*`), compiler conformance suite
  (`packages/vite-plugin-angular/src/lib/compiler/*.spec.ts`).
- `.coderabbit.yaml` — per-scope AI review config.
- `.github/instructions/nx.instructions.md` — Nx MCP usage guide.
- `tools/publish.sh`, `tools/scripts/publish.mjs` — release scripts only.
- `apps/docs-app/` — Docusaurus docs + generated `llms.txt` / `llms-full.txt`.
- CI: `ci.yml`, `conformance.yml`, `compiler-compat.yml` (auto-files issues on regression),
  `pr-scope-governance.yml`, `test-release.yml`, `ci-windows-full.yml`.

## Scorecard

| #   | Item                                                     | Status | One-line gap                                                              |
| --- | -------------------------------------------------------- | ------ | ------------------------------------------------------------------------- |
| 0   | AGENTS.md as a **router**                                | ✅\*   | Fixed in this pass — see "Item 0" and the new Navigation section.         |
| 1   | Standard **workflow doc/skill** (`AGENT_WORKFLOW.md`)    | ❌     | No workflow doc; no Matt-Pocock-style skills.                             |
| 2   | **Self-healing docs** + 7-line greppable summary headers | ❌     | READMEs exist but no convention, no summary-header standard, not indexed. |
| 3   | Agents **always run the app** & self-test                | 🟡     | `verify`/`run` skills in harness; not a repo rule for agents.             |
| 4   | **E2E** + write/maintain guide + **test index**          | 🟡     | Tests exist; no test inventory doc, no agent-facing testing guide.        |
| 5   | **Custom linters at precommit** w/ `--fix` / LLM-fix     | 🟡     | Only `prettier --write`; no custom rules, no ESLint on commit, no LLM.    |
| 6   | **Cross-agent review** + personas + persona-owned docs   | 🟡     | CodeRabbit + `review-pr` only; no multi-model orchestration, no personas. |
| 7   | **Agent traces/worksheets** committed + git tags         | ❌     | None.                                                                     |
| 8   | **Automatic feedback doc** committed + ingested          | ❌     | None.                                                                     |
| 9   | **tools/bin** agent scripts + `agent_review` + guide     | 🟡     | `tools/` holds only publish scripts; no agent helpers, no authoring doc.  |
| 10  | Periodic **commit sweeps**                               | ❌     | Regression auto-issues exist; no cross-commit gotcha sweep.               |
| 11  | **Coding conventions** doc for review agents             | 🟡     | Conventions live inline in `AGENTS.md`; no standalone `CONVENTIONS.md`.   |
| 12  | **Agent loop / night-shift** skill                       | ❌     | Harness `/loop` exists; no repo night-shift orchestration skill.          |
| 13  | **Task queue** (`TODOS.md` / Linear+CLI)                 | ❌     | None.                                                                     |
| 14  | **False-confidence test audit** skill                    | ❌     | None.                                                                     |
| 15  | **Visual regression** tests (screenshots + LFS)          | ❌     | Playwright is functional-only; no `toHaveScreenshot`, no LFS.             |
| 16  | **Perf benchmark** tests + regression detection          | ❌     | No bench suite, no perf CI gate.                                          |
| 17  | **Perf profiling** tools for agents                      | ❌     | Only unused bundle-visualizer devDeps.                                    |
| 18  | **End-of-shift full validation** skill/script            | ❌     | CI exists; no agent-facing "run everything" validation.                   |

Tally: **0 fully present, 7 partial, 12 missing** (item 0 now resolved by this pass).

## Per-item detail

### Item 0 — AGENTS.md as a router — ✅ (fixed this pass)

`AGENTS.md` was rich but functioned as a contributor guide, not a router: it never pointed
agents at `.agents/skills/`, the docs tree, the tools, or the governance config. This pass
added a **"Navigation (Router)"** section near the top of `AGENTS.md` that indexes skills,
docs, tools, governance, and this audit, and fixed the factual drift noted under "Drift"
below. Remaining follow-up: once item 2's summary-header convention lands, add the
"grep the first 7 lines of any doc" instruction to the router.

### Item 1 — Standard workflow doc — ❌

No `AGENT_WORKFLOW.md`. Recommendation: add a root `AGENT_WORKFLOW.md` describing the
research → plan → implement → verify → review → wrap-up loop, tuned to this repo (`beta`
base branch, Nx targets, `pnpm dev`/`serve-nitro`, package→scope map). Link it from the
`AGENTS.md` router so a session can pull it in by tag.

### Item 2 — Self-healing docs with greppable summaries — ❌

Per-package `README.md` files exist under `packages/*` and `libs/*`, but there is no
convention. Recommendation: adopt a 7-line summary header (like the one atop this file),
a `docs/INDEX.md` (or `.agents/docs-index.md`) listing every system doc + its summary line,
and an `AGENTS.md` rule that agents update the relevant doc whenever they change a system.

### Item 3 — Agents always run the app — 🟡

The harness ships `run`/`verify` skills, and `CONTRIBUTING.md` documents `pnpm dev` and the
`serve-nitro` e2e path. Gap: no repo-level instruction that an agent must actually run the
affected app and self-test before finishing. Recommendation: encode "run the app + drive the
changed flow" into `AGENT_WORKFLOW.md` and the wrap-up validation (item 18).

### Item 4 — E2E + testing guide + test index — 🟡

Present: Playwright e2e for `analog-app`, `blog-app`, `astro-app`, `trpc-app`; Vitest units
repo-wide; `apps/docs-app/docs/features/testing/`. Missing: a test-inventory doc ("every
test and what it covers"), and an agent-facing "how to write tests / what to avoid" guide.
Recommendation: generate a `TESTS.md` inventory and a testing-conventions doc; wire
"write and run targeted tests during implementation" into the workflow.

### Item 5 — Custom precommit linters with --fix / LLM-fix — 🟡

`.githooks/pre-commit` runs only `lint-staged` → `prettier --write` (formatting auto-fix).
ESLint is not run on commit; there are no custom in-repo rules (and `nx.json` references a
nonexistent `tools/eslint-rules/`). Recommendation: add `eslint --fix` to lint-staged for
changed files; author project-specific rules under `tools/eslint-rules/`; optionally add an
LLM-fix fallback that rewrites (not just flags) what `--fix` can't resolve — gated behind an
available agent CLI so it degrades gracefully.

### Item 6 — Cross-agent review + personas — 🟡

Present: `.coderabbit.yaml` (external AI review, per-scope) and `.agents/skills/review-pr.md`.
Missing: orchestrated review by a _different_ model than the author, persona lenses
(maintainability, security, performance, AI-smells, domain expert), and persona-owned system
docs. Recommendation: an `agent_review` script (item 9) that dispatches to whichever external
CLI is present, plus per-persona review docs each owning a set of system docs.

### Item 7 — Agent traces / worksheets + git tags — ❌

No worksheet or trace convention. Recommendation: a `.agents/worksheets/` template + skill;
each session writes a worksheet (goal, plan, steps, state) committed with the work, and the
agent applies a matching git tag so worksheets are findable later.

### Item 8 — Automatic feedback doc — ❌

None. Recommendation: an end-of-session step that appends agent feedback to a committed
`.agents/FEEDBACK.md`, plus a skill to periodically ingest it and improve the workflows.

### Item 9 — tools/bin agent scripts + authoring guide — 🟡

`tools/` holds only release scripts (`publish.sh`, `scripts/publish.mjs`). Missing: an agent
`bin/` (e.g. `agent_review`, validation runner) and a "how to write effective scripts" doc
with an instruction to keep building them out. Recommendation: create `bin/` + a
`tools/README.md` authoring guide.

### Item 10 — Periodic commit sweeps — ❌

`compiler-compat.yml` auto-files issues on compiler regressions, but there is no higher-level
sweep across recent commits for gotchas. Recommendation: a `commit-sweep` skill/script run on
a schedule (or via `/loop`) that reviews the last N commits for cross-cutting problems.

### Item 11 — Coding conventions doc — 🟡

Conventions are embedded in `AGENTS.md` ("Contribution Patterns & Best Practices" + "Do NOT").
Recommendation: extract a standalone `CONVENTIONS.md` that review agents (item 6) consume, and
keep linter-enforceable rules in ESLint rather than prose.

### Item 12 — Agent loop / night-shift skill — ❌

The harness has `/loop`, but no repo night-shift orchestration skill. Recommendation: a
`.agents/skills/night-shift.md` laying out how to pull from the task queue (item 13), run the
full loop autonomously, and validate at end-of-shift (item 18).

### Item 13 — Task queue — ❌

No `TODOS.md` or queue integration. Recommendation: start with a root `TODOS.md` the agent
reads/writes; graduate to a Linear/API CLI later if desired.

### Item 14 — False-confidence test audit skill — ❌

None. Recommendation: a skill that finds tests asserting the wrong thing (tautologies, mocked
subject-under-test, assertions on adjacent code) and fixes them.

### Item 15 — Visual regression tests — ❌

Playwright is configured functional-only (`trace: on-first-retry`); no screenshot baselines.
Recommendation: add `toHaveScreenshot`-based specs for key routes, store baselines via git LFS
(or push into the PR), and add an agent visual-review step.

### Item 16 — Perf benchmark tests — ❌

No benchmark suite or perf CI gate. Recommendation: add `*.bench.ts` (Vitest bench / tinybench)
for hot paths (e.g. the Angular compile transform) and a CI check that flags regressions.

### Item 17 — Perf profiling tools — ❌

Only `rollup-plugin-visualizer` / `webpack-bundle-analyzer` / `vite-plugin-inspect` exist as
unused devDeps. Recommendation: wire a profiling script agents can run for targeted
benchmarking and profile comparison.

### Item 18 — End-of-shift full validation — ❌

CI runs the full matrix, but there is no agent-facing "run everything locally before I finish"
command. Recommendation: a `validate-all` script/skill that runs prettier, lint, build, unit,
e2e, and (once they exist) benchmarks + agent reviews + sweeps, so the tree is pristine on
return.

## Roadmap

Build order, grouped by dependency and cost:

- **A. Foundation / docs layer** (cheap, high-leverage, no external deps):
  items **0** (done), **1**, **2**, **11**, **13**, **7**, **8**.
- **B. Scripts & skills** (build on A): items **9** (`bin/` + `agent_review`), **12**
  (night-shift), **18** (validate-all), **14** (false-confidence audit), **10** (commit sweep),
  **3** (run-the-app rule).
- **C. CI-integrated quality gates** (heavier, some external deps): items **4** (test index +
  guide), **5** (precommit ESLint `--fix` + optional LLM fallback), **6** (cross-agent review +
  personas), **15** (visual regression + LFS), **16** (perf benchmarks), **17** (profiling).

External-CLI-dependent items (**5**, **6**, **9**) should detect available agent CLIs at
runtime and degrade gracefully when none is present.

## Drift (fix opportunistically)

- `AGENTS.md` stated Node `^22.0.0 || ^24.0.0` and pnpm `^10.0.0`; `package.json` pins Node
  `^22.22.3 || ^24.15.0 || ^26.0.0` and pnpm `^11.0.0`. (Corrected in this pass.)
- `.node-version` is `24.11.0`, below the engines `^24.15.0` floor — bump to a `24.15+` patch.
- `nx.json` references `{workspaceRoot}/tools/eslint-rules/**/*`, which does not exist — either
  create the directory (item 5) or drop the stale input glob.

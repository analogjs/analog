---
name: graft-sync
description: Keep local modifications ("grafts") to upstream packages (npm, Cargo crates, Go modules, PyPI) working when upstream releases a new version. Use when a repo has a `.grafts/` directory and an upstream dependency was bumped, `graft sync` reported `needs-agent`, a graft's anchors miss or its tests fail after an upgrade, or you are asked to sync, repair, add, or retire a graft.
---

# Graft sync

A **graft** is one local modification to an upstream package, described by
`.grafts/<id>/graft.md`. The repo's grafts are the contract between the people who wrote
them and you. Your job when upstream moves is to make each graft hold again — or to say
clearly that it can't.

Full format and tooling contract: the Graft spec in the Graft repository,
https://github.com/brandonroberts/graft/blob/main/docs/spec.md

## What a graft is made of

`graft.md` frontmatter:

- `rootstock.package` / `rootstock.verified` — upstream package and the last version the graft
  was verified against.
- `rootstock.ecosystem` — `npm` (the default), `cargo`, `go` or `pypi`. It decides the version
  syntax: semver for npm and cargo (`>=1.0.0 <2.0.0`, `-0` for prereleases), semver with the
  `v` for go (`v0.11.0`), PEP 440 for pypi (`"24.0"` quoted in YAML, `>=24.dev0`,
  `>=2.0,<3`).
- `mechanism` — how it is applied (e.g. `patch`: a pnpm `patchedDependencies` patch file).
- `variants` — one implementation per upstream version range (`range` + `module` path).
  Ranges are disjoint; exactly one variant applies to any version.
- `status` — `applied` | `conflicted` | `upstreamed` | `obsolete`.

Body sections, all required — read them before touching anything:

- **Why** — what the modification enables and why upstream doesn't do it.
- **Invariants** — observable behaviors that must hold, and which of the project's tests cover
  them. **This is the contract, and verifying it is your job:** Graft only checks that a graft
  still _fits_ (anchors, apply, install). It runs no tests.
- **Where to look** — the upstream area, described by behavior so you can re-find it after
  a refactor. Trust this over file paths.
- **Anchors** — what each variant matches on and why it was chosen.
- **History** — what changed upstream each time and how the graft adapted.

## Tools

Everything goes through the `graft` CLI (`npx graft …`, `pnpm exec graft …`, or however the
project runs it). Every command takes `--json` for machine-readable output and `--root` for
the project root. Exit codes: `0` ok, `1` something needs attention, `2` tooling error.

| Step                                                                     | Command                                                                                |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Overview                                                                 | `graft status`                                                                         |
| Deterministic first pass                                                 | `graft sync [--version X] [--install]`                                                 |
| Read intent + variants (and which variant the installed version selects) | `graft show <id>`                                                                      |
| Anchor report                                                            | `graft check <id> [--version X]`                                                       |
| What moved upstream                                                      | `graft diff <id> [from] [to]`                                                          |
| Apply a variant to pristine upstream, for inspection                     | `graft preview <id> [--version X] [--out dir]`                                         |
| Register a new variant                                                   | `graft variant add <id> --range R --module ./variants/… --verify-version X --note "…"` |
| Wire the package manager to the selected variants + reinstall            | `graft apply`                                                                          |
| Prove the Invariants                                                     | the project's own tests (see _Invariants_)                                             |
| Status, verified version, History                                        | `graft mark <id> [--status S] [--verified X] [--history "…"]`                          |
| Where a variant fits across published versions                           | `graft replay <id> [--range R]`                                                        |

Reports from `sync` land in `.grafts/.report/` (`sync.md`, `sync.json`, and per graft
`diff.patch` and `applied/`).

## The loop

1. **Run the deterministic first pass first.** `graft sync --version X --install`.
   Never re-derive what already passes. Green grafts are done — `sync` already bumped
   `verified` and wrote History. Only grafts marked `needs-agent` are yours.
   If the project has an `upgrade` command, read its output in the report ("Output of …" in
   `sync.md`, `installOutput` in `sync.json`) even when sync is green. A tool may have left
   work for you there: e.g. `nx migrate --agentic` run from inside an agent prints steps for the
   calling agent and leaves the migrations unapplied. If the upgrade entry configures `needsAgentIf`,
   `sync` marks the graft `needs-agent` (exit 1) without bumping `verified` until you finish those
   steps and re-run `graft sync`. Either way, finish that work and prove it with the project's
   tests before you call the upgrade done.
2. **Gather context for each `needs-agent` graft**, in this order:
   `graft show <id>` → the reasons in the sync report → `graft check <id> --version <target>` →
   `graft diff <id>` (from `verified` to the target).
3. **Locate the new equivalent code by behavior.** Use _Where to look_ and _Anchors_, then
   the scoped diff. If a target file was removed or renamed, search the new version's
   published files for the behavior (the pristine copy is under `.grafts/.cache/upstream/`). Upstream
   renames and moves are normal; the behavior is what you are re-finding.
4. **Write a new variant for the new range** with your own editing tools, inside the graft's
   directory (e.g. `variants/v5.patch`). See _Mechanisms_ below.
5. **Iterate until the patch applies cleanly** to the pristine target, which `sync`/`check`
   cached under `.grafts/.cache/upstream/<pkg>@<target>/`. For example, run
   `git apply --check <variant>` inside that directory. Registration (next step) is the final
   anchor check.
6. **Register it:** `graft variant add <id> --range '>=<target>' --module ./variants/<file>
--verify-version <target> --note "<what moved upstream and how the variant differs>"`. It
   refuses (and rolls back) if the anchors don't match at the target. Older open-ended ranges
   are narrowed automatically; existing variant files are never touched. Then
   `graft check <id> --version <target>` should be clean.
7. **Check it fits:** re-run `graft sync --version <target> --install`. With anchors now
   matching, it wires the package manager to the new variant, installs the target, and on green
   sets `verified` and status `applied`.
8. **Prove the Invariants** at the target with the project's tests: run the ones _Invariants_
   names (and the suite), and add a test for any Invariant nothing covers. Show it fails
   without the graft. If a test fails, the graft isn't done, whatever sync said: fix the
   variant, or stop (see _When to stop_).
9. **Finish:** open a PR (see below), saying how you verified each Invariant.

## Adding a new graft

When asked to capture a modification as a graft (new, or migrating an existing patch):

1. **Scaffold:** `graft init --agent` (once; it also installs this skill), then `graft add <id> --package <pkg> --target <file>`.
   This creates `graft.md` and an empty variant stub (which fails loudly until written).
2. **Write the intent first,** with the person who owns the modification if you can: _Why_,
   the _Invariants_ (observable behaviors, one per bullet), _Where to look_ (by behavior), and
   _Anchors_ (what the variant matches on and why).
   Ask too **how they upgrade the package by hand.** If it's more than bumping its version
   (companion packages that move with it, a migration tool such as `nx migrate` or `ng update`),
   record that command as `upgrade` in `.grafts/config.json`, with `{version}` where the new
   version goes, so `graft sync --install` (and the GitHub Action) upgrade the same way.
3. **Write the variant.** For `patch`, make the change in the installed package
   (`node_modules/<pkg>`), then run `graft capture <id>`: it writes the difference from the
   published package as the variant (replacing the scaffold stub), and refuses binary changes.
   **With pnpm**, don't edit `node_modules` in place (its files are hard links into the shared
   store): run `pnpm patch <pkg>@<installed>`, edit the printed directory, `pnpm patch-commit
   <dir> --patches-dir <tmp>`, and move the generated file onto `variants/v<major>.patch`
   (`pnpm patch-commit` may also write a `package.json` entry; the next step replaces it).
4. **Apply it:** `graft apply`. This points the package manager at the
   variant, reinstalls, and re-checks anchors.
5. **Cover the Invariants with the project's tests.** Find the tests that exercise each
   Invariant, or add them to the project's suite, and name them under _Invariants_. Show each
   fails without the modification and passes with it: a test that can't fail proves nothing.
   Also keep one pre-existing behavior the graft must not break covered.
   - **Test what the graft changes, not the whole stack.** For a patch that stops a dependency
     loading Node polyfills, assert it doesn't load them (e.g. via `require.cache`); you don't
     need a browser or a build.
   - **Browser tests** (Playwright etc.), when you need one, fail on uncaught page errors,
     **`console.error`** messages and failed (5xx) requests: Angular's `ErrorHandler`, React
     error boundaries and Vue's `errorHandler` catch errors and only log them. Assert something
     visible that depends on the graft, and stop any server you start on every exit.
6. **Check it:** `graft sync` (green), and the project's tests pass.
7. **Find the variant's real range:** `graft replay <id>` checks every published version.
   Record what you learn in _History_.
8. **Check it in CI:** add a `graft check` step to the project's CI right after dependencies
   are installed (`npx graft check`, or `npx -y @graftsync/cli@<version> check` without the
   dependency). It fails the build when a graft isn't applied. It's a plain `run` step, so no
   third-party action needs approving.
9. **Offer automation.** Without it, nothing re-verifies the graft when upstream releases. Ask
   the person whether to set up the Graft GitHub Action, how often it should run (a `schedule`,
   `workflow_dispatch`, or both), whether it should propose prereleases or only stable releases
   (`tags: latest`), and whether grafts that need an agent should run one (`agent-command`) or
   open an issue. If they agree, write `.github/workflows/graft-sync.yml` following the
   action's README: `contents`, `pull-requests` and `issues: write`, the project's install step
   first, and the action pinned to the release tag of the CLI version in use
   (`brandonroberts/graft/packages/action@v<version>`) with `graft-command` at that same
   version when the project doesn't depend on `@graftsync/cli`. You can't do the GitHub side:
   tell them to allow Actions to create pull requests (or use a GitHub App token as
   `github-token`) and to add the agent's API key as a repository secret.

## Rules

- **Never edit an existing variant.** Older version ranges keep their variants and tests.
  Write a new file for the new range. `graft variant add` refuses to re-register a file.
- **The Invariants are the contract, and you verify them.** A green sync means the change still
  fits and installs, not that it still works. Prove the Invariants with the project's tests.
- **Never weaken a test** to get green: don't skip, loosen, or delete checks, and don't change
  Invariants to match what you built. If an invariant is genuinely obsolete, say so and ask a
  human.
- **Never set `verified`** (or register a variant) for a version you haven't verified the
  Invariants at.
- **Fail loudly.** A graft that silently applies nothing is the worst outcome. Anchors must
  match exactly once; don't add fuzz, catch-alls, or "skip if not found" logic.
- **Anchor by behavior.** Prefer stable exported names, public API lists, and user-facing
  strings over incidental code shape. Never anchor on formatting.
- Keep each change to what the failure needs. Don't refactor other grafts or upstream code.

## Version ranges

- Start the new variant at the target version. For a prerelease target, use the `-0` floor so
  prereleases select it: `>=5.0.0-0`.
- Leave it open-ended (`>=5.0.0-0`) unless you know where it stops applying.
- Older open-ended ranges get capped below the new floor by `graft variant add`
  (`>=4.0.0` → `>=4.0.0 <5.0.0-0`).

## Mechanisms

### `patch` (any package manager)

- A variant is a git-style patch (`diff --git a/<file> b/<file>`, paths relative to the
  package root). Every hunk is an anchor: its context and removed lines must appear exactly
  in the target version (position may shift; no fuzz). Files the patch creates must not
  already exist upstream. The same variant works with every package manager.
- Make one with the project's package manager: `pnpm patch <pkg>@<version>` then
  `pnpm patch-commit <dir> --patches-dir <tmp>`, `npm patch <pkg>` then `npm patch commit <dir>`
  (npm 12+), or `bun patch <pkg>` then `bun patch --commit node_modules/<pkg>`. Move the generated file into the graft's
  `variants/`. For npm, diff a pristine copy (under `.grafts/.cache/upstream/`) against your
  modified copy, using package-relative paths.
- Don't hand-edit the package manager's patch configuration. `graft apply`
  wires the selected variant: pnpm `patchedDependencies`, npm 12+ `patchedDependencies` (name-only
  key), bun's version-pinned key, or (npm < 12, yarn and others) Graft's built-in applier,
  `graft apply --installed` in `postinstall`. The
  built-in applier is offline, idempotent, and never edits store-shared files in place.
  With upm (or the `vendor` applier forced in `.grafts/config.json`), Graft builds a patched
  tarball under `.grafts/.vendor/` and points overrides and the root dependency at it. Commit
  that tarball; never edit it by hand. `graft check` rebuilds it and reports a stale one.
  `graft sync --install` rewires it for the new version before installing. At the installed
  version, `graft check` reports any configuration that would apply something else or fail
  silently, and any patched file in `node_modules` that doesn't match pristine upstream + the
  variant.
- **Cargo, Go and PyPI** (`rootstock.ecosystem`): the variant is the same kind of patch, with
  paths relative to the _published_ artifact:
  - cargo: the `.crate` (pristine copy in `.grafts/.cache/upstream/cargo/<crate>@<version>/`
    after `graft check`). Its `Cargo.toml` is the normalized one `cargo publish` wrote; patch
    that, not `Cargo.toml.orig`.
  - go: the module (pristine copy: `go mod download -json <module>@<version>`, field `Dir`,
    read-only).
  - pypi: the wheel, paths relative to site-packages (`requests/api.py`); pristine copy in
    `.grafts/.cache/upstream/pypi/<name>@<version>/`.
    The easy way to write one is `graft capture <id>` after editing what the tool uses: for cargo
    and go, the vendored copy `graft apply` wrote under `.grafts/.vendor/` (go's module cache is
    read-only; cargo's registry source is shared by every project, so prefer the vendored copy);
    for pypi, the package in site-packages. Capture writes the whole change against pristine as
    the variant; then `graft apply` rebuilds the vendored copy from it. Never commit a hand-edited
    vendored copy: `graft check` reports it as stale.
    `graft apply` writes `.grafts/.vendor/` (a patched crate directory, module directory or wheel:
    commit it as `graft apply` wrote it) and the tool's override: `[patch.crates-io]` in Cargo.toml, a
    version-qualified `replace` in go.mod/go.work, `[tool.uv.sources]` or the requirements line.
    Don't edit those by hand either. If `graft check` reports `[[patch.unused]]`, a replace the
    go command ignores, or a stale `uv.lock` hash, the patched package is NOT in use even though
    the build passes; `graft apply` (or `sync --install`) fixes the wiring.
- Keep hunk context away from lines that change every release (`"version"` in package.json,
  `version` in Cargo.toml).
- If the graft's variants are generated, give it a `generator: { command }` in its
  frontmatter (`{version}` and `{out}` are substituted; e.g.
  `node tools/cjs-to-esm/make-variant.mjs semver {version} {out}`). `graft sync` then
  regenerates and registers a variant itself when the old one misses, and keeps it only if it
  fits and installs. If sync still hands the graft to you, its reasons say what the generator
  did; the rejected output is under `.grafts/.report/<id>/regenerated/`. Fix the generator
  or review that output rather than hand-patching the old variant.

### `fork` (commits on a fork of the upstream repo)

- The graft's `fork:` block names the fork (`repo`), the upstream source repo (`upstream`), the
  release tag pattern (`tag`, e.g. `v{version}`), and optionally `dir` and `build`.
- A variant is a JSON file: `{ "ref": "<fork branch, tag or commit>", "base": "<upstream
version>" }`. The change is the fork's diff from `tag(base)` to `ref`. Every hunk is an
  anchor, located in the upstream source at the target version's tag (fuzz 0).
- Graft installs a version by rebasing that diff onto the target tag, running `build`, and
  `npm pack` (npm packages only; repo mode, `fork.install: none`, works for any repository). The tarball goes in `.grafts/.vendor/`, installed through overrides. Don't edit
  the tarball or the overrides by hand; `graft apply` / `graft sync --install` write them.
- When `sync` says the change no longer rebases onto a new tag:
  1. Work in the fork repository, not in `node_modules`. Create a new branch from the new
     upstream tag, e.g. `git switch -c graft/<id>-<target> <tag>`. Re-apply the change by
     behavior, using _Where to look_, and commit.
  2. Push that branch to the fork, if you're allowed to. Otherwise tell the user it needs
     pushing; Graft reads the fork from `fork.repo`.
  3. Write a new variant file, e.g. `variants/v<target>.json`, as
     `{ "ref": "graft/<id>-<target>", "base": "<target>" }`. Register it with
     `graft variant add <id> --range '>=<target>' --module ./variants/v<target>.json
--verify-version <target>`.
  4. Check it with `graft sync --version <target> --install`, then prove the Invariants with the
     project's tests.
- **Repo mode** (`fork.install: none`): the fork is the product (e.g. a translated docs site),
  nothing is installed, and a green sync materializes the rebased checkout. The diff in
  `.grafts/.report/<id>/diff.patch` is what upstream changed since the fork's base in the files
  the fork touches. A clean rebase is not enough: upstream text that lands next to the change
  (e.g. a new English paragraph in a translated page) merges without a conflict, so run the
  project's checks (the graft's _Invariants_ say which) on the result. Same fix steps as above, with `graft sync --version <target>` (no `--install`). A
  green sync leaves the result as branch `graft/<id>/<target>` in `.grafts/.cache/fork/<id>`;
  fetch it from there. Never push it unless the user asks.
- A target can be an upstream commit between releases: `--version 22.3.0-next.3+<sha>` (the
  version part is matched against variant ranges; use upstream's version at that commit).
- To create one in a fork that is the product: `graft add <id> --package <name> --mechanism fork
--in-place --version <upstream version or version+commit>` from the fork's checkout.
- **In place** (variant `{ "ref": "@worktree", "base": "@verified" }`): never write a new
  variant. A green sync puts the new `verified` only in the result branch; adopt it as a merge
  of the upstream commit it sits on (`upstream` in the report's `materialized.fetch` /
  `agentStart`), so the fork keeps upstream in its history: `git fetch <repo> <ref> && git merge
--no-ff --no-commit -s ours --allow-unrelated-histories <upstream> && git read-tree -u --reset
FETCH_HEAD`, then commit. Never adopt by a plain tree swap or by checking out the result branch
  (that drops the fork's history). On the `-agent` branch,
  graft.md already says the target version (`status: conflicted`): resolve, then
  `graft sync --version <target>` checks the working tree as it is. When it's green, take its
  result into the open merge as the report says (`git fetch <repo> <ref> && git read-tree -u
--reset FETCH_HEAD`, no second `git merge`), so graft.md says `applied`; then run the project's
  checks. Don't write a new variant: the `@worktree` / `@verified` one is permanent.
- **Start from the prepared branch.** On `needs-agent`, the report's "Start from" line names
  `graft/<id>/<target>-agent` in the cache clone: git's merge of the fork's change onto the
  target, with conflict markers left only in the files it lists. Fetch it into the fork, resolve
  those files by behavior (keep upstream's new content, re-apply the change to it, e.g.
  translate the new paragraph), remove every marker, commit, and register the new variant
  (`base` = the target). Don't redo the files that merged cleanly.

## When to stop: `conflicted`

Stop and mark the graft `conflicted` (`graft mark <id> --status conflicted --history "…"`) when:

- the behavior the graft modifies no longer exists upstream, or upstream changed it in a way
  that makes an invariant impossible or contradictory;
- you cannot make the project's tests pass for an Invariant without weakening them;
- upstream now does what the graft did — say so; a human decides whether to mark it
  `upstreamed`. Graft detects the common case for you: when the variant no longer applies
  but upstream already contains its change (for patches, the reverse patch applies cleanly),
  sync reports the graft as **likely upstreamed** (`likelyUpstreamed: true`, and
  `upstreamed.evidence` from `graft check --json`). Then don't write a new variant:
  confirm the invariants hold on pristine upstream, and recommend (or, if asked, apply with
  `graft mark <id> --status upstreamed --history "…"`) the `upstreamed` status with a History entry citing the version.

Name the failing invariant, what moved upstream, and what you tried. Open a **draft** PR with
the same information. Don't leave a half-working variant registered: if you recorded one that
doesn't pass, say so explicitly in History and the PR.

## Running inside the Graft GitHub Action

When the action invokes you, `GRAFT_PROMPT_FILE` holds your task, and the environment points
at everything else: `GRAFT_SKILL_PATH` (this file), `GRAFT_COMMAND` (how to run the CLI),
`GRAFT_REPORT_MD` / `GRAFT_REPORT_JSON` (the sync report), `GRAFT_PACKAGE`,
`GRAFT_TARGET_VERSION`, and `GRAFT_BRANCH` (already checked out).

- Do **not** commit, push, or open a pull request. The action re-runs `graft sync` on your
  work and opens the PR itself: a normal PR when every graft fits, otherwise a draft. It can't
  check behavior: prove the Invariants with the project's tests before you finish, and say how
  in the PR description.
- Write the PR description (format below) to `GRAFT_PR_BODY_FILE`.

## PR description

```markdown
## Graft sync: <package> <verified> → <target>

| Graft | Outcome                                                      |
| ----- | ------------------------------------------------------------ |
| <id>  | ✅ deterministic first pass / 🛠️ new variant / ❌ conflicted |

### <id>

**What changed upstream:** <the behavior-level change, citing the scoped diff>
**Anchors that moved:** <anchor names, and where they went>
**New variant:** `variants/<file>` for `<range>` — <how it differs from the previous variant>
**Verified:** <which tests, covering which Invariants, passed against <package>@<target>>
```

For a conflicted graft, replace _New variant_ and _Verified_ with **Failing invariant**,
**What was tried**, and **What a human needs to decide**.

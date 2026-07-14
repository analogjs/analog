---
name: open-pr
description: Commit the current work, push the current feature branch, and open a GitHub PR filled out from the repo's PR template. Defaults the base branch to `beta`. Assumes you're already on a feature branch — it does not create branches. Use when the user says "open a PR", "create a PR", "make a PR", or asks to submit the current changes for review.
---

Take the current working changes and turn them into a GitHub pull request: commit, format, push, and open the PR with `gh`, filling out the repository's PR template.

This skill **prepares and opens the PR only**. It does not create branches and does not write code. It assumes you are already on the feature branch you want to submit. Default the **base branch to `beta`**; if the user names a different base (e.g. "PR to main"), use that instead.

## 1. Assess the working tree

- `git status`, `git diff`, and `git diff --cached` to see what's staged/unstaged.
- `git branch --show-current` for the current branch.
- If there's nothing to commit and the branch is already pushed, skip to step 4 (just open the PR for existing commits).

## 2. Guard the branch — don't commit to base

- If the current branch **is** the base branch (`beta`, or whatever the user chose), **stop** and tell the user: you're on the base branch and this skill doesn't branch. Ask them to switch to a feature branch first (the fix-issue / feature flow owns branch creation).
- Otherwise proceed on the current feature branch.

## 3. Format, then commit

- Run prettier on the changed files before committing so the commit is clean:
  `npx prettier --write <changed files>` then `npx prettier --check <changed files>`.
  (Prefer the repo's own prettier if installed; fall back to `npx` when deps aren't installed.)
- Stage the intended files explicitly (`git add <paths>`) — don't blindly `git add -A`.
- Write a **conventional commit** message: `<type>(<scope>): <summary>`, with a body explaining the _why_, and `Closes #<issue>` if one applies.
- End every commit message with the required footer:

  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```

- If commits already exist and there's nothing new to add, skip committing.

## 4. Push

- `git push -u origin <branch>` (use `--force-with-lease`, never `--force`, if amending an already-pushed branch).

## 5. Open the PR

- Read the repo's PR template if present: `.github/PULL_REQUEST_TEMPLATE.md` (or `.github/pull_request_template.md`). Fill out **every** section — don't submit a bare body.
- Determine the **affected scope** for templates that ask for it: map changed file paths against `.github/pr-scope-map.json` (or `CONTRIBUTING.md`) when those exist; otherwise infer the primary package/area from the paths.
- Default the merge-strategy checkbox to **Squash merge** unless the user says otherwise.
- For the test-plan checklist: only check boxes for steps you actually ran. If dependencies weren't installed and you couldn't run the suite, leave those unchecked and add a short note saying CI/maintainer will verify — don't claim tests passed when they didn't.
- Create the PR with the base defaulting to `beta`:

  ```
  gh pr create --base beta --title "<conventional title>" --body "$(cat <<'EOF'
  <filled-out template>
  EOF
  )"
  ```

- End the PR **body** with:

  ```
  🤖 Generated with [Claude Code](https://claude.com/claude-code)
  ```

- Opening a PR is an outward-facing action. If the user hasn't clearly authorized it this turn, confirm the title and base branch before running `gh pr create`. Report the resulting PR URL.

## Notes

- Use the `gh` CLI for all GitHub operations; interactive git flags (`-i`) are unavailable.
- If `gh pr create` reports a PR already exists for the branch, surface that URL instead of erroring out.
- Keep the PR scoped to the work at hand — flag (don't silently include) unrelated changes you notice in the working tree.

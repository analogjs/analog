---
name: fix-issue
description: End-to-end flow for resolving a GitHub issue — fetch and understand the issue, create a feature branch off `beta`, implement and verify the fix, then hand off to the open-pr skill. Use when the user says "fix issue <n>", "work on issue <n>", or wants to take an issue from investigation through to a PR.
---

Drive a GitHub issue from investigation to a ready-to-review fix on a feature branch. This skill owns **understanding, branching, and implementing**. It hands the commit/push/PR step off to the `open-pr` skill.

Take the issue number/URL from the user. If none is given, ask for it.

## 1. Understand the issue

- `gh issue view <n> --json title,body,state,labels,comments,author,createdAt` to read it. (Plain `gh issue view <n>` may fail on Projects-classic GraphQL — prefer the `--json` form.)
- Read any linked reproduction repo, error output, and referenced files. Identify the affected package/area.
- Trace the **root cause** in the codebase before writing anything — read the relevant source, not just the symptom. Delegate broad searches to the Explore agent when the cause could live in several places.
- Restate the root cause and intended fix to the user, and confirm the approach before large or behavior-changing edits. Surface trade-offs and regression risks.

## 2. Create a feature branch off `beta`

- Branch from the base branch (`beta` by default; honor a different base if the user names one). First sync the base with its remote so the new branch starts from the latest tip:
  `git checkout <base> && git pull --ff-only && git checkout -b <type>/<n>-<short-slug> <base>`
  — pick `<type>` from the change (`fix`, `feat`, `chore`, `docs`, `refactor`, `test`) and a short kebab slug referencing the issue, e.g. `fix/2348-dts-in-source`.
- If `git pull --ff-only` fails (local diverged from remote), stop and surface it to the user — don't force or rebase silently.
- If the user already created/named a branch, use that instead. Never implement on the base branch.

## 3. Implement the fix

- Make the **minimal, well-scoped** change that addresses the root cause. Match the surrounding code's style and idioms.
- Add or update tests when the repo's conventions call for them — but respect explicit user direction (e.g. "no snapshot test").
- Verify as far as the environment allows: run the affected package's tests/typecheck if dependencies are installed; if they aren't, say so plainly rather than claiming success. Consider the `verify` or `code-review` skills for behavior changes.
- Reason explicitly about regressions: who else hits this code path, and does the change alter their behavior?

## 4. Hand off to open-pr

- Once the fix is on the feature branch and verified, invoke the **`open-pr`** skill to format, commit (with `Closes #<n>`), push, and open the PR against `beta`.
- Don't duplicate open-pr's logic here — it owns commit message conventions, the PR template, scope mapping, and the outward-facing confirmation.

## Notes

- Keep investigation findings concise but show the evidence (file:line) for the root cause.
- If the issue turns out to be invalid, already fixed, or a usage question rather than a bug, report that instead of forcing a fix.

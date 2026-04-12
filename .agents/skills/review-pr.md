---
name: review-pr
description: Review a pull request for functional concerns. Use as a guide for reviewers or submitters preparing a PR.
---

Review the specified pull request for **functional concerns only**. Ignore stylistic nits that don't impact correctness, performance, or maintainability.

The PR number is provided as an argument. If no argument is given, check for an open PR on the current branch.

## 1. Fetch PR context

- Use `gh pr view <number> --json title,body,headRefName,baseRefName,files,additions,deletions` to get metadata
- Use `gh pr diff <number>` to get the full diff
- Read every changed file in the diff — don't skim

## 2. Review focus areas

Evaluate the diff against these categories. Only report findings that have real functional impact:

| Category                    | What to look for                                                                                                                               |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Logic bugs**              | Off-by-one errors, incorrect conditions, unreachable code, silent failures                                                                     |
| **Type safety**             | Unsafe casts, type discrimination holes, `any` leaks, incorrect generics                                                                       |
| **Regex**                   | ReDoS potential, incorrect escaping, wrong flags, missing anchors                                                                              |
| **Performance**             | Eager evaluation in hot paths, unnecessary allocations per-request, O(n^2) where O(n) is possible                                              |
| **State & concurrency**     | Module-scoped mutable state, race conditions, missing cleanup                                                                                  |
| **Code duplication**        | Duplicated logic that will drift — only flag if >50 lines or contains branching logic                                                          |
| **API contracts**           | Breaking changes not flagged, silent behavior changes, incorrect error handling at boundaries                                                  |
| **Security**                | Injection vectors, credential handling, unsafe deserialization                                                                                 |
| **Test coverage alignment** | Do the tests actually exercise the code paths that changed, or are they testing something adjacent?                                            |
| **Build artifact impact**   | Does the change affect what ships in the npm package? New files in `src/` that aren't tree-shakeable, accidental inclusion of test files, etc. |

## 3. Check contribution guidelines

Read `CONTRIBUTING.md` at the repo root and verify the PR complies. Only check mechanical items:

| Guideline           | How to verify                                                                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **PR title format** | Must be `type(scope): description`. Type must be one of: build, ci, docs, feat, fix, perf, refactor, style, test. Scope must be a supported package name from CONTRIBUTING.md. |
| **Tests included**  | New functionality must have tests. Check the PR body's test plan for unchecked items.                                                                                          |
| **Squash merge**    | Preferred unless the PR explains why commit boundaries matter.                                                                                                                 |
| **Related commits** | All commits should be related. Flag disjoint changes that should be separate PRs.                                                                                              |
| **Linked issues**   | The PR should reference related issues. Flag if "Closes #" is empty.                                                                                                           |
| **PR template**     | Should include affected scope, test plan, and merge strategy recommendation.                                                                                                   |

## 4. Output format

Write all findings in **second person**, actionable, ready to post as a review comment.

- Code findings as a flat list grouped by severity
- For each finding:
  - Name the category
  - Reference the specific file and code
  - Explain the functional impact
  - Suggest a fix if non-obvious
- Mechanical guideline findings (title format, tests, linked issues, etc.)

Skip categories with no findings. Do not pad the review with praise or filler.

End with a verdict table:

```
| Area | Verdict |
|------|---------|
| ... | ... |
```

Keep verdicts to one phrase: "Clean", "Minor concern", "Should fix before merge", "Blocking".

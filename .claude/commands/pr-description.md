Generate a pull request description for the current branch.

1. Run `git fetch --all` then `git log --oneline $(git merge-base HEAD origin/beta)..HEAD` to see all commits on this branch.
2. Run `git diff origin/beta...HEAD --stat` to see changed files.
3. Read `.github/PULL_REQUEST_TEMPLATE.md` for the required PR structure.
4. Read `CONTRIBUTING.md` for valid scopes and commit conventions.
5. Analyze the commits and changed files to fill in every section of the template:
   - **PR Checklist**: One-sentence summary of what the PR does.
   - **Affected scope**: Primary and secondary scopes from the commit scope table in AGENTS.md.
   - **Recommended merge strategy**: Default to Squash merge unless commits intentionally preserve important boundaries.
   - **What is the new behavior?**: Concise bullet points describing each change.
   - **Test plan**: List commands run and verification performed. Check boxes for commands that were actually run.
   - **Breaking change**: Yes/No with migration path if yes.
6. Copy the final markdown to the clipboard using `pbcopy`.
7. Confirm it was copied.

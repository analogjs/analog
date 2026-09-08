# anti-slop provenance

- Source repository: https://github.com/dmmulroy/anti-slop
- Source commit: `95a56e5d24fb3d849673c2d51eb0908b8bd2d33b` (2026-09-08, "Add array performance rules and safe vendored upgrade guidance")
- Copied from: `skills/install-anti-slop/assets/anti-slop/` at that commit, via `scripts/install.mjs`
- Installed paths:
  - `tools/oxlint/anti-slop/index.ts` (generic plugin, registered in `.oxlintrc.json`)
  - `tools/oxlint/anti-slop/effect/index.ts` (Effect plugin, copied but not registered; this repo does not depend on Effect)
- Dependencies: `oxlint@1.82.0`, `@oxlint/plugins@1.82.0` (pinned exactly)
- Intentional deviations from upstream: none. Files are byte-identical to the source snapshot.
- Repository-side adjustments: `tools/oxlint/anti-slop` is listed in `.prettierignore` so lint-staged does not reformat the vendored source. No rule severities were lowered; this is an evaluation install and the repo's CI lint target still runs ESLint only.

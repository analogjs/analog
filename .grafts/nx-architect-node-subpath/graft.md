---
id: nx-architect-node-subpath
rootstock:
  package: nx
  verified: 24.0.0
mechanism: patch
targets:
  - dist/src/adapter/ngcli-adapter.js
variants:
  - range: '>=24.0.0-0'
    module: ./variants/v24.patch
status: applied
---

## Why

When Nx runs an Angular CLI builder (any target whose executor comes from a package's
`builders` manifest, e.g. `@angular-devkit/build-angular:extract-i18n` or
`@analogjs/storybook-angular:*`), it loads `WorkspaceNodeModulesArchitectHost` by deep-importing
`@angular-devkit/architect/node/index.js`. Starting with `@angular-devkit/architect@0.2203.0`
(Angular CLI 22.3), architect ships an `exports` map that exposes only `./node`, so the deep
import fails with `ERR_PACKAGE_PATH_NOT_EXPORTED` and every builder target fails before it runs.

The variant imports the public `@angular-devkit/architect/node` subpath instead. That works both
with architect versions that have no `exports` map and with those that do. Without it the
workspace had to pin `@angular-devkit/architect` to `0.2202.x` while every other Angular devkit
package moved to 22.3.

Upstream: reported in https://github.com/nrwl/nx/issues/37955 and fixed by
https://github.com/nrwl/nx/pull/37951, which hadn't been released as of nx 24.0.6 /
24.1.0-beta.2. Once a release contains the fix, `graft sync` should report this graft as
likely upstreamed. Then mark it `upstreamed` and drop the patch.

## Invariants

- Nx can schedule and run an Angular CLI builder target in a workspace where
  `@angular-devkit/architect` has an `exports` map (0.2203.0 or later). The builder runs and
  its output is returned.
  Covered by `packages/nx-plugin/src/builders/nx-architect-host.spec.ts`:
  "runs a builder target with the options from the project configuration".
- A builder run through Nx receives the target's options from the project configuration, with
  run options overriding them (pre-existing behavior the graft must not break).
  Covered by the same spec: both tests, especially "applies run options over the configured
  options".

Run with `pnpm nx test nx-plugin` (or
`pnpm exec vitest run --config packages/nx-plugin/vite.config.ts packages/nx-plugin/src/builders/nx-architect-host.spec.ts`).
Without the patch, against architect 0.2203.0, both tests fail with
`Package subpath './node/index' is not defined by "exports"`.

## Where to look

Nx's Angular CLI compatibility adapter: the code that wraps Angular's node-modules architect
host so Angular builders can run against Nx's project configuration. It is reached from Nx's
"schedule an Angular builder target" and "create a builder context" paths. Find where Nx
dynamically imports the architect package's Node host (`WorkspaceNodeModulesArchitectHost`) and
check which specifier it uses. Any specifier other than a subpath that architect's `exports` map
declares (`@angular-devkit/architect/node`) breaks.

## Anchors

- `dist/src/adapter/ngcli-adapter.js#1` — the single line that destructures
  `WorkspaceNodeModulesArchitectHost` from `handleImport('@angular-devkit/architect/node/index.js')`.
  It was chosen because the deep-import specifier string _is_ the bug. It is a public module
  specifier rather than incidental code shape, so a miss means either upstream fixed it (the
  reverse patch applies: upstreamed) or the loader was refactored (re-find by _Where to look_).

## History

- 2026-11-19: Graft created against nx@24.0.0, replacing the `@angular-devkit/architect: 0.2202.0`
  pin in `pnpm-workspace.yaml`. Architect is now on 0.2203.0, in line with the other Angular
  devkit 22.3 packages.
- 2026-11-19: `graft replay` shows the v24 variant fits nx 24.0.0–24.0.6. The deep import is
  unchanged in 24.1.0-beta.2. Earlier majors (≤23.x) aren't covered and don't need to be.

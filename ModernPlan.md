# Analog Modernization Plan

> Target repo: `/Volumes/SnyderDev/@benpsnyder/analog-bak`
> Output location: this workspace only
> Basis: `/Volumes/SnyderDev/snyder/snyder-apps/docs/TheTechnicalPlan/Trackers/NxModernTypescript.md`
> Last updated: April 11, 2026

## Purpose

This plan translates the lessons from `NxModernTypescript.md` into a repo-specific modernization path for `analog-bak`.

The key point is not "copy Snyder Apps." The useful lesson is narrower:

- move from root TypeScript aliasing toward workspace-native package identity
- let Nx manage project-linking shape instead of hand-maintaining it
- make package names, exports, references, and build tooling agree with each other
- finish the migration to a single modern TypeScript model instead of keeping a hybrid forever

What Analog should **not** copy blindly:

- Bun-first workflow assumptions
- Snyder-specific `just` conventions
- Snyder package scopes
- Snyder hygiene scripts that are specific to that monorepo

## What Analog Can Learn

`NxModernTypescript.md` is useful because it treats modern Nx TypeScript as a system, not a single tsconfig tweak.

The transferable lessons are:

1. Root `tsconfig.base.json` should hold shared compiler options, not be the long-term source of cross-project linkage.
2. Cross-project imports should resolve through real workspace packages and `exports`, not primarily through root `compilerOptions.paths`.
3. `tsconfig.json` files should form a coherent reference graph that Nx can maintain, instead of relying on manually curated alias maps.
4. Package identity matters. If aliases, package names, exports, and import sites disagree, project references become fragile.
5. Migration should be slice-based. Angular-heavy projects should move later than lower-risk packages.
6. Enforcement and scaffolding must be updated with the architecture. Otherwise generators and docs keep reintroducing the old model.

## Analog Baseline

These observations come from the current `analog-bak` checkout.

- `analog-bak` already uses pnpm workspaces, which is compatible with the tracker’s workspace-plus-project-references direction.
- The root workspace currently has about 30 Nx projects, 38 `package.json` files, and 107 `tsconfig*.json` files.
- Project-level `references` already exist in many places, but the repo is still a hybrid:
  - 28 `tsconfig*.json` files contain `references`
  - 3 `tsconfig*.json` files currently set `composite: true`
  - 7 `tsconfig*.json` files still declare `paths`
  - 24 `tsconfig*.json` files include `angularCompilerOptions`
- The root TypeScript model is partially modernized, but not finished:
  - `tsconfig.base.json` has `rootDir: "."`
  - `tsconfig.base.json` has `declaration: true`
  - `tsconfig.base.json` currently declares 22 root path aliases, down from the original 32
  - a root `tsconfig.json` now exists as the reference entrypoint
  - `nx sync:check` is now meaningful because Nx TypeScript sync is enabled
- Build-facing and test-facing runtime configs are still exception zones:
  - `tsconfig.app.json`
  - `tsconfig.lib.json`
  - `tsconfig.spec.json`
    These remain `composite: false` because Angular/Vite package builds and Vitest-backed tests still break when those configs inherit the root composite setting.

## Review Notes Before Execution

- `packages/content-plugin` is not just a naming mismatch. It is a build helper that intentionally writes into `packages/content/dist/plugin` so `@analogjs/content` can expose migrations from `./plugin/migrations.json`. Treat it as a packaging exception until that publish model is intentionally redesigned.
- `packages/platform/src/lib/discover-library-routes.ts` currently discovers route-capable workspace libs by reading root tsconfig path targets. Alias cleanup is still the right direction, but route discovery must become target-path based rather than alias-name based before private libs can safely move to `@analogjs/*` identities.

## What We Learned By Actually Executing It

- The root TypeScript entrypoint and Nx-managed reference graph are working in this repo now. That part of the tracker translated cleanly.
- Private internal lib identity cleanup also worked. `card`, `my-package`, and `shared/feature` can use `@analogjs/*` names without breaking route discovery because `discover-library-routes.ts` now keys off path targets instead of alias names.
- The difficult part is not the root `tsconfig.json` or Nx sync. The difficult part is source-vs-dist identity inside published packages that still self-import their own public names during local source execution.
- Removing `@analogjs/vitest-angular/setup-testbed` and `@analogjs/vitest-angular/setup-zone` from the root alias map broke browser-mode Vitest suites. Vite started treating those package exports like optimized dependencies, which triggered Vitest runner resolution failures. Those setup entrypoints still need source-resolution semantics until the test pipeline is refactored.
- Removing `@analogjs/content*` and `@analogjs/router*` root aliases broke tests in a different way: Angular DI tokens split across source and dist resolution, causing provider mismatches like missing `CONTENT_FILE_LOADER` and missing `API_PREFIX`. That means these package families are still load-bearing in the alias map during local source/test execution.
- Full-root-alias removal is therefore not the next correct step. The next correct step is to eliminate internal self-import patterns and source/dist identity splits so those aliases stop being special.
- When validating alias work, serialize the run. Ad hoc parallel runs can race on shared package build outputs such as `content:build-self` and `content-plugin:build`.

## Concrete Gaps To Fix Early

### 1. Alias and package identity do not fully agree

Representative mismatches:

- `libs/card` alias points at `libs/card`, but the package is `@analogjs/card`
- `my-package` alias points at `libs/my-package`, but the package is `@analogjs/my-package`
- `shared/feature` alias points at `libs/shared/feature`, but the package is `@analogjs/shared-feature`
- `vitest-angular` alias points at `packages/vitest-angular`, but the package is `@analogjs/vitest-angular`

Packaging exception to treat separately:

- `@analogjs/content-plugin` alias points at `packages/content-plugin`, but the underlying source package is intentionally a helper for `@analogjs/content/plugin`, not a normal standalone publish target

This is exactly the kind of drift the tracker warns about. A repo cannot cleanly move to package-native linking while keeping multiple identities for the same project.

### 2. Tooling still assumes root path alias resolution

Several Vite configs still use `@nx/vite/plugins/nx-tsconfig-paths.plugin`, including:

- `apps/analog-app/vite.config.ts`
- `apps/blog-app/vite.config.ts`
- `apps/tailwind-debug-app/vite.config.ts`
- `libs/card/vite.config.ts`
- `libs/my-package/vite.config.ts`
- `libs/top-bar/vite.config.ts`

That is acceptable as a transition aid, but it should stop being the primary cross-package linking mechanism.

### 3. Root config shape is improved, but exception policy is still part of the architecture

The repo is no longer missing the modern Nx pieces. It now has:

- a root `tsconfig.json` as the canonical `files: []` plus top-level `references` entrypoint
- Nx-managed TypeScript sync for project-level `tsconfig.json` references
- a repo-wide composite/reference policy at the root level

The remaining problem is narrower:

- runtime and test tsconfigs still need to stay non-composite
- some root aliases are still acting as source-resolution shims for packages whose local source/tests are not yet package-native

### 4. Scripts and generators still preserve older patterns

Current root scripts still show pre-modernization habits:

- `build`: `nx run-many --target build --all`
- `test:vite-ci`: `nx run-many --target test --exclude card --all --skip-nx-cache`
- `build:vite-ci`: `npm run build`
- `preinstall`: `npx only-allow pnpm`

The bigger issue is not the command style itself. It is that Analog’s generators and templates must move with the architecture, or every new app will keep inheriting alias-heavy config.

## Target End State

Analog should end up with:

- pnpm workspaces remaining in place
- root `tsconfig.base.json` reduced to shared compiler options
- a root `tsconfig.json` containing `files: []` and top-level `references`
- project references used as the real dependency graph, not just local app/lib split references
- package names aligned with import identities
- `exports` covering supported subpath imports
- root path aliases removed for cross-project linking
- Vite and test configs working without depending on root alias maps for package-to-package imports
- app generators and templates emitting the new model by default

## Execution Plan

### Phase 0: Freeze The Old Pattern

- Stop adding new cross-project aliases to `tsconfig.base.json`.
- Decide the canonical naming rule:
  - likely `@analogjs/*` for published and internal workspace packages that cross package boundaries
  - avoid unscoped exceptions unless they are truly intentional publish targets
- Record a baseline with:
  - `pnpm nx show projects --json`
  - `pnpm nx sync:check`
  - `pnpm nx run-many -t build,test,lint --skip-nx-cache`
  - targeted app and package smoke checks for `analog-app`, `blog-app`, `platform`, `router`, and `vite-plugin-angular`

Exit criteria:

- naming policy is written down
- no new root alias debt is being added

### Phase 1: Normalize Package Identity Before TS Graph Changes

- Rename or align packages whose package name does not match the import identity already advertised by the repo.
- Remove legacy alias names such as `libs/card`, `my-package`, `shared/feature`, and bare `vitest-angular` from source imports.
- Do not treat `content-plugin` like the other Phase 1 mismatches until the `@analogjs/content/plugin` migration packaging story is intentionally redesigned.
- Audit subpath imports and back them with `exports` in package manifests.

Status after execution:

- this phase is partially complete for internal libs
- private lib imports now use `@analogjs/*` package-style names
- the remaining identity work is inside published packages that still self-import their public package names during local source builds and tests

Recommended first fixes:

- `packages/content-plugin/package.json`
- `libs/card/package.json`
- `libs/my-package/package.json`
- `libs/shared/feature/package.json`
- `packages/vitest-angular/package.json`

Exit criteria:

- one import identity per project
- supported subpaths are declared in `exports`

### Phase 2: Establish The Modern Root TS Layout

- Add a root `tsconfig.json` as the canonical reference entrypoint:
  - `files: []`
  - repo-level `references`
- Reduce `tsconfig.base.json` to shared compiler options.
- Remove root-level `rootDir` unless a specific tool still proves it is required.
- Move toward the tracker’s reference-first model:
  - shared options in `tsconfig.base.json`
  - graph entry in `tsconfig.json`
  - project-local detail in per-project tsconfigs

Important nuance for Analog:

- Analog already has project-local `references` for app/lib/spec/storybook splits.
- Do not destroy that working structure.
- Instead, extend it upward so package-to-package dependencies are represented explicitly as well.
- Keep build-facing and test-facing runtime configs non-composite for now:
  - `tsconfig.app.json`
  - `tsconfig.lib.json`
  - `tsconfig.spec.json`
- In this repo, making those configs composite currently breaks Angular/Vite package builds with `TS6304` declaration-emit errors and breaks Vitest-backed suites in ways that are not just cosmetic.

Exit criteria:

- root config shape matches the modern Nx recommendation
- local app/lib/spec references still work

### Phase 3: Turn Nx Sync Into A Real Dependency Manager

- Configure the workspace so `pnpm nx sync` and `pnpm nx sync:check` actually maintain the TypeScript dependency graph.
- Add the relevant Nx TypeScript linking support rather than leaving `sync:check` as a no-op.
- Verify that project references between packages are generated or maintained by Nx instead of being hand-curated.
- Configure Nx sync to manage project-level `tsconfig.json` references only, not runtime `tsconfig.app.json` or `tsconfig.lib.json`, unless the Angular/Vite toolchain becomes composite-safe.

This is one of the biggest lessons from `NxModernTypescript.md`: project references only stay healthy at scale if tooling owns the graph.

Status after execution:

- this phase is complete enough to keep
- `nx sync:check` is now a real guardrail instead of a no-op
- Nx should continue owning only the project-level `tsconfig.json` graph until the Angular/Vite runtime configs become composite-safe

Exit criteria:

- `pnpm nx sync:check` fails when the reference graph drifts
- package dependency references are maintained consistently

### Phase 4: Migrate By Slice

Do not modernize everything at once.

#### Wave A: Lowest-risk packages

Start with packages that already behave like well-bounded libraries:

- `packages/platform`
- `packages/router`
- `packages/content`
- `packages/vite-plugin-angular`
- `packages/vite-plugin-nitro`
- `packages/astro-angular`
- `packages/storybook-angular`
- `packages/vitest-angular`
- `packages/content-plugin`

Why first:

- these packages are central to Analog’s public API
- they already use `workspace:*` dependencies in several places
- they are less messy than Angular application shells

#### Wave B: Simple internal libs

- `libs/card`
- `libs/my-package`
- `libs/shared/feature`
- `libs/top-bar`

Why next:

- these are where the alias/package mismatches are most obvious
- they are good canaries for eliminating root alias shortcuts

#### Wave C: Example and playground apps

- `apps/analog-app`
- `apps/blog-app`
- `apps/tailwind-debug-app`
- `apps/tanstack-query-app`
- `apps/astro-app`
- `apps/opt-catchall-app`

Why later:

- Angular app tsconfig chains are more fragile
- Vite, Storybook, and test runners all need to keep working during the transition

#### Wave D: Docs, templates, and generators

- `apps/docs-app`
- `packages/create-analog`
- `packages/nx-plugin`
- template files under `packages/create-analog/**`
- generator template files under `packages/nx-plugin/src/generators/**`

Why last:

- templates must reflect the new architecture only after the architecture is proven
- otherwise new generated projects will keep bootstrapping the old model

Exit criteria for each wave:

- build passes for the wave
- lint passes for the wave
- tests pass for the wave
- no new cross-project root aliases were added
- Nx sync remains clean

### Phase 5: Retire Root Alias Linking

- Remove root `compilerOptions.paths` entries that represent package-to-package imports.
- Keep only narrowly justified local aliases if they do not cross package boundaries.
- Remove Vite config reliance on tsconfig-path plugins where real package resolution is sufficient.
- Update docs that currently teach alias-based setup when package-native imports are now preferred.

Important caution:

- Some subpath imports such as `@analogjs/router/server` or `@analogjs/content/mdc` are legitimate package API surfaces.
- Those should move from tsconfig aliasing to package `exports`, not disappear.
- In this repo, not every remaining root alias is the same kind of debt.
- The alias families currently proven to be load-bearing are:
  - `@analogjs/vitest-angular*` setup entrypoints, because package-export resolution currently breaks browser-mode Vitest setup
  - `@analogjs/content*`, because mixed source/dist resolution can create duplicate Angular token identity in tests
  - `@analogjs/router*`, for the same source/dist identity reason
- The aliases currently removed without breaking full unit validation include:
  - `@analogjs/platform`
  - `@analogjs/vite-plugin-angular`
  - `@analogjs/vite-plugin-nitro`
  - `@analogjs/astro-angular`
  - `@analogjs/nx`
  - `@analogjs/content-plugin`
- The right migration tactic is now “remove by family after proving source-native execution”, not “delete all published package aliases at once”.

Exit criteria:

- root `paths` is no longer the package graph
- subpath imports resolve via package exports

### Phase 5A: Remove The Remaining Load-Bearing Alias Families The Right Way

Before removing more root aliases:

- convert implementation-only self-imports inside `packages/content`, `packages/router`, and `packages/vitest-angular` to relative imports where public-package indirection is not intentional
- separate public-entrypoint tests from internal implementation tests so a single suite does not mix source imports and published-entrypoint imports for the same symbols
- decide how Vitest setup entrypoints should resolve locally:
  - source alias
  - explicit Vite test inlining/aliasing
  - another workspace-local mechanism that avoids dependency optimization
- once those packages are source-stable, remove their root aliases one family at a time and rerun the full serialized `test` and `e2e` matrix after each cut

### Phase 6: Modernize Operational Conventions

After the TypeScript linking migration is stable:

- replace broad `--all` CI recipes with more intentional Nx task selection where appropriate
- keep release builds explicit, but move normal validation toward affected or targeted runs
- remove `npm run` indirection from pnpm-first scripts
- remove `npx` usage from repo-owned workflows if pnpm-native equivalents exist

This phase is useful, but it is downstream of the package-and-tsconfig work.

## Verification Gates

Run these after each migration wave:

```bash
pnpm nx sync:check
pnpm nx run-many -t lint --projects <wave-projects>
pnpm nx run-many -t test --projects <wave-projects>
pnpm nx run-many -t build --projects <wave-projects>
```

When changing root aliasing or source-resolution behavior, use a stricter gate:

```bash
pnpm nx sync:check --verbose
pnpm nx run-many -t test --all --parallel=1 --skip-nx-cache
pnpm nx run-many -t e2e --all --parallel=1 --skip-nx-cache
```

Also keep a small canary set that exercises the public surface:

- `packages/platform`
- `packages/router`
- `packages/content`
- `packages/vite-plugin-angular`
- `apps/analog-app`
- `apps/blog-app`

## Risks

- Angular app tsconfig chains can break subtly if references are changed too aggressively.
- Vite config may still depend on tsconfig path behavior during the transition.
- published-package self-imports can silently create mixed source/dist graphs and duplicate Angular DI token identity
- Vitest setup entrypoints behave differently from normal library imports because dependency optimization can break the runner context
- Generator templates can silently reintroduce old patterns unless they are updated last and verified.
- Published package names must be treated carefully to avoid accidental consumer-facing breaks.

## Recommended Next Sequence

1. Keep the current root `tsconfig.json` plus Nx sync foundation and commit it as the new baseline.
2. Remove implementation-only self-imports inside `packages/content`, `packages/router`, and `packages/vitest-angular`.
3. Replace root-alias dependence for those families with a deliberate local source-resolution strategy that does not rely on the global root map.
4. Remove `nxViteTsPaths()` from live apps/libs only after the remaining load-bearing alias families stop depending on the root map.
5. Clean up package-local `paths` in `tsconfig.lib.json` files once the published packages no longer need them to protect source identity.
6. Update generators, templates, and docs so new projects stop reintroducing the old model.

## Bottom Line

The strongest lesson from `NxModernTypescript.md` is that Analog should stop living in a half-modern state.

It already has:

- workspace packages
- many project-level references
- `workspace:*` dependencies
- modern Nx and TypeScript versions

What it lacks is consistency, especially around local source execution of published packages. The modernization effort should now focus less on “delete more aliases” and more on removing the reasons those aliases are still load-bearing. Once source-vs-dist identity is fixed in `content`, `router`, and `vitest-angular`, the rest of the root alias map can shrink safely.

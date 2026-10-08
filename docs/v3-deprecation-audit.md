# Analog v3 deprecation audit

This is a removal proposal for Analog 3, based on alpha `4225f4509` (3.0.0-alpha.86). It does not change APIs or the supported Angular range. It addresses [analogjs/analog#2215](https://github.com/analogjs/analog/issues/2215); each implementation remains separately reviewable.

## Published package inventory

Reviewed package entrypoints, export maps, builders/schematics, and `@deprecated` / `@sunset` annotations in package source. An absence of annotations is not proof that every underlying Angular API is current.

| Package                                                                | Finding                                                                                                                   | Proposed disposition                                                               |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `@analogjs/router`                                                     | Public `defineRouteMeta`; `RouteExport` also references its return type.                                                  | Remove in v3; use `RouteMeta`.                                                     |
| `@analogjs/vitest-angular`                                             | Public `setupTestBed({ browserMode })`, explicitly sunset at 3.0.0.                                                       | Remove the runtime option; use explicit teardown configuration.                    |
| `@analogjs/vitest-angular` builder internals                           | Deprecated `esbuildDownlevelPlugin` alias for `downlevelPlugin`; absent from the package export map and root entrypoint.  | Internal cleanup can be separate; do not present it as another public API removal. |
| `@analogjs/platform`, `@analogjs/vite-plugin-nitro`                    | No remaining annotated public deprecations. `useAPIMiddleware` removal is already on alpha.                               | Document the existing change; do not reimplement it.                               |
| `@analogjs/vite-plugin-angular`, `@analogjs/vite-plugin-angular-tools` | No annotated public deprecations; compiler/devkit compatibility branches still support older Angular majors.              | Change only as part of the Angular floor proposal below.                           |
| `@analogjs/content`, `@analogjs/content-plugin`                        | No annotated public deprecations found.                                                                                   | No removal proposed by this audit. Keep renderer experimentation separate.         |
| `@analogjs/astro-angular`, `@analogjs/storybook-angular`               | No annotated public deprecations found.                                                                                   | Keep integration upgrades and their compatibility qualification in existing PRs.   |
| `@analogjs/nx-plugin`, `create-analog`                                 | No annotated public deprecations; version selectors, dependency sets and starter templates carry older Angular support.   | Update coherently with the Angular floor.                                          |
| `@analogjs/vitest-angular-tools`                                       | Generates the deprecated runtime option for browser tests. Its own `browserMode` schematic option selects an environment. | Migrate generated setup code; retain the schematic option.                         |

`@analogjs/trpc` is mentioned in the Angular-floor issue but has no package directory on this alpha snapshot. Do not add a placeholder package or claim to update an absent manifest.

## Separate removal proposals

### Route metadata helper

[analogjs/analog#2431](https://github.com/analogjs/analog/issues/2431) owns removal of `defineRouteMeta`, its backing `RestrictedRoute` type, the public export, and its `RouteExport` type reference. Review the platform route-idiom diagnostic at the same time so ordinary typed object metadata retains its diagnostics.

Before:

```ts
import { defineRouteMeta } from '@analogjs/router';
export const routeMeta = defineRouteMeta({ title: 'Welcome' });
```

After:

```ts
import type { RouteMeta } from '@analogjs/router';
export const routeMeta: RouteMeta = { title: 'Welcome' };
```

Acceptance: build the router's published declarations; test ordinary metadata, redirect metadata and platform route diagnostics; migrate maintained examples and add the v3 migration note. Confirm no public export or implementation reference remains. The beta API remains available to Analog 2 consumers.

### TestBed runtime shorthand

[analogjs/analog#2430](https://github.com/analogjs/analog/issues/2430) owns the runtime removal and generated call migration:

```ts
// Before
setupTestBed({ browserMode: true });
// After
setupTestBed({ teardown: { destroyAfterEach: false } });
```

Calls without the shorthand must retain `destroyAfterEach: true`. Explicit unknown-element/property error flags and provider options must retain their behavior. Keep the schematic's browser/jsdom selection and Playwright dependency generation intact.

Acceptance: tests exercise default teardown and explicit overrides; schematic tests assert both browser and jsdom output; compile a generated setup file; build the public setup-testbed entrypoint. Reconcile with [analogjs/analog#2527](https://github.com/analogjs/analog/pull/2527), which upgrades Vitest and currently retains the shorthand. Do not duplicate that upgrade.

### Angular 20 minimum

[analogjs/analog#2490](https://github.com/analogjs/analog/issues/2490) proposes support for Angular 20–22 in v3 and directs Angular 17–19 users to Analog 2. This is a support-policy change, not merely deletion of annotated APIs.

Review and land the following as one coherent support-floor PR after agreeing the release policy:

1. Update the peer catalogs in `pnpm-workspace.yaml` and the package manifests consuming them. Audit optional peers before removing a devkit fallback; prove all supported build/test integrations resolve through the retained path.
2. Align both Nx generator minimum-version constants, version selections, workspace initialization dependencies, and create-analog/Nx templates. Generate and build projects at the minimum and current supported versions.
3. Remove only compiler branches proved unreachable on Angular 20+. Do not remove general Vite compatibility fallbacks or branches still needed for Angular 20/21 differences.
4. Keep the Angular 17–19 CI slots until the matching peer/template/code change lands. Then test Angular 20's supported floor, 21, 22 and the existing next-version qualification. Preserve Vite 6–8 coverage independently.
5. Publish the migration guide and compatibility table together. State the option of staying on Analog 2 rather than forcing a framework upgrade into a patch fix.

The compiler root/lifecycle and Effect work in [analogjs/analog#2520](https://github.com/analogjs/analog/pull/2520) and [analogjs/analog#2521](https://github.com/analogjs/analog/pull/2521) intentionally preserves older versions. Rebase the floor change after those decisions instead of mixing removal into their fixes. Likewise, reconcile starter dependency changes with the existing Vitest, Astro and catalog upgrade PRs.

## Already implemented

[analogjs/analog#2440](https://github.com/analogjs/analog/pull/2440) removed `useAPIMiddleware` and its generated API proxy from alpha. Its continued presence on beta is intentional compatibility. Review the associated issue for closure and migration documentation; no additional removal PR is needed.

## Review and release order

Approve the inventory and support-policy direction first. Review the two small public API removals separately, with migration examples and regression evidence. Land the broader Angular floor only when peer ranges, generated projects and CI agree. Keep runtime correctness fixes targeting beta independent of this breaking-change sequence.

This audit does not propose switching content renderers, redesigning plugin interop, or replacing public Angular APIs with custom abstractions.

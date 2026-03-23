# CommitPlan For Staged Changes

## Summary

The staged diff now spans 70+ files and clearly mixes multiple package concerns. To stay aligned with `CONTRIBUTING.md` and `AGENTS.md`, the branch should be rewritten into focused package-scoped commits before opening the PR. Only after that rewrite does a maintainer-facing `Rebase merge` request become defensible; if the branch remains mixed, `Squash merge` is still the policy-aligned default.

## Proposed Commits

### 1. `build(nx-plugin): switch generated Tailwind setup to @tailwindcss/vite`

Why:
This is the generator-side Tailwind migration. It removes generated PostCSS and `tailwind.config.*` files, updates dependency selection, and injects `@tailwindcss/vite` into the Nx app templates.

Major files:

- `packages/nx-plugin/src/generators/app/lib/add-tailwind-config.ts`
- `packages/nx-plugin/src/generators/app/lib/add-tailwind-helpers.ts`
- `packages/nx-plugin/src/generators/app/versions/nx_18_X/versions.ts`
- `packages/nx-plugin/src/generators/app/versions/tailwind-dependencies.ts`
- `packages/nx-plugin/src/generators/app/generator.spec.ts`
- `packages/nx-plugin/src/generators/app/files/tailwind/v4/.postcssrc.json`
- `packages/nx-plugin/src/generators/app/files/tailwind/v4/tailwind.config.ts__template__`
- `packages/nx-plugin/src/generators/app/files/template-angular/vite.config.ts__template__`
- `packages/nx-plugin/src/generators/app/files/template-angular-v17/vite.config.ts__template__`
- `packages/nx-plugin/src/generators/app/files/template-angular-v18/vite.config.ts__template__`
- `packages/nx-plugin/src/generators/app/files/template-angular-v19/vite.config.ts__template__`
- `apps/docs-app/docs/integrations/angular-material/index.md`
- `apps/docs-app/i18n/es/docusaurus-plugin-content-docs/current/integrations/angular-material/index.md`

### 2. `build(create-analog): scaffold Tailwind v4 through the Vite plugin`

Why:
This is the starter-side counterpart to the Nx generator change. It updates the scaffolder, template package manifests, generated `vite.config.ts` files, and starter tests to use `@tailwindcss/vite` and CSS imports instead of generated PostCSS files.

Major files:

- `packages/create-analog/index.js`
- `packages/create-analog/__tests__/cli.spec.ts`
- `packages/create-analog/template-angular-v17/package.json`
- `packages/create-analog/template-angular-v17/vite.config.ts`
- `packages/create-analog/template-angular-v18/package.json`
- `packages/create-analog/template-angular-v18/vite.config.ts`
- `packages/create-analog/template-angular-v19/package.json`
- `packages/create-analog/template-angular-v19/vite.config.ts`
- `packages/create-analog/template-angular-v20/package.json`
- `packages/create-analog/template-angular-v20/vite.config.ts`
- `packages/create-analog/template-blog/package.json`
- `packages/create-analog/template-blog/vite.config.ts`
- `packages/create-analog/template-latest/package.json`
- `packages/create-analog/template-latest/vite.config.ts`
- `packages/create-analog/template-minimal/package.json`
- `packages/create-analog/template-minimal/vite.config.ts`
- `apps/docs-app/docs/packages/create-analog/overview.md`
- `apps/docs-app/i18n/zh-hans/docusaurus-plugin-content-docs/current/packages/create-analog/overview.md`

### 3. `fix(content): align md4x and content tests with local renderer APIs`

Why:
This keeps `@analogjs/content` working after the dependency and Vite changes by routing md4x internals through local content APIs, updating the Vitest environment expectation, and stabilizing async MDC rendering tests.

Major files:

- `packages/content/md4x/src/lib/md4x-content-renderer.service.ts`
- `packages/content/md4x/src/lib/md4x-content-renderer.service.spec.ts`
- `packages/content/md4x/src/lib/md4x-wasm-content-renderer.service.ts`
- `packages/content/md4x/src/lib/md4x-wasm-content-renderer.service.spec.ts`
- `packages/content/md4x/src/lib/provide-md4x.ts`
- `packages/content/md4x/src/lib/provide-md4x.spec.ts`
- `packages/content/md4x/src/lib/streaming-markdown-renderer.spec.ts`
- `packages/content/mdc/src/lib/mdc-renderer.directive.spec.ts`
- `packages/content/package.json`
- `packages/content/vite.config.ts`
- `packages/content/vite.config.lib.ts`

### 4. `fix(router): preserve redirect-only index routes and blog redirects`

Why:
This is a distinct router behavior fix. It teaches route generation to preserve redirect-only route configs without forcing a component export, and it updates the `blog-app` example and its e2e/static serving setup to exercise that behavior correctly.

Major files:

- `packages/router/src/lib/routes.ts`
- `packages/router/src/lib/routes.spec.ts`
- `packages/router/vite.config.ts`
- `apps/blog-app/src/app/pages/index.page.ts`
- `apps/blog-app/project.json`
- `apps/blog-app-e2e/playwright.config.ts`
- `apps/blog-app/vite.config.ts`

### 5. `fix(storybook-angular): resolve workspace styles and document Tailwind setup`

Why:
This change updates Storybook’s preset to resolve style imports more reliably and adds first-party docs for registering `@tailwindcss/vite` in Storybook’s Vite pipeline.

Major files:

- `packages/storybook-angular/src/lib/preset.ts`
- `packages/storybook-angular/README.md`

### 6. `fix(platform): update Shiki integration and app build output handling`

Why:
This is the runtime/build compatibility slice for `platform` and SSR output behavior: it adapts the Shiki integration to the newer API and makes app/SSR outputs explicitly clean their target directories.

Major files:

- `packages/platform/src/lib/content/shiki/shiki-highlighter.ts`
- `packages/vite-plugin-nitro/src/lib/build-ssr.ts`
- `apps/analog-app/vite.config.ts`
- `apps/analog-app/src/app/app.component.spec.ts`
- `apps/opt-catchall-app/vite.config.ts`

### 7. `build(platform): align workspace configs with the updated toolchain`

Why:
These are supporting compatibility changes needed for the broader upgrade, including bundler resolution in workspace configs, the Astro example refresh, and contributor guidance about `astro-app` rejoining the main build.

Major files:

- `.dagger/tsconfig.json`
- `apps/astro-app/package.json`
- `apps/astro-app/tsconfig.app.json`
- `apps/astro-app/src/components/todos.component.ts`
- `packages/content-plugin/tsconfig.json`
- `packages/nx-plugin/tsconfig.json`
- `packages/vitest-angular-tools/tsconfig.lib.json`
- `tools/tsconfig.tools.json`
- `AGENTS.md`

### 8. `build(platform): refresh workspace dependencies and lockfile`

Why:
This is the version-bump and lockfile sweep that ties the compatibility work together, including the root build script update that stops excluding `astro-app` from the main build.

Major files:

- `package.json`
- `pnpm-lock.yaml`
- `apps/docs-app/package.json`
- `libs/my-package/package.json`
- `packages/platform/package.json`
- `packages/vite-plugin-angular/package.json`
- `packages/vite-plugin-nitro/package.json`
- `packages/vitest-angular/package.json`

## Merge Recommendation

Default recommendation:

- `Squash merge`

Conditional recommendation:

- Ask for `Rebase merge` only if the branch is first rewritten into the eight focused commits above.
- If the branch stays as one mixed compatibility sweep, keep the PR on `Squash merge`.

## Commit Preservation Note

If the branch is rewritten to preserve the commits above, a `Rebase merge` request is reasonable because each commit captures one separately reviewable concern in a larger compatibility sweep:

- Nx generator Tailwind migration
- `create-analog` starter Tailwind migration
- `content` package API and test alignment
- `router` redirect behavior fix plus blog example coverage
- `storybook-angular` preset and documentation update
- `platform` and Nitro build/runtime fixes
- workspace config alignment for the upgraded toolchain
- workspace dependency and lockfile refresh

That history is materially easier to review and bisect than a single cross-package commit.

## Validation Before PR

Run before opening the PR:

- `pnpm i`
- targeted `nx build` and `nx test` commands for `nx-plugin`, `create-analog`, `content`, `router`, `storybook-angular`, and the affected example apps
- `nx format:check`
- `pnpm build`
- `pnpm test`

## Guardrails

- Remove any incidental files from staging before splitting commits if they do not belong to one of the groups above.
- Keep each commit scoped to a single package concern even when it includes supporting docs or example-app coverage.
- Preserve the supported commit types and package scopes from `CONTRIBUTING.md`.

## PR Template Draft

Use this when filling `.github/PULL_REQUEST_TEMPLATE.md` after the branch has been rewritten into the commit plan above.

### Affected scope

- Primary scope: `platform`
- Secondary scopes: `nx-plugin`, `create-analog`, `content`, `router`, `storybook-angular`, `content-plugin`, `vite-plugin-nitro`, `vite-plugin-angular`, `vitest-angular`

### Recommended merge strategy for maintainer

- Preferred by default: `Squash merge`
- If the branch is rewritten into the focused commit sequence in this file: `Rebase merge`

### Commit preservation note

If maintainers accept a non-squash merge, the preserved commits should stay grouped by package concern so the history remains reviewable and bisectable across the broader toolchain compatibility update.

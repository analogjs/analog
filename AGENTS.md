# AGENTS.md

This is the monorepo that contains all the code and infrastructure for AnalogJS.

## Overview

- **Monorepo** managed by [Nx](https://nx.dev) and [pnpm](https://pnpm.io/)
- Main framework: **AnalogJS** (meta-framework for Angular, powered by Vite)
- Contains multiple apps (Angular, Astro, blog, docs, etc.) and libraries (shared, card, top-bar, etc.)
- Key packages: `@analogjs/platform`, `@analogjs/vite-plugin-angular`, `@analogjs/vitest-angular`, `@analogjs/vite-plugin-nitro`, `@analogjs/router`, etc.
- Node engines: `^22.0.0 || ^24.0.0`, pnpm `^10.0.0`

## Key Files

- `tsconfig.base.json` - TypeScript path aliases for all packages
- `nx.json` - Nx workspace configuration
- `pnpm-workspace.yaml` - pnpm workspace definition
- `release.config.ts` - semantic-release configuration
- `.github/workflows/` - CI/CD workflows
- `.githooks/` - git hooks (commit-msg, pre-commit)
- `CONTRIBUTING.md` - full contribution guidelines

## Key Workflows

- **Install dependencies:** `pnpm i`
- **Build all projects:** `pnpm build` (uses Nx)
- **Serve main app:** `pnpm dev` or `pnpm start` (runs `nx serve`)
- **Test all projects:** `pnpm test` (runs Vitest via Nx)
- **Format workspace:** `nx format`
- **Lint:** `nx lint <project>`
- **Check formatting:** `nx format:check`
- **Storybook:** `nx storybook <project>`
- **Docs site:** `pnpm nx serve docs-app` (Docusaurus)
- **E2E:** `nx e2e <project>` (Cypress/Playwright)

## Testing a Specific Package

- `nx test <package-name>` (unit tests via Vitest)
- `nx build <package-name>` to verify build
- For E2E: `pnpm e2e`
- Run `nx format:check` to verify formatting

## Project Structure & Conventions

- **Apps:** in `apps/` (e.g., `analog-app`, `astro-app`, `docs-app`, `blog-app`, etc.)
- **Libraries:** in `packages/` (shared code, features, platform, plugins)
- **TypeScript path aliases:** defined in `tsconfig.base.json`
- **Vite config:** each app has its own `vite.config.ts` (see `apps/analog-app/vite.config.ts` for advanced AnalogJS/Vite usage)
- **Release:** Automated with semantic-release through CI, see `release.config.ts` and `tools/publish.sh`

## Packages

| Directory                            | npm Package                     | Commit Scope          | Purpose                                                                      | Boundary                                                                                                                                     |
| ------------------------------------ | ------------------------------- | --------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/platform`                  | `@analogjs/platform`            | `platform`            | Main Analog meta-framework and default `analog()` facade.                    | Orchestrates Angular, Nitro, routes, content, experiments, and route-generation internals; should remain the build-time integration surface. |
| `packages/router`                    | `@analogjs/router`              | `router`              | Angular-facing file router and runtime routing APIs.                         | Owns route runtime behavior, navigation helpers, and route contracts; should not own Vite/build orchestration or codegen internals.          |
| `packages/content`                   | `@analogjs/content`             | `content`             | Markdown/content rendering, frontmatter, and content resources.              | Owns content-specific behavior and typing; should not become the generic owner of routing or platform concerns.                              |
| `packages/content-plugin`            | `@analogjs/content-plugin`      | `content-plugin`      | Internal helper package for content-related build integration.               | Keep narrowly focused on content build/plugin plumbing; avoid turning it into a second public content API surface.                           |
| `packages/vite-plugin-angular`       | `@analogjs/vite-plugin-angular` | `vite-plugin-angular` | Dedicated Angular-on-Vite integration.                                       | Owns Angular compilation/dev-server/build integration for Vite; should not own Analog routing/content/framework policy.                      |
| `packages/vite-plugin-angular-tools` | n/a                             | n/a                   | Internal helpers for `vite-plugin-angular`.                                  | Keep internal/tooling-scoped; no framework-level authoring APIs here.                                                                        |
| `packages/vite-plugin-nitro`         | `@analogjs/vite-plugin-nitro`   | `vite-plugin-nitro`   | Dedicated Nitro integration for Analog SSR, prerendering, and server routes. | Owns Nitro-facing build/runtime wiring; should not own the public Angular routing model.                                                     |
| `packages/vitest-angular`            | `@analogjs/vitest-angular`      | `vitest-angular`      | Angular + Vitest builder/integration package.                                | Owns test runner integration and setup experience; should not own application runtime concerns.                                              |
| `packages/vitest-angular-tools`      | n/a                             | n/a                   | Internal helpers for `vitest-angular`.                                       | Keep internal and test-tooling-only.                                                                                                         |
| `packages/nx-plugin`                 | `@analogjs/nx-plugin`           | `nx-plugin`           | Nx generators/executors for Analog workflows.                                | Owns workspace tooling and code generation; should not contain framework runtime behavior.                                                   |
| `packages/create-analog`             | `create-analog`                 | `create-analog`       | Scaffolding CLI and starter templates.                                       | Owns project creation and templates only; should not own reusable runtime/framework logic.                                                   |
| `packages/storybook-angular`         | `@analogjs/storybook-angular`   | `storybook-angular`   | Storybook integration for Angular + Vite.                                    | Owns Storybook builder/preset/testing hooks; should not become a general app build layer.                                                    |
| `packages/astro-angular`             | `@analogjs/astro-angular`       | `astro-angular`       | Astro integration for rendering Angular components inside Astro.             | Owns Astro-specific interop; should stay separate from core Analog platform behavior.                                                        |

## Contribution Policy

- Use `CONTRIBUTING.md` as the source of truth for base branch, PR requirements, title and commit conventions, supported types/scopes, breaking change notes, and submission expectations.
- Use `.github/PULL_REQUEST_TEMPLATE.md` for PR body structure, including affected scope, test plan, and maintainer-facing merge-strategy recommendations.

## GitHub Markdown Formatting

When writing PR descriptions, PR comments, or issue references, always use the cross-repository `owner/repo#number` format (e.g., `analogjs/analog#2202`) so links render correctly regardless of context. For maximum clarity, use manual Markdown links with descriptive titles:

- **Preferred:** `[Split content routing into @analogjs/router/content analogjs/analog#2202](https://github.com/analogjs/analog/issues/2202)`
- **Acceptable:** `analogjs/analog#2202`
- **Avoid:** bare `#2202` — this only resolves within the same repository and is ambiguous in forks, external tools, and copied text

## Commit Review Workflow

- Before reviewing branch history, run `git fetch --all`.
- Treat `https://github.com/analogjs/analog.git` as the upstream source of truth and compare the current branch against the relevant `analogjs/*` remote branch.
- If the branch mixes multiple packages or concerns, recommend `git reset --soft <base-commit>` and re-commit the staged changes into smaller, policy-aligned groups.
- Prefer regrouping by affected package or primary package scope using the directory mapping above.
- Before changing GitHub metadata, ask whether the user wants the PR title and description updated. If no PR exists for the branch, ask whether they want one created.
- Treat `Squash merge` as the highly preferred maintainer recommendation.
- Recommend a non-squash merge only when the PR intentionally preserves important commit boundaries, and include a brief note about why those boundaries matter and why the PR should bypass focused changes per package.
- If history is rewritten, remind the user that they can run `git push --force`, but do not do it on their behalf unless they explicitly ask.

## Nx Usage

- **Nx is the orchestrator for builds, tests, linting, and generators.**
- Use `nx run-many --target <target> --all` for bulk operations.
- Project-specific config in `apps/*/project.json` and `libs/*/project.json`.
- Nx plugins and generators are in `packages/nx-plugin`.

## Caching

Nx task caching is **enabled by default** for all targets. Disable it selectively with `"cache": false` in a target's `project.json` only when the output location makes caching unreliable (e.g., outputs inside `node_modules/`). Prefer outputting to `dist/` so Nx can reliably cache and restore build artifacts.

When adding a new build target that writes into `node_modules/`, set `"cache": false` to avoid stale cache hits in CI (Dagger mounts a persistent Nx cache volume while `node_modules/` is rebuilt each run).

Projects with caching explicitly disabled (`"cache": false` on their build target):

- `router` — outputs to `node_modules/@analogjs/router`
- `content` — outputs to `node_modules/@analogjs/content`
- `my-package` — explicitly opted out of build caching

## Contribution Patterns & Best Practices

- Always open an issue before a pull request for review by the maintainers. This ensures alignment on implementation of features.
- Keep changes minimal and targeted.
- Backward compatibility is critical for new features, allowing progressive adoption.
- Keep code concise with emphasis on readability, avoid clever solutions and abstractions.
- Always scan existing codebase for examples and patterns for implementation.
- When writing code, analyze all touched code paths up front, including Analog experimental Vite options, their disabled branches, and compatibility fallbacks. Do not treat experimental features as exempt from behavioral review, regression analysis, or targeted tests.
- Prefer using existing Angular APIs, with wrappers where needed.
- Always use modern Angular syntax including dependency injection with inject, control flow, signal APIs, and standalone components.
- Cross compatibility with Nx is strongly encouraged. Prefer schematics and builders for Analog first-party solutions.
- Avoid custom code that replicates Angular framework functionality.
- Don't be overly verbose with comments.
- Keep tests lightweight and targeted to critical functionality testing.
- Add concise documentation with descriptive sections to the appropriate guides in the `docs-app` app.
- Maintain compatibility with Vite versions 6-8, with progressive fallbacks.
- Use other projects as inspiration, but do not directly copy their APIs.
- See `CONTRIBUTING.md` file for more contribution guidelines.

## Do NOT

- Add Angular SFC references to features or docs
- Reference or recommend `.agx` files — they are a removed experiment and no longer supported
- Create new abstractions for one-time operations
- Add verbose comments, docstrings, or type annotations to code you didn't change
- Add error handling or validation for scenarios that can't happen
- Design for hypothetical future requirements
- Inline code from npm packages, preserving OSS dependencies

## Common Pitfalls

- Always run `pnpm i` before building if `pnpm-lock.yaml` has changed
- Git hooks are in `.githooks/` (not `.husky/`), configured via `git config core.hookspath .githooks`
- The `prepare` script sets up git hooks — runs automatically after `pnpm i`

## CI Failure Debugging

When a PR has failing GitHub Actions checks, use this workflow to diagnose and fix:

1. **Find the failed run** — given a PR URL (e.g., `https://github.com/analogjs/analog/pull/NUMBER`), fetch the PR checks page to identify failing workflow runs and their run IDs:
   - WebFetch `https://github.com/analogjs/analog/pull/NUMBER/checks` to find run IDs
   - WebFetch `https://github.com/analogjs/analog/actions/runs/RUN_ID` to list job names and statuses
   - WebFetch `https://github.com/analogjs/analog/actions/runs/RUN_ID/job/JOB_ID` to get error details from a specific failed job

2. **Reproduce locally** — run the failing target locally to get full error output:
   - Lint: `pnpm nx run-many -t lint`
   - Unit tests: `pnpm nx run-many -t test` or `pnpm nx run <project>:test` for a specific project
   - Build: `pnpm nx run-many -t build`
   - E2E: `pnpm nx run <project>:e2e`

3. **Fix and verify** — after fixing, re-run the specific failing targets locally before pushing.

## Integration Points

- **Vite**: All apps use Vite for build/dev, with custom plugins for Angular and Nitro
- **Nitro**: Used for SSR, SSG, and API routes (see `vite.config.ts` and `server.mjs`)
- **Docusaurus**: Docs site in `apps/docs-app`
- **Storybook**: For Angular components, see `@analogjs/storybook-angular`
- **CI/CD**: Release and publish via semantic-release and custom scripts

## Examples

- **Add a new Angular app:** `nx g @nx/angular:application <name>`
- **Run tests for a lib:** `nx test <lib-name>`
- **Build docs site:** `pnpm nx build docs-app`

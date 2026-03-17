# AGENTS.md

This is the monorepo that contains all the code and infrastructure for AnalogJS.

## Overview

- **Monorepo** managed by [Nx](https://nx.dev) and [pnpm](https://pnpm.io/)
- Main framework: **AnalogJS** (meta-framework for Angular, powered by Vite)
- Contains multiple apps (Angular, Astro, blog, docs, trpc, etc.) and libraries (shared, card, top-bar, etc.)
- Key packages: `@analogjs/platform`, `@analogjs/vite-plugin-angular`, `@analogjs/vitest-angular`, `@analogjs/vite-plugin-nitro`, `@analogjs/router`, etc.
- Node engines: `^20.0.0 || ^22.0.0`, pnpm `^10.0.0`

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
- **Lint:** `nx lint <project>`
- **Check formatting:** `pnpm prettier:check`
- **Storybook:** `nx storybook <project>`
- **Docs site:** `pnpm nx serve docs-app` (Docusaurus)
- **E2E:** `nx e2e <project>` (Cypress/Playwright)

## Testing a Specific Package

- `nx test <package-name>` (unit tests via Vitest)
- `nx build <package-name>` to verify build
- For E2E: `nx e2e create-analog-e2e` or `nx e2e analog-app-e2e-cypress`
- Run `pnpm prettier:check` to verify formatting
- Always validate existing tests and builds pass before submitting changes

## Project Structure & Conventions

- **Apps:** in `apps/` (e.g., `analog-app`, `astro-app`, `docs-app`, `blog-app`, etc.)
- **Libraries:** in `packages/` (shared code, features, platform, plugins)
- **TypeScript path aliases:** defined in `tsconfig.base.json`
- **Vite config:** each app has its own `vite.config.ts` (see `apps/analog-app/vite.config.ts` for advanced AnalogJS/Vite usage)
- **Release:** Automated with semantic-release through CI, see `release.config.ts` and `tools/publish.sh`

## Packages → Commit Scopes

| Directory                      | npm Package                     | Commit Scope          |
| ------------------------------ | ------------------------------- | --------------------- |
| `packages/platform`            | `@analogjs/platform`            | `platform`            |
| `packages/router`              | `@analogjs/router`              | `router`              |
| `packages/content`             | `@analogjs/content`             | `content`             |
| `packages/content-plugin`      | `@analogjs/content-plugin`      | `content-plugin`      |
| `packages/vite-plugin-angular` | `@analogjs/vite-plugin-angular` | `vite-plugin-angular` |
| `packages/vite-plugin-nitro`   | `@analogjs/vite-plugin-nitro`   | `vite-plugin-nitro`   |
| `packages/vitest-angular`      | `@analogjs/vitest-angular`      | `vitest-angular`      |
| `packages/nx-plugin`           | `@analogjs/nx-plugin`           | `nx-plugin`           |
| `packages/create-analog`       | `create-analog`                 | `create-analog`       |
| `packages/storybook-angular`   | `@analogjs/storybook-angular`   | `storybook-angular`   |
| `packages/trpc`                | `@analogjs/trpc`                | `trpc`                |
| `packages/astro-angular`       | `@analogjs/astro-angular`       | `astro-angular`       |

## Branch Strategy

- Base branch: `beta`
- PRs should be rebased against `beta`
- Conventional Commits required for PR titles (e.g., `feat(platform): add new feature`)
- Commit types: `feat`, `fix`, `docs`, `build`, `ci`, `perf`, `refactor`, `style`, `test`

## Nx Usage

- **Nx is the orchestrator for builds, tests, linting, and generators.**
- Use `nx run-many --target <target> --all` for bulk operations.
- Project-specific config in `apps/*/project.json` and `libs/*/project.json`.
- Nx plugins and generators are in `packages/nx-plugin`.

## Contribution Patterns & Best Practices

- Keep changes minimal and targeted.
- Backward compatibility is critical for new features, allowing progressive adoption.
- Only make changes to one package/app at a time unless absolutely necessary.
- Keep code concise with emphasis on readability, avoid clever solutions and abstractions.
- Always scan existing codebase for examples and patterns for implementation.
- Prefer using existing Angular APIs, with wrappers where needed.
- Avoid custom code that replicates Angular framework functionality.
- Don't be overly verbose with comments.
- Keep tests lightweight and targeted to critical functionality testing.
- Add concise documentation with descriptive sections to the appropriate guides in the `docs-app` app.
- See `CONTRIBUTING.md` file for more contribution guidelines.

## Do NOT

- Add Angular SFC references to features or docs
- Create new abstractions for one-time operations
- Modify multiple packages in a single PR unless necessary
- Add verbose comments, docstrings, or type annotations to code you didn't change
- Skip running existing tests before submitting changes
- Add error handling or validation for scenarios that can't happen
- Design for hypothetical future requirements

## Common Pitfalls

- Always run `pnpm i` before building if `pnpm-lock.yaml` has changed
- The `astro-app` is excluded from the main build (`--exclude=astro-app`)
- Git hooks are in `.githooks/` (not `.husky/`), configured via `git config core.hookspath .githooks`
- The `prepare` script sets up git hooks — runs automatically after `pnpm i`

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

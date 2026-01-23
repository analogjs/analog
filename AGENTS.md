# AGENTS.md

This is the monorepo that contains all the code and infrastructure for AnalogJS.

## Overview

- **Monorepo** managed by [Nx](https://nx.dev) and [pnpm](https://pnpm.io/)
- Main framework: **AnalogJS** (meta-framework for Angular, powered by Vite)
- Contains multiple apps (Angular, Astro, blog, docs, trpc, etc.) and libraries (shared, card, top-bar, etc.)
- Key packages: `@analogjs/platform`, `@analogjs/vite-plugin-angular`, `@analogjs/vitest-angular`, `@analogjs/vite-plugin-nitro`, `@analogjs/router`, etc.

## Key Workflows

- **Install dependencies:** `pnpm i`
- **Build all projects:** `pnpm build` (uses Nx)
- **Serve main app:** `pnpm dev` or `pnpm start` (runs `nx serve`)
- **Test all projects:** `pnpm test` (runs Vitest via Nx)
- **Lint:** `nx lint <project>`
- **Storybook:** `nx storybook <project>`
- **Docs site:** `pnpm nx serve docs-app` (Docusaurus)
- **E2E:** `nx e2e <project>` (Cypress/Playwright)

## Project Structure & Conventions

- **Apps:** in `apps/` (e.g., `analog-app`, `astro-app`, `docs-app`, `blog-app`, etc.)
- **Libraries:** in `packages/` (shared code, features, platform, plugins)
- **TypeScript path aliases:** defined in `tsconfig.base.json`
- **Vite config:** each app has its own `vite.config.ts` (see `apps/analog-app/vite.config.ts` for advanced AnalogJS/Vite usage)
- **Release:** Automated with semantic-release through CI, see `release.config.cjs` and `tools/publish.sh`

## Nx Usage

- **Nx is the orchestrator for builds, tests, linting, and generators.**
- Use `nx run-many --target <target> --all` for bulk operations.
- Project-specific config in `apps/*/project.json` and `libs/*/project.json`.
- Nx plugins and generators are in `packages/nx-plugin`.

## Contribution Patterns & Best Practices

- Keep changes minimal and targeted.
- Backward compatibility is critical for new features, allowing progressive adoption.
- Only make changes to one package/app at a time unless absolutely necessary.
- Keep code concise with emphasis on readibility, avoid clever solutions and abstractions.
- Always scan existing codebase for examples and patterns for implementation.
- Prefer using existing Angular APIs, with wrappers where needed.
- Avoid custom code that replicates Angular framework functionality.
- Don't be overly verbose with comments.
- Keep tests lightweight and targeted to critical functionality testing.
- Always validate existing tests and builds pass.
- Add concise documentation with descriptive sections to the appropriate guides in the `docs-app` app.
- Never mention Analog SFCs for new features or documentation.
- Conventional Commits for commit messages, with scope matching package name (see `CONTRIBUTING.md`)
- See `CONTRIBUTING.md` file for more contribution guidelines.

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

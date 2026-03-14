# ESLint → Oxlint Migration

> This could have been split into two PRs: (1) basic oxlint migration without type-aware rules, then (2) type-aware linting + the TypeScript v6 upgrade. Chose to do both in one PR since neither change introduces instability. Oxlint rule categories are set to `"warn"` severity to minimize non-config code changes and keep the PR small.

## Strategy

Migrate the monorepo from ESLint to oxlint as the primary JS/TS linter, using oxlint's [nested config](https://oxc.rs/docs/guide/usage/linter/nested-config) support to replicate per-project ESLint configurations. Where oxlint can't cover a capability, either replace it with a standalone tool or keep a minimal ESLint config.

**What changed:**

1. **Root `.oxlintrc.json`** — base config with shared rules, categories, and plugins (`typescript`, `vitest`, `import`)
2. **17 nested `.oxlintrc.json` files** — per-project configs that `extends` root and add `jsPlugins` + rule overrides (Angular selectors, Storybook, Cypress)
3. **22 `eslint.config.mjs` files deleted** — fully replaced by oxlint
4. **4 `eslint.config.mjs` files kept** — 1 root (ignores-only base) + 3 trimmed to HTML template linting only (the one thing oxlint can't do yet)
5. **`tools/validate-plugin-json.mts`** — standalone script replacing `@nx/nx-plugin-checks` for Nx plugin metadata validation
6. **`tools/check-module-boundaries.mts`** — standalone script replacing `@nx/enforce-module-boundaries` using Nx project graph
7. **`tools/check-dependency-accuracy.mts`** — standalone script replacing `@nx/dependency-checks` for package.json accuracy

## TypeScript Migration

Oxlint's type-aware linting requires `tsconfig.json` files that are compatible with TypeScript v6 path resolution. Used [`@andrewbranch/ts5to6`](https://github.com/andrewbranch/ts5to6) to automate the bulk of the migration:

```bash
pnpx @andrewbranch/ts5to6 --fixBaseUrl tsconfig.base.json
pnpx @andrewbranch/ts5to6 --fixRootDir tsconfig.base.json
```

**What the tool changed:**

- **Removed `baseUrl`** from `tsconfig.base.json` — bare path aliases (e.g. `"packages/router/src/index.ts"`) became `"./"`-prefixed relative paths
- **Added `rootDir`** to project tsconfigs that relied on the implicit `baseUrl`-derived root (e.g. `apps/astro-app/tsconfig.app.json`, `create-analog` templates)
- **Rebased relative `paths`** in nested tsconfigs — `"./node_modules/..."` became `"../../node_modules/..."` since they no longer resolve from `baseUrl`

**Manual fixups:**

- Added `"ignoreDeprecations": "6.0"` to `tsconfig.base.json` — suppresses TS6 deprecation warnings for options the monorepo still needs (e.g. `skipDefaultLibCheck`)
- Added `angularCompilerOptions.disableTypeScriptVersionCheck: true` to `tsconfig.base.json` — Angular's compiler hasn't formally added TypeScript v6 support yet, so this flag suppresses the unsupported version error
- Added `"baseUrl": "."` to all `@nx/js:tsc`-built package tsconfigs. The executor generates a temp tsconfig with non-relative path mappings (e.g. `node_modules/...` without `./`), which TS6 rejects with `TS5090` when `baseUrl` is not set.
- Added `@types/semver` back to devDependencies — was dropped during migration but required by `nx-plugin`
- Fixed strict null check errors across `nx-plugin` generators — TS6 defaults `strictNullChecks: true`; added guards, type narrowing, and proper typing instead of suppressing checks
- Fixed `context.target` null checks in `vite-plugin-angular-tools` builders — added guards for the possibly-undefined builder context target

**Known build exceptions (pre-existing, not caused by this migration):**

- **vitest-angular**: `TS2578` unused `@ts-expect-error` directives in `setup-zone.ts` — suppression comments are no longer needed with TS6
- **storybook-angular**: `TS7016`/`TS2307` missing type declarations for `@storybook/angular` subpath exports and unresolved `@analogjs/vite-plugin-angular` types in `preset.ts`. A manual `storybook-angular.d.ts` declaration file is added to fill the gap.

## ESLint Config Disposition

| ESLint Config                       | Action                       | Reason                                             |
| ----------------------------------- | ---------------------------- | -------------------------------------------------- |
| `/eslint.config.mjs` (root)         | Trimmed to ignores-only base | All JS/TS rules ported to oxlint                   |
| `apps/analog-app/eslint.config.mjs` | Trimmed to HTML only         | 2 `.html` files need `plugin:@nx/angular-template` |
| `libs/card/eslint.config.mjs`       | Trimmed to HTML only         | 3 `.html` files need `plugin:@nx/angular-template` |
| `libs/top-bar/eslint.config.mjs`    | Trimmed to HTML only         | 1 `.html` file needs `plugin:@nx/angular-template` |
| All other 22 `eslint.config.mjs`    | **Deleted**                  | Fully replaced by oxlint nested configs            |

## Oxlint Nested Config Coverage

| Directory                      | jsPlugins                                                  | Selector Prefix                | Extra Rules                                          |
| ------------------------------ | ---------------------------------------------------------- | ------------------------------ | ---------------------------------------------------- |
| `/` (root)                     | —                                                          | —                              | Base correctness/style/perf + vitest test rules      |
| `apps/analog-app`              | `@angular-eslint`, `@angular-eslint/template`, `storybook` | `analogjs`, `app`, `storybook` | `prefer-standalone: off`, Storybook stories override |
| `apps/trpc-app`                | `@angular-eslint`                                          | `trpcApp` / `trpc-app`         | `prefer-standalone: off`                             |
| `apps/analog-app-e2e-cypress`  | `cypress`                                                  | —                              | `no-unnecessary-waiting`, `unsafe-to-chain-command`  |
| `apps/blog-app-e2e-cypress`    | `cypress`                                                  | —                              | Same as above                                        |
| `packages/content`             | `@angular-eslint`                                          | `analog`                       | `prefer-standalone: off`                             |
| `packages/router`              | `@angular-eslint`                                          | `analogjs`                     | `prefer-standalone: off`                             |
| `packages/trpc`                | `@angular-eslint`                                          | `analogjs`                     | `prefer-standalone: off`                             |
| `packages/vite-plugin-angular` | `@angular-eslint`                                          | —                              | `prefer-standalone: off`                             |
| `packages/astro-angular`       | `@angular-eslint`                                          | —                              | `prefer-standalone: off`                             |
| `packages/platform`            | `@angular-eslint`                                          | —                              | `prefer-standalone: off`                             |
| `packages/storybook-angular`   | `@angular-eslint`                                          | —                              | `prefer-standalone: off`                             |
| `libs/card`                    | `@angular-eslint`                                          | `lib`                          | `prefer-standalone: off`                             |
| `libs/my-package`              | `@angular-eslint`                                          | `lib`                          | `prefer-standalone: off`                             |
| `libs/shared/feature`          | `@angular-eslint`                                          | `lib`                          | `prefer-standalone: off`                             |
| `libs/top-bar`                 | `@angular-eslint`                                          | `analogjs`                     | `prefer-standalone: off`                             |
| `tests/vitest-angular`         | `@angular-eslint`                                          | `lib`                          |                                                      |

8 directories have no nested `.oxlintrc.json` — they inherit the root config automatically (base-only projects or projects whose only ESLint rules were NX-specific and dropped).

## NX Rule Replacements

| ESLint Rule                     | Replacement                                                                                                                                                                      |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@nx/nx-plugin-checks`          | `pnpm lint:json` — `tools/validate-plugin-json.mts` validates generators/executors/builders/migrations JSON structure and file references                                        |
| `@nx/enforce-module-boundaries` | `pnpm lint:boundaries` — `tools/check-module-boundaries.mts` uses Nx project graph to check circular deps, cross-project boundary violations, and library-imports-app violations |
| `@nx/dependency-checks`         | `pnpm lint:deps` — `tools/check-dependency-accuracy.mts` scans source imports vs package.json to find missing and obsolete dependencies                                          |

## Angular Support

| Feature                                        | Status                                                                                                                                                                               |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@angular-eslint/component-selector`           | Ported to oxlint (10 projects)                                                                                                                                                       |
| `@angular-eslint/directive-selector`           | Ported to oxlint (10 projects)                                                                                                                                                       |
| `@angular-eslint/prefer-standalone`            | Ported to oxlint (13 projects, off)                                                                                                                                                  |
| `@angular-eslint/no-output-on-prefix`          | Ported to oxlint (analog-app stories)                                                                                                                                                |
| `@angular-eslint/template/prefer-control-flow` | Ported to oxlint (analog-app stories)                                                                                                                                                |
| `@typescript-eslint/consistent-type-imports`   | Ported to oxlint (analog-app stories)                                                                                                                                                |
| Inline template processing                     | Ported via `@angular-eslint/template` jsPlugin                                                                                                                                       |
| HTML template linting (`*.html`)               | **Stays in ESLint** — oxlint can't process HTML files yet ([jsPlugins limitation](https://oxc.rs/docs/guide/usage/linter/js-plugins.html)). Only 3 projects affected (6 files total) |

## Lint Commands

| Command                | What it does                                                                       |
| ---------------------- | ---------------------------------------------------------------------------------- |
| `pnpm lint`            | Oxlint — all JS/TS linting (standard rules)                                        |
| `pnpm lint:typeaware`  | Oxlint — type-aware rules (CI only, requires `tsconfig.json`)                      |
| `pnpm lint:json`       | Validate Nx plugin JSON metadata files                                             |
| `pnpm lint:boundaries` | Check module boundaries — circular deps, cross-project imports, lib→app violations |
| `pnpm lint:deps`       | Check package.json dependency accuracy — missing and obsolete deps                 |
| `pnpm eslint`          | Angular HTML template linting only (3 projects)                                    |

## Implementation Notes

- **Nested config discovery** is automatic — oxlint walks up from each linted file to find the nearest `.oxlintrc.json`
- **`extends`** is used so nested configs inherit root's plugins, categories, rules, and overrides
- **`jsPlugins`** must be declared in each nested config that needs them (not inherited via `extends`)
- **`typeAware`** is omitted from config files (oxlint only allows it in the root config, which breaks `extends`). Instead, type-aware linting is enabled via `oxlint --type-aware .` in CI
- **`--print-config`** does NOT reflect nested config resolution, but nested configs work correctly during actual linting
- The 4 remaining ESLint configs can be deleted once oxlint adds [custom file format/parser support](https://oxc.rs/docs/guide/usage/linter/js-plugins.html)

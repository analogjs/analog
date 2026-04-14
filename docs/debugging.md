# Debugging

This document is for maintainers and contributors working inside the Analog monorepo.

For consumer-facing debug flags and scope reference, see the public guide in `apps/docs-app/docs/guides/debugging.md`.

This repo-local file covers the monorepo-specific workflow that does not belong in the public docs site.

## Repo Root Commands

From this workspace, the common debug flow is to run commands from the repo root with `pnpm` or `pnpm nx`.

```bash
# Serve the default dev app with all Analog scopes
DEBUG=analog:* pnpm dev

# Build from the repo root with selected scopes
DEBUG=analog:platform:routes,analog:angular:compiler pnpm build

# Serve a specific app target through Nx
DEBUG=analog:platform:* pnpm nx serve docs-app
```

## Package Development

When debugging package changes in this monorepo, prefer the project-level Nx targets so you stay on the same workspace graph and dependency layout as CI:

```bash
# Focus on Angular plugin HMR/style behavior
DEBUG=analog:angular:hmr,analog:angular:styles pnpm nx test vite-plugin-angular

# Focus on platform routing output
DEBUG=analog:platform:routes pnpm nx build platform

# Focus on the style-pipeline integration seam in a served app
DEBUG=analog:platform:style-pipeline,analog:angular:style-pipeline pnpm nx serve your-app
```

## Debugging a local Analog checkout from another pnpm workspace

If you want to debug this checkout while serving a different app on your machine,
point that consumer workspace at the built Analog package outputs under
`/path/to/analog/packages/*/dist`.

Use the built `dist` directories, not the raw package roots. Build the packages
first so each `dist` folder contains its generated `package.json`. The source
package manifests still contain `catalog:` and `workspace:*` references that are
only rewritten during Analog's release-style build pipeline.

### Local checkout example

`pnpm-workspace.yaml`

```yaml
packages:
  - 'apps/*'
  - 'libs/**'

overrides:
  '@analogjs/platform': file:/path/to/analog/packages/platform/dist
  '@analogjs/router': file:/path/to/analog/packages/router/dist
  '@analogjs/vite-plugin-angular': file:/path/to/analog/packages/vite-plugin-angular/dist
  '@analogjs/vite-plugin-nitro': file:/path/to/analog/packages/vite-plugin-nitro/dist
  '@analogjs/vitest-angular': file:/path/to/analog/packages/vitest-angular/dist
```

Root `package.json`

```json
{
  "dependencies": {
    "@analogjs/platform": "file:/path/to/analog/packages/platform/dist"
  },
  "overrides": {
    "@analogjs/platform": "file:/path/to/analog/packages/platform/dist",
    "@analogjs/router": "file:/path/to/analog/packages/router/dist",
    "@analogjs/vite-plugin-angular": "file:/path/to/analog/packages/vite-plugin-angular/dist",
    "@analogjs/vite-plugin-nitro": "file:/path/to/analog/packages/vite-plugin-nitro/dist",
    "@analogjs/vitest-angular": "file:/path/to/analog/packages/vitest-angular/dist"
  }
}
```

:::important
Keep the overrides in both places. If you only pin `@analogjs/platform`, pnpm
can still resolve transitive packages like `@analogjs/vite-plugin-angular` and
`@analogjs/vite-plugin-nitro` from npm instead of your local checkout.
:::

:::note
pnpm currently does not allow `file:` entries in `catalog`, so local checkout
wiring needs direct `file:` overrides instead of `catalog:` indirection.
:::

If your app also uses other published Analog packages such as
`@analogjs/content` or `@analogjs/storybook-angular`, pin those the same way.

### GitHub branch example

If you want the same pattern from a GitHub branch instead of a local path, pnpm
supports Git subdirectory specs via `#branch&path:...`.

`pnpm-workspace.yaml`

```yaml
catalog:
  '@analogjs/platform': github:your-user/analog#your-branch&path:packages/platform/dist
  '@analogjs/router': github:your-user/analog#your-branch&path:packages/router/dist
  '@analogjs/vite-plugin-angular': github:your-user/analog#your-branch&path:packages/vite-plugin-angular/dist
  '@analogjs/vite-plugin-nitro': github:your-user/analog#your-branch&path:packages/vite-plugin-nitro/dist
  '@analogjs/vitest-angular': github:your-user/analog#your-branch&path:packages/vitest-angular/dist
```

Root `package.json`

```json
{
  "dependencies": {
    "@analogjs/platform": "catalog:"
  },
  "overrides": {
    "@analogjs/platform": "$@analogjs/platform",
    "@analogjs/router": "$@analogjs/router",
    "@analogjs/vite-plugin-angular": "$@analogjs/vite-plugin-angular",
    "@analogjs/vite-plugin-nitro": "$@analogjs/vite-plugin-nitro",
    "@analogjs/vitest-angular": "$@analogjs/vitest-angular"
  }
}
```

:::caution
For Analog, the GitHub form only works when the branch exposes release-ready
`dist/package.json` files at those paths. Pointing pnpm at
`path:packages/platform` or any other raw source package path will fail because
those manifests still contain unresolved `catalog:` and `workspace:*`
specifiers.
:::

## Notes

- Use the repo root unless you have a specific reason to run inside a package subdirectory.
- Prefer `pnpm nx <target>` when you want task-graph behavior that matches CI.
- The scope names themselves are documented in the public guide so consumer and maintainer docs stay aligned.

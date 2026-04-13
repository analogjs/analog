---
sidebar_position: 4
---

# Debugging

Analog includes structured debug logging powered by [obug](https://www.npmjs.com/package/obug). Debug output can be enabled through the `debug` option in your Vite config or via the `DEBUG` environment variable.

## Enabling Debug Output

### All scopes, both build and dev

The simplest forms enable all scopes for both `build` and `dev` commands. Omitting `mode` always means both.

```ts
// vite.config.ts
import analog from '@analogjs/platform';

export default defineConfig({
  plugins: [
    analog({
      debug: true,
    }),
  ],
});
```

The object form without `mode` is equivalent:

```ts
analog({
  debug: { scopes: true },
});
```

### Specific scopes, both build and dev

```ts
analog({
  debug: ['analog:platform:routes', 'analog:angular:compiler'],
});

// Object form equivalent — omitting mode means both
analog({
  debug: { scopes: ['analog:platform:routes', 'analog:angular:compiler'] },
});
```

### Restrict to build or dev only

Use the `mode` option to restrict debug output to a single Vite command:

```ts
// All scopes, only during development
analog({
  debug: { mode: 'dev' },
});

// All scopes, only during builds
analog({
  debug: { mode: 'build' },
});

// Specific scopes, only during development
analog({
  debug: {
    scopes: ['analog:angular:hmr', 'analog:angular:styles'],
    mode: 'dev',
  },
});

// Specific scopes, only during builds
analog({
  debug: {
    scopes: ['analog:platform:typed-router'],
    mode: 'build',
  },
});
```

### Different scopes per command

Use an array of objects to enable different scopes for build and dev simultaneously:

```ts
analog({
  debug: [
    { scopes: ['analog:angular:hmr', 'analog:angular:styles'], mode: 'dev' },
    { scopes: ['analog:platform:typed-router'], mode: 'build' },
  ],
});
```

You can mix immediate and deferred entries — entries without `mode` enable immediately for both commands:

```ts
analog({
  debug: [
    { scopes: ['analog:platform'] }, // both commands
    { scopes: ['analog:angular:hmr'], mode: 'dev' }, // dev only
    { scopes: ['analog:platform:typed-router'], mode: 'build' }, // build only
  ],
});
```

:::tip
To enable debug output for **both** build and dev, simply omit `mode`. Any form without `mode` — `true`, a `string[]`, or `{ scopes }` — outputs in both commands.
:::

### Environment variable

The `DEBUG` environment variable works independently of the config option and is always active regardless of `mode`:

```bash
# All Analog scopes
DEBUG=analog:* pnpm dev

# Specific scopes
DEBUG=analog:platform:routes,analog:angular:compiler pnpm build

# All platform scopes
DEBUG=analog:platform:* pnpm dev
```

## Debugging a local Analog checkout from another pnpm workspace

If you want to debug Analog while serving a different app on your machine, point that consumer workspace at the built Analog package outputs under `/Volumes/Development/analog/packages/*/dist`.

Use the built `dist` directories, not the raw package roots. Build the packages first so each `dist` folder contains its generated `package.json`. The source package manifests still contain `catalog:` and `workspace:*` references that are only rewritten during Analog's release-style build pipeline.

### Local checkout example

`pnpm-workspace.yaml`

```yaml
packages:
  - 'apps/*'
  - 'libs/**'

overrides:
  '@analogjs/platform': file:/Volumes/Development/analog/packages/platform/dist
  '@analogjs/router': file:/Volumes/Development/analog/packages/router/dist
  '@analogjs/vite-plugin-angular': file:/Volumes/Development/analog/packages/vite-plugin-angular/dist
  '@analogjs/vite-plugin-nitro': file:/Volumes/Development/analog/packages/vite-plugin-nitro/dist
  '@analogjs/vitest-angular': file:/Volumes/Development/analog/packages/vitest-angular/dist
```

Root `package.json`

```json
{
  "dependencies": {
    "@analogjs/platform": "file:/Volumes/Development/analog/packages/platform/dist"
  },
  "overrides": {
    "@analogjs/platform": "file:/Volumes/Development/analog/packages/platform/dist",
    "@analogjs/router": "file:/Volumes/Development/analog/packages/router/dist",
    "@analogjs/vite-plugin-angular": "file:/Volumes/Development/analog/packages/vite-plugin-angular/dist",
    "@analogjs/vite-plugin-nitro": "file:/Volumes/Development/analog/packages/vite-plugin-nitro/dist",
    "@analogjs/vitest-angular": "file:/Volumes/Development/analog/packages/vitest-angular/dist"
  }
}
```

:::important
Keep the overrides in both places. If you only pin `@analogjs/platform`, pnpm will still resolve transitive packages like `@analogjs/vite-plugin-angular` and `@analogjs/vite-plugin-nitro` from npm instead of your local checkout.
:::

:::note
pnpm currently does not allow `file:` entries in `catalog`, so local checkout wiring needs direct `file:` overrides instead of `catalog:` indirection.
:::

If your app also uses other published Analog packages such as `@analogjs/content` or `@analogjs/storybook-angular`, pin those the same way.

### GitHub branch example

If you want the same pattern from a GitHub branch instead of a local path, pnpm supports Git subdirectory specs via `#branch&path:...`.

`pnpm-workspace.yaml`

```yaml
catalog:
  '@analogjs/platform': github:benpsnyder/analog#feat/support-snyder-internal&path:packages/platform/dist
  '@analogjs/router': github:benpsnyder/analog#feat/support-snyder-internal&path:packages/router/dist
  '@analogjs/vite-plugin-angular': github:benpsnyder/analog#feat/support-snyder-internal&path:packages/vite-plugin-angular/dist
  '@analogjs/vite-plugin-nitro': github:benpsnyder/analog#feat/support-snyder-internal&path:packages/vite-plugin-nitro/dist
  '@analogjs/vitest-angular': github:benpsnyder/analog#feat/support-snyder-internal&path:packages/vitest-angular/dist
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
For Analog, the GitHub form only works when the branch exposes release-ready `dist/package.json` files at those paths. Pointing pnpm at `path:packages/platform` or any other raw source package path will fail because those manifests still contain unresolved `catalog:` and `workspace:*` specifiers.
:::

## Configuration Reference

| Form                                             | Scopes    | When                  |
| ------------------------------------------------ | --------- | --------------------- |
| `true`                                           | All       | Both build and dev    |
| `['scope1', 'scope2']`                           | Listed    | Both build and dev    |
| `{ scopes: true }`                               | All       | Both build and dev    |
| `{ scopes: ['scope1'] }`                         | Listed    | Both build and dev    |
| `{ mode: 'dev' }`                                | All       | Dev only              |
| `{ mode: 'build' }`                              | All       | Build only            |
| `{ scopes: ['scope1'], mode: 'dev' }`            | Listed    | Dev only              |
| `{ scopes: ['scope1'], mode: 'build' }`          | Listed    | Build only            |
| `[{ ..., mode: 'dev' }, { ..., mode: 'build' }]` | Per-entry | Split across commands |

## Available Scopes

### `@analogjs/platform`

| Scope                            | Area                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------- |
| `analog:platform`                | Platform plugin initialization, experimental option resolution, dependency transform config |
| `analog:platform:routes`         | Route discovery and resolution                                                              |
| `analog:platform:content`        | Content pipeline                                                                            |
| `analog:platform:typed-router`   | Typed route generation, file discovery, collisions, watch-mode regeneration                 |
| `analog:platform:tailwind`       | Tailwind CSS `@reference` injection in component styles                                     |
| `analog:platform:style-pipeline` | Community style-pipeline plugin registration and platform-level integration                 |

### `@analogjs/vite-plugin-angular`

| Scope                            | Area                                                                                     |
| -------------------------------- | ---------------------------------------------------------------------------------------- |
| `analog:angular:hmr`             | Hot Module Replacement lifecycle, component updates, middleware                          |
| `analog:angular:styles`          | Stylesheet processing, externalization, encapsulation                                    |
| `analog:angular:compiler`        | TypeScript compilation, compiler options                                                 |
| `analog:angular:compilation-api` | Experimental Angular Compilation API path selection, version checks, incremental updates |
| `analog:angular:tailwind`        | Tailwind CSS `@reference` injection via the `tailwindCss` plugin option                  |
| `analog:angular:style-pipeline`  | Reserved for Angular-side style-pipeline resource diagnostics                            |

### `@analogjs/vite-plugin-nitro`

| Scope                    | Area                                                    |
| ------------------------ | ------------------------------------------------------- |
| `analog:nitro`           | Nitro server lifecycle, experimental websocket upgrades |
| `analog:nitro:ssr`       | Server-side rendering                                   |
| `analog:nitro:prerender` | Prerendering                                            |

## Using with `@analogjs/vite-plugin-angular` standalone

The `debug` option is also available when using the Angular plugin directly:

```ts
import angular from '@analogjs/vite-plugin-angular';

export default defineConfig({
  plugins: [
    angular({
      debug: true, // enables analog:angular:* scopes
    }),
  ],
});
```

When used through `analog()`, the `debug` value is forwarded to the Angular plugin automatically.

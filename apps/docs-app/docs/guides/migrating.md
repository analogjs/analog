import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Migrating an Angular app to Analog

An existing Angular Single Page Application can be configured to use Analog using a schematic/generator for Angular CLI or Nx workspaces.

> Analog v3 requires Angular v17 or newer. Angular v16 is no longer supported.

## Migrating between Analog major versions

Use the path that matches your current app version:

- Analog v1 users should upgrade to v2 first, then move from v2 to v3.
- Analog v2 users can move directly to the v3 checklist below.

### Analog v1 to v2

The main migration themes from v1 to v2 are:

- move to the public `@analogjs/content` entrypoint instead of internal imports such as `@analogjs/content/lib`
- verify any content-rendering and table-of-contents usage against the current public API surface
- update your app with the standard Analog package upgrade flow before taking on the v3 breaking changes

If you use content rendering helpers such as `ContentRenderer`, import them from `@analogjs/content`:

```ts
import { ContentRenderer, type TableOfContentItem } from '@analogjs/content';
```

Do not rely on internal paths such as `@analogjs/content/lib`.

After the app is on the current v2 line and using public imports, continue with the v2 to v3 migration below.

### Analog v2 to v3

For an existing Analog v2 project, update the packages first and then work through the v3 breaking changes that apply to your app.

#### Update the workspace packages

Use the standard Analog update flow for your workspace type:

<Tabs groupId="app-upgrader">
  <TabItem label="ng update" value="ng-update">

```shell
ng update @analogjs/platform@latest
```

  </TabItem>

  <TabItem label="Nx migrate" value="nx-migrate">

```shell
nx migrate @analogjs/platform@latest
```

  </TabItem>
</Tabs>

#### v2 to v3 checklist

##### Angular version support

Analog v3 no longer supports Angular v16. Upgrade the workspace to Angular v17 or newer before adopting the stable v3 line.

##### Removed Analog SFC support

Analog SFC support was removed and `.agx` files are no longer supported. Replace any remaining SFC usage with standard Angular components, markdown content files, or route/page files that use the current Analog conventions.

##### Content rendering now requires an explicit highlighter

If your app renders markdown content, configure the content highlighter through the `analog()` plugin in `vite.config.ts`. New blog templates already do this, but older full-stack apps often do not.

Before:

```ts
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';

export default defineConfig(() => ({
  plugins: [analog()],
}));
```

After:

```ts
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';

export default defineConfig(() => ({
  plugins: [
    analog({
      content: {
        highlighter: 'shiki',
      },
    }),
  ],
}));
```

If you are using the markdown renderer in the app itself, keep `provideContent(withMarkdownRenderer())` and pair it with the matching highlighter setup for your project, such as `withShikiHighlighter()`.

If you were relying on older internal imports, switch those to the public `@analogjs/content` entrypoint. For example, import `ContentRenderer` and `TableOfContentItem` from `@analogjs/content`, not `@analogjs/content/lib`.

```ts
import { ContentRenderer, type TableOfContentItem } from '@analogjs/content';
```

##### Astro Angular now targets Angular 20 zoneless change detection

If you use `@analogjs/astro-angular`, plan the upgrade around Angular 20 and its zoneless baseline. Treat that package as a separate migration stream from a standard Analog app upgrade.

##### Legacy Vitest setup path

If your tests still import `@analogjs/vite-plugin-angular/setup-vitest`, migrate them to `@analogjs/vitest-angular/setup-zone`. Current update flows cover this automatically, but older manual setups should be checked explicitly.

#### Branch-derived upgrade notes for automation

The `upstream/beta -> upstream/alpha` branch diff is small enough to turn into practical migration rules:

- Reject Angular versions lower than v17. Analog's generators, devkit checks, and compatibility docs now treat Angular v17 as the floor.
- Remove any remaining `.agx` / Analog SFC usage and rewrite those files as normal Angular components.
- If the app uses `provideContent(withMarkdownRenderer())`, markdown route files, or content rendering helpers, ensure `vite.config.ts` configures `analog({ content: { highlighter: 'shiki' } })` or another supported highlighter.
- Replace internal content imports such as `@analogjs/content/lib` with the public `@analogjs/content` entrypoint.
- If tests import `@analogjs/vite-plugin-angular/setup-vitest`, rewrite them to `@analogjs/vitest-angular/setup-zone`.
- If the project uses explicit HMR configuration, prefer `hmr` over `liveReload`. HMR support is intended for newer Angular lines; older Angular versions should not be migrated with an expectation of HMR parity.
- Expect newer Vite baselines. The branch diff moves Angular 17/18 templates to Vite 6 and current Angular 19 templates to Vite 7.
- If the project uses `@analogjs/astro-angular`, treat that as a separate migration track because the integration moved to zoneless change detection by default.

For LLM-driven migration, use this checklist in order:

1. Detect the Angular major version from `package.json`. If it is `<17`, stop and upgrade Angular first.
2. Scan for `.agx` files and replace them with standard Angular component files.
3. Scan for `@analogjs/content/lib` imports and rewrite them to `@analogjs/content`.
4. Scan for `provideContent(withMarkdownRenderer())`, markdown page routes, or content helper imports. If found, enforce `analog({ content: { highlighter: 'shiki' } })` in `vite.config.ts`.
5. Scan for `@analogjs/vite-plugin-angular/setup-vitest` and rewrite it to `@analogjs/vitest-angular/setup-zone`.
6. Scan for explicit `liveReload` config and convert it to `hmr` unless the project intentionally needs the compatibility alias.
7. Reconcile the toolchain versions in `package.json` with the current Analog template line for that Angular major.

## Using a Schematic/Generator

First, install the `@analogjs/platform` package:

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm install @analogjs/platform --save-dev
```

  </TabItem>

  <TabItem label="Yarn" value="yarn">

```shell
yarn add @analogjs/platform --dev
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm install -w @analogjs/platform
```

  </TabItem>
</Tabs>

Next, run the command to set up the Vite config, update the build/serve targets in the project configuration, move necessary files, and optionally set up Vitest for unit testing.

```shell
npx ng generate @analogjs/platform:migrate --project [your-project-name]
```

For Nx projects:

```shell
npx nx generate @analogjs/platform:migrate --project [your-project-name]
```

## Updating Global Styles and Scripts

If you have any global scripts or styles configured in the `angular.json`, reference them inside the `head` tag in the `index.html`.

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>My Analog app</title>
    <base href="/" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" type="image/x-icon" href="/favicon.ico" />
    <link rel="stylesheet" href="/src/styles.css" />
  </head>
  <body>
    <app-root></app-root>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

## Setting Up Environments

In an Angular application, `fileReplacements` are configured in the `angular.json` for different environments.

### Using Environment Variables

In Analog, you can setup and use environment variables. This is the **recommended** approach.

Add a `.env` file to the root of your application, and prefix any **public** environment variables with `VITE_`. **Do not** check this file into your source code repository.

```sh
VITE_MY_API_KEY=development-key

# Only available in the server build
MY_SERVER_API_KEY=development-server-key
```

Import and use the environment variable in your code.

```ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly apiKey = import.meta.env['VITE_MY_API_KEY'];

  constructor(private http: HttpClient) {}
}
```

When deploying, set up your environment variables to their production equivalents.

```sh
VITE_MY_API_KEY=production-key

# Only available in the server build
MY_SERVER_API_KEY=production-server-key
```

Read [here](https://vitejs.dev/guide/env-and-mode.html) for about more information on environment variables.

### Using File Replacements

You can also use the `fileReplacements` option to replace files.

```ts
/// <reference types="vitest" />

import { defineConfig } from 'vite';
import analog from '@analogjs/platform';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  build: {
    target: ['es2020'],
  },
  resolve: {
    mainFields: ['module'],
  },
  plugins: [
    analog({
      fileReplacements:
        mode === 'production'
          ? [
              {
                replace: 'src/environments/environment.ts',
                with: 'src/environments/environment.prod.ts',
              },
            ]
          : [],
    }),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
    include: ['**/*.spec.ts'],
    reporters: ['default'],
  },
  define: {
    'import.meta.vitest': mode !== 'production',
  },
}));
```

## Copying Assets

Static assets in the `public` directory are copied to the build output directory by default. If you want to copy additional assets outside of that directory, use the `nxCopyAssetsPlugin` Vite plugin.

Import the plugin and set it up:

```ts
/// <reference types="vitest" />

import { defineConfig } from 'vite';
import analog from '@analogjs/platform';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // ...
  plugins: [analog(), nxCopyAssetsPlugin(['*.md'])],
}));
```

## Enabling HMR

Angular supports HMR where in most cases components can be updated without a full page reload. In Analog, prefer the `hmr` option. `liveReload` is still accepted as a compatibility alias, but `hmr` is the primary API.
Analog requires Angular v19 or newer for `hmr` / `liveReload` to work. On Angular v16-v18, `hmr` and its `liveReload` alias are forcibly disabled at runtime with a console warning, so HMR is unavailable on those versions.

```ts
/// <reference types="vitest" />

import { defineConfig } from 'vite';
import analog from '@analogjs/platform';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // .. other configuration
  plugins: [
    analog({
      hmr: true,
    }),
  ],
}));
```

If you are also using Tailwind v4 for component styles, keep that configuration on the Analog side as well:

```ts
/// <reference types="vitest" />

import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(() => ({
  plugins: [
    analog({
      hmr: true,
      vite: {
        tailwindCss: {
          rootStylesheet: resolve(import.meta.dirname, 'src/styles.css'),
        },
      },
    }),
    tailwindcss(),
  ],
}));
```

This is the recommended setup for Analog v3: one root Tailwind stylesheet, `@tailwindcss/vite` in Vite, and Analog handling component stylesheet preprocessing.

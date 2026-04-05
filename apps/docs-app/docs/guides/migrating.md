import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Migrating an Angular app to Analog

An existing Angular Single Page Application can be configured to use Analog using a schematic/generator for Angular CLI or Nx workspaces.

> Analog v3 requires Angular v17 or newer. Angular v16 is no longer supported.

## Updating an existing Analog app to v3

For an existing Analog project, update the packages first and then work through the v3 breaking changes that apply to your app.

### Update the workspace packages

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

### v3 migration checklist

#### Angular version support

Analog v3 no longer supports Angular v16. Upgrade the workspace to Angular v17 or newer before adopting the stable v3 line.

#### Removed Analog SFC support

Analog SFC support was removed and `.agx` files are no longer supported. Replace any remaining SFC usage with standard Angular components, markdown content files, or route/page files that use the current Analog conventions.

#### Content rendering now requires an explicit highlighter

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

#### Astro Angular now targets Angular 20 zoneless change detection

If you use `@analogjs/astro-angular`, plan the upgrade around Angular 20 and its zoneless baseline. Treat that package as a separate migration stream from a standard Analog app upgrade.

#### Legacy Vitest setup path

If your tests still import `@analogjs/vite-plugin-angular/setup-vitest`, migrate them to `@analogjs/vitest-angular/setup-zone`. Current update flows cover this automatically, but older manual setups should be checked explicitly.

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

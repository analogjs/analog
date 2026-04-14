import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Migrating an Angular app to Analog

An existing Angular Single Page Application can be configured to use Analog using a schematic/generator for Angular CLI or Nx workspaces.

> Analog v3 requires Angular v17 or newer. Angular v16 is no longer supported.

## Existing Analog apps

If you are upgrading an existing Analog app between major versions, use the dedicated guides:

- [Migrating from Analog v1 to v2](/docs/guides/migrating-v1-to-v2)
- [Migrating from Analog v2 to v3](/docs/guides/migrating-v2-to-v3)

If you are migrating a standard Angular app into Analog for the first time, continue with the guide below.

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

Angular supports HMR where in most cases components can be updated without a full page reload. In Analog, use `liveReload` to control the Angular live-reload pipeline.

This is separate from Vite's `server.hmr` option, which configures the HMR websocket transport. You can use `server.hmr` together with `liveReload` when you need custom host, port, or path settings.

Analog requires Angular v19 or newer for `liveReload` to work. On Angular v17-v18, `liveReload` is forcibly disabled at runtime with a console warning, so HMR is unavailable on those versions.

```ts
/// <reference types="vitest" />

import { defineConfig } from 'vite';
import analog from '@analogjs/platform';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // .. other configuration
  plugins: [
    analog({
      liveReload: true,
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
      liveReload: true,
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

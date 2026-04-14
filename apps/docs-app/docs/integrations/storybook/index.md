---
sidebar_position: 3
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Using Storybook with Angular and Vite

[Storybook](https://storybook.js.org) is a frontend workshop for building UI components and pages in isolation.

By default, Angular and Storybook uses Webpack to build and serve the Storybook application.

This guides you through the process of switching to building and serving your Storybook with Angular using Vite using the AnalogJS Storybook integration. This package can be applied to _any_ Angular project using Storybook.

> This is a community integration not maintained by the Storybook team. If you have issues, file an issue in our [GitHub repo](https://github.com/analogjs/analog/issues).

## Compatibility Guide

The AnalogJS Storybook integration for using Angular and Vite supports multiple versions of Storybook. See the table below for which version to install based on the project dependencies.

| Storybook Version | Analog Version |
| ----------------- | -------------- |
| ^10.0.0           | ^2.0.0         |
| ^9.0.0            | ^1.22.0        |
| ^8.6.0            | ^1.22.0        |

## Setting up Storybook

If you don't have Storybook setup already, run the following command to initialize Storybook for your project:

```sh
npx storybook@latest init
```

Follow the provided prompts, and commit your changes.

## Installing the Storybook package

Install the Storybook Integration for Angular and Vite. Depending on your preferred package manager, run one of the following commands:

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm install @analogjs/storybook-angular @analogjs/vite-plugin-angular --save-dev
```

  </TabItem>

  <TabItem label="yarn" value="yarn">

```shell
yarn add @analogjs/storybook-angular @analogjs/vite-plugin-angular --dev
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm install @analogjs/storybook-angular @analogjs/vite-plugin-angular -w --save-dev
```

  </TabItem>

  <TabItem value="bun">

```shell
bun install @analogjs/storybook-angular @analogjs/vite-plugin-angular --save-dev
```

  </TabItem>  
</Tabs>

## Configuring Storybook

Update the `.storybook/main.ts` file to use the `StorybookConfig` type. Also update the `framework` to use the `@analogjs/storybook-angular` package.

```ts
import { StorybookConfig } from '@analogjs/storybook-angular';

const config: StorybookConfig = {
  // other config, addons, etc.
  framework: {
    name: '@analogjs/storybook-angular',
    options: {},
  },
};

export default config;
```

For current Analog projects, prefer `framework.options.hmr` if you need to configure Angular HMR. `liveReload` is still accepted as a compatibility alias, but `hmr` is the recommended option.

Remove the existing `webpackFinal` config function if present.

Next, update the Storybook targets in the `angular.json` or `project.json`

```json
    "storybook": {
      "builder": "@analogjs/storybook-angular:start-storybook",
    },
    "build-storybook": {
      "builder": "@analogjs/storybook-angular:build-storybook"
    }
```

Remove any `webpack` specific options and remove the `browserTarget` option.

Add the `/storybook-static` folder to the `.gitignore` file.

## Setting up CSS

To register global styles, add them to the `@analogjs/storybook-angular` builder options in the `angular.json` or `project.json`.

```json
    "storybook": {
      "builder": "@analogjs/storybook-angular:start-storybook",
      "options": {
        // ... other options
        "styles": [
          "src/styles.css"
        ],
        "stylePreprocessorOptions": {
          "loadPaths": ["libs/my-lib/styles"]
        }
      }
    },
    "build-storybook": {
      "builder": "@analogjs/storybook-angular:build-storybook",
      "options": {
        // ... other options
        "styles": [
          "src/styles.css"
        ],
        "stylePreprocessorOptions": {
          "loadPaths": ["libs/my-lib/styles"]
        }
      }
    }
```

The Storybook preset uses these options for different jobs:

- `styles` entries are imported into Storybook's generated preview module, so use them for global stylesheets that every story should load
- `stylePreprocessorOptions.loadPaths` are passed to Vite's SCSS preprocessor, so use them for Sass `@use` and `@import` resolution inside `.scss` files

For Nx workspaces with shared SCSS libraries, keep the paths workspace-relative in `project.json`:

```json
{
  "storybook": {
    "executor": "@analogjs/storybook-angular:start-storybook",
    "options": {
      "configDir": "libs/shared/ui/.storybook",
      "styles": [
        "libs/shared/ui/styles/shared-ui.scss",
        "libs/shared/ui/.storybook/storybook.scss"
      ],
      "stylePreprocessorOptions": {
        "loadPaths": ["libs/shared/ui/styles"]
      }
    }
  }
}
```

Use the `styles` array for actual global stylesheet files. Use `loadPaths` only to help Sass resolve imports from those files; it does not load a stylesheet by itself.

For third-party package styles, prefer bare package imports such as `katex/dist/katex.css` or `@angular/material/prebuilt-themes/deeppurple-amber.css` over `node_modules/...` paths when the package exports them.

### Tailwind v4 in Storybook

If your project uses Tailwind v4, keep Storybook aligned with the same opinionated Analog setup you use in the app:

- one root stylesheet such as `src/styles.css`
- `@import 'tailwindcss';` in that stylesheet
- `framework.options.tailwindCss.rootStylesheet` pointing at that stylesheet
- `framework.options.hmr` for Angular HMR behavior

```ts
import { resolve } from 'node:path';
import type { StorybookConfig } from '@analogjs/storybook-angular';

const config: StorybookConfig = {
  framework: {
    name: '@analogjs/storybook-angular',
    options: {
      hmr: true,
      tailwindCss: {
        rootStylesheet: resolve(__dirname, '../src/styles.css'),
      },
    },
  },
};

export default config;
```

This keeps Storybook on the same stylesheet pipeline as the app instead of relying on ad hoc per-story or per-component Tailwind wiring.

## Enabling Zoneless Change Detection

To use zoneless change detection for the Storybook, add the `experimentalZoneless` flag to the `@analogjs/storybook-angular` builder options in the `angular.json` or `project.json`.

<Tabs groupId="zoneless-change-detection">
  <TabItem value="angular.json">

```json
    "storybook": {
      "builder": "@analogjs/storybook-angular:start-storybook",
      "options": {
        // ... other options
        "experimentalZoneless": true
      }
    },
    "build-storybook": {
      "builder": "@analogjs/storybook-angular:build-storybook",
      "options": {
        // ... other options
        "experimentalZoneless": true
      }
    }
```

  </TabItem>
  <TabItem value="project.json">

```json
    "storybook": {
      "executor": "@analogjs/storybook-angular:start-storybook",
      "options": {
        // ... other options
        "configDir": "path/to/.storybook",
        "experimentalZoneless": true,
        "compodoc": false
      }
    },
    "build-storybook": {
      "executor": "@analogjs/storybook-angular:build-storybook",
      "options": {
        // ... other options
        "configDir": "path/to/.storybook",
        "experimentalZoneless": true,
        "compodoc": false
      }
    }
```

  </TabItem>
</Tabs>

> Zoneless change detection is the default for new projects starting Angular v21.

## Setting up Static Assets

Static assets are configured in the `.storybook/main.ts` file using the `staticDirs` array.

The example below shows how to add the `public` directory from `src/public` relative to the `.storybook/main.ts` file.

```ts
import { StorybookConfig } from '@analogjs/storybook-angular';

const config: StorybookConfig = {
  // other config, addons, etc.
  framework: {
    name: '@analogjs/storybook-angular',
    options: {},
  },
  staticDirs: ['../public'],
};

export default config;
```

See the [Storybook docs on images and assets](https://storybook.js.org/docs/configure/integration/images-and-assets) for more information.

## Running Storybook

Run the command for starting the development server.

```sh
npm run storybook
```

## Building Storybook

Run the command for building the storybook.

```sh
npm run build-storybook
```

## Using TypeScript Config Path Aliases

If you are using `paths` in your `tsconfig.json`, support for those aliases can be added to the `vite.config.ts`.

### With Angular CLI

First, install the `vite-tsconfig-paths` package.

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm install vite-tsconfig-paths --save-dev
```

  </TabItem>

  <TabItem label="Yarn" value="yarn">

```shell
yarn add vite-tsconfig-paths --dev
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm install -w vite-tsconfig-paths --save-dev
```

  </TabItem>
</Tabs>

Next, add the plugin to the `plugins` array in the `.storybook/main.ts`.

```ts
import viteTsConfigPaths from 'vite-tsconfig-paths';
import { UserConfig, mergeConfig } from 'vite';

import type { StorybookConfig } from '@analogjs/storybook-angular';

const config: StorybookConfig = {
  // ... other config, addons, etc.
  async viteFinal(config: UserConfig) {
    return mergeConfig(config, {
      plugins: [viteTsConfigPaths()],
    });
  },
};

export default config;
```

### With Nx

In Nx workspaces, normal workspace library imports already resolve in Storybook. You usually do not need to add `nxViteTsPaths()` just to resolve workspace packages.

If your workspace still depends on custom `compilerOptions.paths` aliases beyond those normal workspace package imports, add the `nxViteTsPaths` plugin from `@nx/vite` in `.storybook/main.ts`:

```ts
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { UserConfig, mergeConfig } from 'vite';

import type { StorybookConfig } from '@analogjs/storybook-angular';

const config: StorybookConfig = {
  // ... other config, addons, etc.
  async viteFinal(config: UserConfig) {
    return mergeConfig(config, {
      plugins: [nxViteTsPaths()],
    });
  },
};

export default config;
```

`nxViteTsPaths()` is only for custom TypeScript path aliases. It does not replace Storybook's `styles` option or SCSS `loadPaths`, so shared Sass setups usually need:

- `styles` for global Storybook stylesheets
- `stylePreprocessorOptions.loadPaths` for Sass import roots
- `nxViteTsPaths()` only if you still rely on custom TS/Angular aliases instead of normal workspace package imports

If styles still do not load as expected, enable scoped preset logging before running Storybook or the Storybook build:

```sh
DEBUG=analog-storybook:styles npm run storybook
```

This logs the resolved workspace root, SCSS `loadPaths`, and how each `styles` entry was classified:

- `project` when it resolves relative to the Storybook project root
- `workspace` when it resolves from the workspace root
- `bare` when it is left as a package import such as `katex/dist/katex.css`

## Using File Replacements

You can also use the `replaceFiles()` plugin from Nx to replace files during your build.

Import the plugin and set it up:

```ts
import { replaceFiles } from '@nx/vite/plugins/rollup-replace-files.plugin';
import { UserConfig, mergeConfig } from 'vite';

import type { StorybookConfig } from '@analogjs/storybook-angular';

const config: StorybookConfig = {
  // ... other config, addons, etc.
  async viteFinal(config: UserConfig) {
    return mergeConfig(config, {
      plugins: [
        replaceFiles([
          {
            replace: './src/one.ts',
            with: './src/two.ts',
          },
        ]),
      ],
    });
  },
};

export default config;
```

Adding the replacement files to `files` array in the `tsconfig.app.json` may also be necessary.

```json
{
  "extends": "./tsconfig.json",
  // other config
  "files": ["src/main.ts", "src/main.server.ts", "src/two.ts"]
}
```

## Setting up Vitest for Interaction Testing

Storybook also supports using Vitest for testing component interactions.

### Installing Packages

Install the Vitest addon and dependencies:

```sh
npm install @analogjs/vitest-angular @storybook/addon-vitest vitest @vitest/browser-playwright --save-dev
```

### Add Vitest Add-on

Add the addon to your `.storybook/main.ts`:

```ts
import { StorybookConfig } from '@analogjs/storybook-angular';

const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: [
    '@storybook/addon-essentials',
    '@storybook/addon-interactions',
    '@storybook/addon-vitest',
  ],
  framework: {
    name: '@analogjs/storybook-angular',
    options: {},
  },
};

export default config;
```

### Setup Vitest Configuration

Create a `.storybook/vitest.setup.ts` file:

```ts
import '@angular/compiler';
import { setProjectAnnotations } from '@analogjs/storybook-angular/testing';
import { beforeAll } from 'vitest';
import * as projectAnnotations from './preview';

const project = setProjectAnnotations([projectAnnotations]);

beforeAll(project.beforeAll);
```

Update `.storybook/tsconfig.json` to include the setup file:

```json
{
  "extends": "../tsconfig.app.json",
  "compilerOptions": {
    "types": ["node"],
    "allowSyntheticDefaultImports": true,
    "resolveJsonModule": true
  },
  "exclude": ["../src/test.ts", "../src/**/*.spec.ts"],
  "include": ["../src/**/*.stories.*", "./preview.ts", "./vitest.setup.ts"],
  "files": ["./typings.d.ts"]
}
```

Create a `vitest.config.ts` file in your project root, or add a `storybook` project to your existing `vite.config.ts`:

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';

const dirname =
  typeof __dirname !== 'undefined'
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        plugins: [
          storybookTest({
            configDir: path.join(dirname, '.storybook'),
          }),
        ],
        test: {
          name: 'storybook',
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
          },
          setupFiles: ['.storybook/vitest.setup.ts'],
        },
      },
    ],
  },
});
```

### Installing Playwright

Install Playwright browser binaries:

```sh
npx playwright install chromium
```

### Running Component Tests

Add the `test-storybook` target to your `angular.json`:

```json
"test-storybook": {
  "builder": "@analogjs/vitest-angular:test",
  "options": {
    "configFile": "vitest.config.ts"
  }
}
```

Add a test script to your `package.json`:

```json
"scripts": {
  "test-storybook": "ng run your-app:test-storybook"
}
```

Run your interaction tests with:

```sh
npm run test-storybook
```

You can also run tests directly in the Storybook UI. Start Storybook and use the "Run Tests" button in the sidebar, or navigate to a story to see interaction tests run automatically in the Interactions panel.

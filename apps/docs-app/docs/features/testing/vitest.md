import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Adding Vitest To An Existing Project

[Vitest](https://vitest.dev) can be added to existing Angular workspaces with a few steps.

## Installation

To add Vitest, install the necessary packages:

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm install @analogjs/vite-plugin-angular @analogjs/platform jsdom vite-tsconfig-paths --save-dev
```

  </TabItem>

  <TabItem label="Yarn" value="yarn">

```shell
yarn add @analogjs/vite-plugin-angular @analogjs/platform jsdom vite-tsconfig-paths --dev
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm install -w @analogjs/vite-plugin-angular @analogjs/platform jsdom vite-tsconfig-paths
```

  </TabItem>
</Tabs>

## Setup for Running Tests for Node

To setup Vitest, create a `vite.config.ts` at the root of your project:

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite';

import angular from '@analogjs/vite-plugin-angular';
import viteTsConfigPaths from 'vite-tsconfig-paths';

export default defineConfig(({ mode }) => ({
  plugins: [
    angular(),
    viteTsConfigPaths({
      root: './',
    }),
  ],
  test: {
    globals: true,
    setupFiles: ['src/test.ts'],
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
  },
  define: {
    'import.meta.vitest': mode !== 'production',
  },
}));
```

Next, define a `src/test.ts` file to setup the `TestBed`:

```ts
import '@analogjs/vite-plugin-angular/setup-vitest';

import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';
import { getTestBed } from '@angular/core/testing';

getTestBed().initTestEnvironment(
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting()
);
```

Next, update the `test` target in the `angular.json` to use the `@analogjs/platform:vitest` builder:

```json
{
  "$schema": "./node_modules/@angular/cli/lib/config/schema.json",
  "version": 1,
  "newProjectRoot": "projects",
  "projects": {
    "your-project": {
      "projectType": "application",
      "architect": {
        "build": ...,
        "serve": ...,
        "extract-i18n": ...,
        "test": {
          "builder": "@analogjs/platform:vitest"
        }
      }
    }
  }
}
```

> You can also add a new target and name it `vitest` to run alongside your `test` target.

Lastly, add the `src/test.ts` to `files` array in the `tsconfig.spec.json` in the root of your project, and update the `types`.

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "./out-tsc/spec",
    "types": ["vitest/globals", "node"]
  },
  "files": ["src/test.ts"],
  "include": ["src/**/*.spec.ts", "src/**/*.d.ts"]
}
```

## Setup for Running Tests in the Browser

If you prefer to run your tests in a browser, Vitest has experimental support for browser testing also.

First, follow the steps for [running tests in node](#setup-for-running-tests-for-node).

Then, install the necessary packages for running tests in the browser:

<Tabs groupId="package-manager-browser">
  <TabItem value="npm">

```shell
npm install @vitest/browser playwright --save-dev
```

  </TabItem>

  <TabItem label="Yarn" value="yarn">

```shell
yarn add @vitest/browser playwright --dev
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm install -w @vitest/browser playwright
```

  </TabItem>
</Tabs>

Update the `test` object in the `vite.config.ts`.

- Remove the `environment: 'jsdom'` property.
- Add a `browser` config for Vitest.

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite';

import angular from '@analogjs/vite-plugin-angular';
import viteTsConfigPaths from 'vite-tsconfig-paths';

export default defineConfig(({ mode }) => ({
  plugins: [
    angular(),
    viteTsConfigPaths({
      root: './',
    }),
  ],
  test: {
    globals: true,
    setupFiles: ['src/test.ts'],
    // environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    // Vitest browser config
    browser: {
      enabled: true,
      name: 'chromium',
      headless: false, // set to true in CI
      provider: 'playwright',
    },
  },
  define: {
    'import.meta.vitest': mode !== 'production',
  },
}));
```

## Running Tests

To run unit tests, use the `test` command:

<Tabs groupId="package-manager-node">
  <TabItem value="npm">

```shell
npm run test
```

  </TabItem>

  <TabItem label="Yarn" value="yarn">

```shell
yarn test
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm test
```

  </TabItem>
</Tabs>

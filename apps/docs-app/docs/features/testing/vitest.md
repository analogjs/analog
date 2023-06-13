import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Adding Vitest To An Existing Project

[Vitest](https://vitest.dev) can be added to existing Angular workspaces with a few steps.

## Installation

To add Vitest, install the necessary packages:

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm install @analogjs/vite-plugin-angular @nx/vite jsdom vite-tsconfig-paths --save-dev
```

  </TabItem>

  <TabItem label="Yarn" value="yarn">

```shell
yarn install @analogjs/vite-plugin-angular @nx/vite jsdom vite-tsconfig-paths --dev
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm install -w @analogjs/vite-plugin-angular @nx/vite jsdom vite-tsconfig-paths
```

  </TabItem>
</Tabs>

## Setup

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

Next, update the `test` target in the `angular.json` to use the `@nx/vite:test` builder:

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
          "builder": "@nx/vite:test"
        }
      }
    }
  }
}
```

> You can also add a new target and name it `vitest` to run alongside your `test` target.

Lastly, add the `src/test.ts` to `files` array in the `tsconfig.spec.json` in the root of your project.

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "./out-tsc/spec",
    "types": ["jasmine"]
  },
  "files": ["src/test.ts"],
  "include": ["src/**/*.spec.ts", "src/**/*.d.ts"]
}
```

## Running Tests

To run unit tests, use the `test` command:

<Tabs groupId="package-manager">
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

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Adding Vitest To An Existing Project

[Vitest](https://vitest.dev) can be added to existing Angular workspaces with a few steps.

## Using a Schematic/Generator

Vitest can be installed and setup using a schematic/generator for Angular CLI or Nx workspaces.

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

Next, run the schematic to set up the Vite config, test configuration files, and update the test configuration.

```shell
ng g @analogjs/platform:setup-vitest --project [your-project-name]
```

Next, go to [running tests](#running-tests)

## Manual Installation

To add Vitest manually, install the necessary packages:

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm install @analogjs/vite-plugin-angular @analogjs/platform jsdom @nx/vite --save-dev
```

  </TabItem>

  <TabItem label="Yarn" value="yarn">

```shell
yarn add @analogjs/vite-plugin-angular @analogjs/platform jsdom @nx/vite --dev
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm install -w @analogjs/vite-plugin-angular @analogjs/platform jsdom @nx/vite
```

  </TabItem>
</Tabs>

## Setup for Running Tests for Node

To setup Vitest, create a `vite.config.ts` at the root of your project:

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite';

import angular from '@analogjs/vite-plugin-angular';

export default defineConfig(({ mode }) => ({
  plugins: [angular()],
  test: {
    globals: true,
    setupFiles: ['src/test-setup.ts'],
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
  },
  define: {
    'import.meta.vitest': mode !== 'production',
  },
}));
```

Next, define a `src/test-setup.ts` file to setup the `TestBed`:

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

Lastly, add the `src/test-setup.ts` to `files` array in the `tsconfig.spec.json` in the root of your project, set the `target` to `es2016`, and update the `types`.

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "./out-tsc/spec",
    "target": "es2016",
    "types": ["vitest/globals", "node"]
  },
  "files": ["src/test-setup.ts"],
  "include": ["src/**/*.spec.ts", "src/**/*.d.ts"]
}
```

Next, go to [running tests](#running-tests)

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

export default defineConfig(({ mode }) => ({
  plugins: [angular()],
  test: {
    globals: true,
    setupFiles: ['src/test-setup.ts'],
    // environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
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

## Snapshot Testing

For snapshot testing you can use `toMatchSnapshot` from `expect` API.

Below is a small example of how to write a snapshot test:

```ts
// card.component.spec.ts

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CardComponent } from './card.component';

describe('CardComponent', () => {
  let fixture: ComponentFixture<CardComponent>;
  let component: CardComponent;

  beforeEach(() =>
    TestBed.configureTestingModule({
      imports: [CardComponent],
    })
  );

  beforeEach(() => {
    fixture = TestBed.createComponent(CardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the app', () => {
    expect(fixture).toMatchSnapshot();
  });

```

After you run the test, a `card.component.spec.ts.snap` file is created in the`__snapshots__` folder with the below content:

```ts
// Vitest Snapshot v1, https://vitest.dev/guide/snapshot.html

exports[`CardComponent > should create the app 1`] = `
  <component-code>
`;
```

The snapshots generated should be reviewed and added to version control.

## Using TypeScript Config Path Aliases

If you are using `paths` in your `tsconfig.json`, support for those aliases can be added to the `vite.config.ts`.

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
pnpm install -w vite-tsconfig-paths
```

  </TabItem>
</Tabs>

Next, add the plugin to the `plugins` array in the `vite.config.ts` with the `root` set as the relative path to the root of the project.

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite';

import angular from '@analogjs/vite-plugin-angular';
import viteTsConfigPaths from 'vite-tsconfig-paths';

export default defineConfig(({ mode }) => ({
  plugins: [angular(), viteTsConfigPaths()],
}));
```

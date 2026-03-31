import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Using Vitest with An Angular Project

[Vitest](https://vitest.dev) can be added to **_any_** existing Angular project with a few steps.

## Automated Setup Using a Schematic/Generator

Vitest can be installed and setup using a schematic/generator for Angular CLI or Nx workspaces.

First, install the `@analogjs/vitest-angular` package:

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm install @analogjs/vitest-angular --save-dev
```

  </TabItem>

  <TabItem label="Yarn" value="yarn">

```shell
yarn add @analogjs/vitest-angular --dev
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm install -w @analogjs/vitest-angular --save-dev
```

  </TabItem>
</Tabs>

Next, run the schematic to set up the Vite config, test configuration files, and update the test configuration.

```shell
ng g @analogjs/vitest-angular:setup --project [your-project-name]
```

### Schematic Options

| Option        | Type    | Default | Description                                                 |
| ------------- | ------- | ------- | ----------------------------------------------------------- |
| `project`     | string  | -       | The name of the project to configure (required)             |
| `browserMode` | boolean | `false` | Configure Vitest to run tests in a browser using Playwright |

To enable browser mode during setup:

```shell
ng g @analogjs/vitest-angular:setup --project [your-project-name] --browserMode
```

This automatically installs Playwright dependencies and configures Vitest for browser testing. See [Setup for Running Tests in the Browser](#setup-for-running-tests-in-the-browser) for more details.

If using browser mode, run `npx playwright install` after the schematic to ensure playwright is installed and configured.

Next, go to [running tests](#running-tests)

## Manual Installation

To add Vitest manually, install the necessary packages:

If your app uses `analog({ vite: false })` with a replacement Angular compiler, keep using `@analogjs/vitest-angular` for test setup.

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm install @analogjs/vite-plugin-angular @analogjs/vitest-angular jsdom --save-dev
```

  </TabItem>

  <TabItem label="Yarn" value="yarn">

```shell
yarn add @analogjs/vite-plugin-angular @analogjs/vitest-angular jsdom --dev
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm install -w @analogjs/vite-plugin-angular @analogjs/vitest-angular jsdom --save-dev
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
}));
```

Next, define a `src/test-setup.ts` file to setup the `TestBed`:

### Zoneless setup

As of Angular v21, `Zoneless` change detection is the default for new projects.

Use the following setup:

```ts
import '@angular/compiler';
import '@analogjs/vitest-angular/setup-snapshots';
import '@analogjs/vitest-angular/setup-serializers';
import { setupTestBed } from '@analogjs/vitest-angular/setup-testbed';

setupTestBed();
```

### Zone.js setup

If you are using `Zone.js` for change detection, import the `setup-zone` script. This script automatically includes support for setting up snapshot tests.

```ts
import '@angular/compiler';
import '@analogjs/vitest-angular/setup-zone';
import { setupTestBed } from '@analogjs/vitest-angular/setup-testbed';

setupTestBed({
  zoneless: false,
});
```

### Configuration Options

The `setupTestBed()` function accepts an optional configuration object with the following properties:

- `zoneless` (boolean): Whether to use zoneless change detection (default: `true`)
- `providers` (`Type<any>[]`): Additional providers to include in the test environment (default: `[]`)
- `teardown.destroyAfterEach` (boolean): Whether to destroy the test environment after each test. Set to `false` to keep the component rendered, allowing you to inspect its final state. (default: `true`)

**Example with options:**

```ts
setupTestBed({
  zoneless: true,
  providers: [],
  teardown: { destroyAfterEach: false },
});
```

Next, update the `test` target in the `angular.json` to use the `@analogjs/vitest-angular:test` builder:

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
          "builder": "@analogjs/vitest-angular:test"
        }
      }
    }
  }
}
```

> You can also add a new target and name it `vitest` to run alongside your `test` target.

Lastly, add the `src/test-setup.ts` to `files` array in the `tsconfig.spec.json` in the root of your project, set the `target` to `es2022`, and update the `types`.

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "./out-tsc/spec",
    "target": "es2022",
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
npm install @vitest/browser-playwright playwright --save-dev
```

  </TabItem>

  <TabItem label="Yarn" value="yarn">

```shell
yarn add @vitest/browser-playwright playwright --dev
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm install -w @vitest/browser-playwright playwright
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
import { playwright } from '@vitest/browser-playwright';

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
      headless: false, // set to true in CI
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
    },
  },
}));
```

When running tests with headed browser mode, you may want to update your `src/test-setup.ts` to keep the component rendered:

```ts
import '@angular/compiler';
import '@analogjs/vitest-angular/setup-snapshots';
import '@analogjs/vitest-angular/setup-serializers';
import { setupTestBed } from '@analogjs/vitest-angular/setup-testbed';

setupTestBed({
  teardown: { destroyAfterEach: false }, // Enables visual test preview
});
```

This keeps the component rendered after tests complete, allowing you to visually inspect the final state in the browser preview.

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

> The `npx vitest` command can also be used directly.

<strong>Hungry for more? Check out Younes Jaaidi's [video course](https://courses.marmicode.io/courses/pragmatic-angular-testing?ref=ec72c7) on Angular testing.</strong>

[![Angular Testing Course](/img/pragmatic-angular-testing-banner-2.jpg)](https://courses.marmicode.io/courses/pragmatic-angular-testing?ref=ec72c7)

## Snapshot Testing

For snapshot testing you can use `toMatchSnapshot` from `expect` API.

The import of `setup-snapshots` and `setup-serializers` are complementary:

- Use `setup-snapshots` to serialize Angular fixtures and component refs so Vitest snapshots print component markup instead of Angular testing internals.
- Use `setup-serializers` to clean DOM snapshots by removing Angular runtime noise such as `_ngcontent-*`, `_nghost-*`, `ng-reflect-*`, generated ids and classes, and removes comments from DOM snapshots (e.g. `<!--container-->`).

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
    }),
  );

  beforeEach(() => {
    fixture = TestBed.createComponent(CardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the app', () => {
    expect(fixture).toMatchSnapshot();
  });
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

### With Nx

For Nx workspaces, import and use the `nxViteTsPaths` plugin from the `@nx/vite` package.

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite';

import angular from '@analogjs/vite-plugin-angular';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

export default defineConfig(({ mode }) => ({
  plugins: [angular(), nxViteTsPaths()],
}));
```

# @analogjs/vitest-angular

A standalone builder for running tests with Vitest and Angular.

## Supporting Analog

- Star the [GitHub Repo](https://github.com/analogjs/analog)
- Join the [Discord](https://chat.analogjs.org)
- Follow us on [Twitter](https://twitter.com/analogjs)
- Become a [Sponsor](https://analogjs.org/docs/sponsoring)

## Installation

Use your package manager of choice to install the necessary packages.

With ng add:

```sh
ng add @analogjs/vitest-angular
```

With npm:

```sh
npm install @analogjs/vitest-angular vitest --save-dev
```

With pnpm:

```sh
pnpm install -w @analogjs/vitest-angular vitest --dev
```

With Yarn:

```sh
yarn install @analogjs/vitest-angular vitest --dev
```

## Automated Setup Using a Schematic

A schematic can be used to setup Vitest in an existing Angular project:

Install the `@analogjs/platform` package:

```sh
npm i @analogjs/platform --save-dev
```

Run the schematic to install Vitest, and update the `test` builder:

```sh
npx ng generate @analogjs/platform:setup-vitest --project [your-project-name]
```

## Manual Setup

Vitest can be setup manually also using the steps below.

### Setup for Running Tests in Node

To setup Vitest, create a `vite.config.mts` at the root of your project:

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
import '@analogjs/vitest-angular/setup-zone';

import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';
import { getTestBed } from '@angular/core/testing';

getTestBed().initTestEnvironment(
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting(),
);
```

If you are using `Zoneless` change detection, use the following setup:

```ts
import '@analogjs/vitest-angular/setup-snapshots';

import {
  provideExperimentalZonelessChangeDetection,
  NgModule,
} from '@angular/core';
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';
import { getTestBed } from '@angular/core/testing';

@NgModule({
  providers: [provideExperimentalZonelessChangeDetection()],
})
export class ZonelessTestModule {}

getTestBed().initTestEnvironment(
  [BrowserDynamicTestingModule, ZonelessTestModule],
  platformBrowserDynamicTesting(),
);
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
        "test": {
          "builder": "@analogjs/vitest-angular:test"
        }
      }
    }
  }
}
```

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

## Running Tests

To run unit tests, use the `test` command:

```shell
npm run test
```

```shell
yarn test
```

```shell
pnpm test
```

> The `npx vitest` command can also be used directly.

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

First, install the `vite-tsconfig-paths` package.

With npm:

```shell
npm install vite-tsconfig-paths --save-dev
```

With pnpm:

```shell
pnpm install -w vite-tsconfig-paths --dev
```

With Yarn:

```shell
yarn add vite-tsconfig-paths --dev
```

Next, add the plugin to the `plugins` array in the `vite.config.ts`.

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite';

import angular from '@analogjs/vite-plugin-angular';
import viteTsConfigPaths from 'vite-tsconfig-paths';

export default defineConfig(({ mode }) => ({
  // ...other config
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

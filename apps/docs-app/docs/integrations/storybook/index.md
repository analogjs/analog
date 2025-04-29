---
sidebar_position: 3
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Using Storybook with Angular and Vite

[Storybook](https://storybook.js.org) is a frontend workshop for building UI components and pages in isolation.

By default, Angular and Storybook uses Webpack to build and serve the Storybook application.

This guides you through the process of switching to building and serving your Storybook with Angular using Vite. This process can be applied to _any_ Angular project using Storybook.

## Setting up Storybook

If you don't have Storybook setup already, run the following command to initialize Storybook for your project:

```sh
npx storybook@latest init
```

Follow the provided prompts, and commit your changes.

## Installing the Storybook package

Install the Storybook Plugin for Angular and Vite. Depending on your preferred package manager, run one of the following commands:

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm install @analogjs/storybook-angular --save-dev
```

  </TabItem>

  <TabItem label="yarn" value="yarn">

```shell
yarn add @analogjs/storybook-angular --dev
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm install @analogjs/storybook-angular -w --save-dev
```

  </TabItem>

  <TabItem value="bun">

```shell
bun install @analogjs/storybook-angular --save-dev
```

  </TabItem>  
</Tabs>

## Configuring Storybook

Add the `zone.js` import to the top of your `.storybook/preview.ts` file.

```ts
import 'zone.js';
import { applicationConfig, type Preview } from '@analogjs/storybook-angular';
import { provideNoopAnimations } from '@angular/platform-browser/animations';

const preview: Preview = {
  decorators: [
    applicationConfig({
      providers: [provideNoopAnimations()],
    }),
  ],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};

export default preview;
```

Next, update the `.storybook/main.ts` file to use the `StorybookConfig`. Also update the `framework` to use the `@analogjs/storybook-angular` package.

```ts
import { StorybookConfig } from '@analogjs/storybook-angular';

const config: StorybookConfig = {
  // other config, addons, etc.
  framework: {
    name: '@analogjs/storybook-angular',
    options: {},
  },
};
```

If you have any global styles, import them directly in the `.storybook/preview.ts` file.

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

## Using shared CSS paths

To load shared CSS paths, configure them using `loadPaths` css option in the `viteFinal` function.

```ts
import path from 'node:path';

async viteFinal() {
  return {
    css: {
      preprocessorOptions: {
        scss: {
          loadPaths: `${path.resolve(__dirname, '../src/lib/styles')}`
        }
      }
    }
  };
}
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

Next, add the plugin to the `plugins` array.

```ts
import viteTsConfigPaths from 'vite-tsconfig-paths';

async viteFinal() {
  return {
    plugins: [
      viteTsConfigPaths()
    ],
  };
}
```

### With Nx

For Nx workspaces, import and use the `nxViteTsPaths` plugin from the `@nx/vite` package.

```ts
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

async viteFinal(config: UserConfig) {
  return {
    plugins: [
      nxViteTsPaths()
    ],
  };
}
```

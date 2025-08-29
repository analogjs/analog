---
sidebar_position: 3
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Using Storybook with Angular and Vite

[Storybook](https://storybook.js.org) is a frontend workshop for building UI components and pages in isolation.

By default, Angular and Storybook uses Webpack to build and serve the Storybook application.

This guides you through the process of switching to building and serving your Storybook with Angular using Vite using the AnalogJS Storybook integration. This package can be applied to _any_ Angular project using Storybook.

> This is a community integration not maintained by the Storybook team. If you have issues,
> file an issue in our [GitHub repo](https://github.com/analogjs/analog/issues).

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

For Nx workspaces, import and use the `nxViteTsPaths` plugin from the `@nx/vite` package. Add the plugin to the `plugins` array in the `.storybook/main.ts`.

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

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

## Installing the Storybook and Vite packages

Install the Vite Plugin for Angular and the Vite Builder for Storybook. Depending on your preferred package manager, run one of the following commands:

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm install @analogjs/vite-plugin-angular @storybook/builder-vite --save-dev
```

  </TabItem>

  <TabItem label="yarn" value="yarn">

```shell
yarn add @analogjs/vite-plugin-angular @storybook/builder-vite --dev
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm install @analogjs/vite-plugin-angular @storybook/builder-vite -w --save-dev
```

  </TabItem>

  <TabItem value="bun">

```shell
bun install @analogjs/vite-plugin-angular @storybook/builder-vite --save-dev
```

  </TabItem>  
</Tabs>

## Configuring Storybook to use the Vite Builder

Add the `zone.js` import to the top of your `.storybook/preview.ts` file.

```ts
import 'zone.js';
import { applicationConfig, type Preview } from '@storybook/angular';
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

Next, update the `.storybook/main.ts` file to use the `@storybook/builder-vite` and add the `viteFinal` config function to configure the Vite Plugin for Angular.

```ts
import { StorybookConfig } from '@storybook/angular';
import { StorybookConfigVite } from '@storybook/builder-vite';
import { UserConfig } from 'vite';

const config: StorybookConfig & StorybookConfigVite = {
  // other config, addons, etc.
  core: {
    builder: {
      name: '@storybook/builder-vite',
      options: {
        viteConfigPath: undefined,
      },
    },
  },
  async viteFinal(config: UserConfig) {
    // Merge custom configuration into the default config
    const { mergeConfig } = await import('vite');
    const { default: angular } = await import('@analogjs/vite-plugin-angular');

    return mergeConfig(config, {
      // Add dependencies to pre-optimization
      optimizeDeps: {
        include: [
          '@storybook/angular',
          '@storybook/angular/dist/client',
          '@angular/compiler',
          '@storybook/blocks',
          'tslib',
        ],
      },
      plugins: [angular({ jit: true, tsconfig: './.storybook/tsconfig.json' })],
      define: {
        STORYBOOK_ANGULAR_OPTIONS: JSON.stringify({
          experimentalZoneless: false,
        }),
      },
    });
  },
};
```

Remove the existing `webpackFinal` config function if present.

Next, Update the `package.json` to run the Storybook commands directly.

```json
{
  "name": "my-app",
  "scripts": {
    "storybook": "storybook dev --port 4400",
    "build-storybook": "storybook build"
  }
}
```

> You can also remove the Storybook targets in the angular.json

If you're using [Nx](https://nx.dev), update your `project.json` storybook targets to run the Storybook commands:

```json
    "storybook": {
      "executor": "nx:run-commands",
      "options": {
        "cwd": "apps/my-app",
        "command": "storybook dev --port 4400"
      }
    },
    "build-storybook": {
      "executor": "nx:run-commands",
      "options": {
        "cwd": "apps/my-app",
        "command": "storybook build --output-dir ../../dist/storybook/my-app"
      }
    }
```

Add the `/storybook-static` folder to your `.gitignore` file.

## Running Storybook

Run the storybook commands directly for running the development server.

```sh
npm run storybook
```

## Building Storybook

Run the storybook commands for building the storybook.

```sh
npm run build-storybook
```

## Using shared CSS paths

To load shared CSS paths, configure them using `loadPaths` css option in the vite config.

```ts
import path from 'node:path';

async viteFinal(config: UserConfig) {
  // Merge custom configuration into the default config
  const { mergeConfig } = await import('vite');
  const { default: angular } = await import('@analogjs/vite-plugin-angular');

  return mergeConfig(config, {
    css: {
      preprocessorOptions: {
        scss: {
          loadPaths: `${path.resolve(__dirname, '../src/lib/styles')}`
        }
      }
    }
  });
},
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

Next, add the plugin to the `plugins` array in the `vite.config.ts` with the `root` set as the relative path to the root of the project.

```ts
import viteTsConfigPaths from 'vite-tsconfig-paths';

async viteFinal(config: UserConfig) {
  // Merge custom configuration into the default config
  const { mergeConfig } = await import('vite');
  const { default: angular } = await import('@analogjs/vite-plugin-angular');

  return mergeConfig(config, {
    plugins: [
      angular(),
      viteTsConfigPaths()
    ],
  });
}
```

### With Nx

For Nx workspaces, import and use the `nxViteTsPaths` plugin from the `@nx/vite` package.

```ts
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

async viteFinal(config: UserConfig) {
  // Merge custom configuration into the default config
  const { mergeConfig } = await import('vite');
  const { default: angular } = await import('@analogjs/vite-plugin-angular');

  return mergeConfig(config, {
    plugins: [
      angular(),
      nxViteTsPaths()
    ],
  });
}
```

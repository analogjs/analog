---
sidebar_position: 3
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Using Storybook with Angular and Vite

[Storybook](https://storybook.js.org) is a frontend workshop for building UI components and pages in isolation.

By default, Angular and Storybook uses Webpack to build and serve the Storybook application.

This guides you through the process of switching to building and serving your Storybook with Angular using Vite. This process can be applied to _any_ Angular application using Storybook.

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

Update the `.storybook/main.ts` file to use the `@storybook/builder-vite` and add the `viteFinal` config function to configure the Vite Plugin for Angular.

```ts
import { UserConfig } from 'vite';

const config = {
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
    });
  },
};
```

Update the `package.json` to run the Storybook commands directly.

```json
{
  "name": "my-app",
  "scripts": {
    "storybook": "storybook dev",
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
        "command": "storybook dev"
      }
    },
    "build-storybook": {
      "executor": "nx:run-commands",
      "options": {
        "cwd": "apps/my-app",
        "command": "storybook build"
      }
    }
```

## Running Storybook

Run the storybook commands directly for development and building.

```sh
npm run storybook
```

## Building Storybook

```sh
npm run build-storybook
```

Add the `/storybook-static` folder to your `.gitignore` file.

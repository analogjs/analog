# @analogjs/storybook-angular

Integration package for Storybook using Angular & Vite.

## Setup

If you don't have Storybook setup already, run the following command to initialize Storybook for your project:

```sh
npx storybook@latest init
```

Follow the provided prompts, and commit your changes.

## Installing the Storybook package

Install the Storybook Plugin for Angular and Vite. Depending on your preferred package manager, run one of the following commands:

```shell
npm install @analogjs/storybook-angular --save-dev
```

## Configuring Storybook

Add the `zone.js` import to the top of the `.storybook/preview.ts` file.

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

Remove the existing `webpackFinal` config function if present.

Next, update the Storybook builders in the `angular.json` or `project.json`.

```json
    "storybook": {
      "builder": "@analogjs/storybook-angular:start-storybook",
    },
    "build-storybook": {
      "builder": "@analogjs/storybook-angular:build-storybook"
    }
```

Remove any `webpack` specific options and remove the `browserTarget` option.

Add the `/storybook-static` folder to your `.gitignore` file.

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
import { UserConfig, mergeConfig } from 'vite';

export async function viteFinal(config: UserConfig) {
  return mergeConfig(config, {
    css: {
      preprocessorOptions: {
        scss: {
          loadPaths: `${path.resolve(__dirname, '../src/lib/styles')}`,
        },
      },
    },
  });
}
```

## Using TypeScript Config Path Aliases

If you are using `paths` in your `tsconfig.json`, support for those aliases can be added to the `vite.config.ts`.

### With Angular CLI

First, install the `vite-tsconfig-paths` package.

```shell
npm install vite-tsconfig-paths --save-dev
```

Next, add the plugin to the `plugins` array in the `.storybook/main.ts`.

```ts
import viteTsConfigPaths from 'vite-tsconfig-paths';
import { UserConfig, mergeConfig } from 'vite';

export async function viteFinal(config: UserConfig) {
  return mergeConfig(config, {
    plugins: [viteTsConfigPaths()],
  });
}
```

### With Nx

For Nx workspaces, import and use the `nxViteTsPaths` plugin from the `@nx/vite` package. Add the plugin to the `plugins` array in the `.storybook/main.ts`.

```ts
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { UserConfig, mergeConfig } from 'vite';

export async function viteFinal(config: UserConfig) {
  return mergeConfig(config, {
    plugins: [nxViteTsPaths()],
  });
}
```

## Using File Replacements

You can also use the `replaceFiles()` plugin from Nx to replace files during your build.

Import the plugin and set it up:

```ts
import { replaceFiles } from '@nx/vite/plugins/rollup-replace-files.plugin';
import { UserConfig, mergeConfig } from 'vite';

export async function viteFinal(config: UserConfig) {
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
}
```

Adding the replacement files to `files` array in the `tsconfig.app.json` may also be necessary.

```json
{
  "extends": "./tsconfig.json",
  // other config
  "files": ["src/main.ts", "src/main.server.ts", "src/two.ts"]
}
```

# @analogjs/storybook-angular

Integration package for Storybook using Angular & Vite.

> This is a community integration not maintained by the Storybook team. If you have issues,
> file an issue in our [GitHub repo](https://github.com/analogjs/analog/issues).

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

Update the `.storybook/main.ts` file to use the `StorybookConfig` type. Also update the `framework` to use the `@analogjs/storybook-angular` package.

```ts
import { StorybookConfig } from '@analogjs/storybook-angular';

const config: StorybookConfig = {
  // other config, addons, etc.
  framework: {
    name: '@analogjs/storybook-angular',
    options: {
      hmr: true,
    },
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

The Storybook preset uses these options in two different ways:

- `styles` entries are imported into Storybook's generated `preview.ts`, so use this for global stylesheets you want loaded for every story
- `stylePreprocessorOptions.loadPaths` are forwarded to Vite's SCSS preprocessor, so use this for `@use` and `@import` resolution inside your `.scss` files

For Nx workspaces with shared SCSS libraries, keep the paths workspace-relative in `project.json`:

```json
{
  "storybook": {
    "executor": "@analogjs/storybook-angular:start-storybook",
    "options": {
      "configDir": "libs/shared/ui/.storybook",
      "styles": [
        "libs/shared/ui/styles/shared-ui.scss",
        "libs/shared/ui/.storybook/storybook.scss"
      ],
      "stylePreprocessorOptions": {
        "loadPaths": ["libs/shared/ui/styles"]
      }
    }
  }
}
```

Use the `styles` array for real files that should be loaded globally. Use `loadPaths` only to help Sass resolve imports from those files; it does not register a stylesheet by itself.

For third-party package styles, prefer bare package imports such as `katex/dist/katex.css` or `@angular/material/prebuilt-themes/deeppurple-amber.css` over `node_modules/...` paths when the package exports them.

## Using Tailwind CSS

For Vite-based Analog apps, Storybook should register Tailwind using the same `@tailwindcss/vite` plugin used by the app itself.

Keep your global stylesheet in the Storybook `styles` array and add the Tailwind Vite plugin in `.storybook/main.ts` with `viteFinal`:

```ts
import tailwindcss from '@tailwindcss/vite';
import { UserConfig, mergeConfig } from 'vite';

import type { StorybookConfig } from '@analogjs/storybook-angular';

const config: StorybookConfig = {
  // ... other config, addons, etc.
  async viteFinal(config: UserConfig) {
    return mergeConfig(config, {
      plugins: [tailwindcss()],
    });
  },
};

export default config;
```

In your global stylesheet, import Tailwind with:

```css
@import 'tailwindcss';
```

Storybook does not automatically infer the Tailwind plugin from your app's `vite.config.ts`, so add it in `viteFinal` when your stories depend on Tailwind utilities.

Angular HMR is controlled with `framework.options.hmr`. `liveReload` is still accepted as a compatibility alias, but `hmr` is the preferred option.

## Enabling Zoneless Change Detection

To use zoneless change detection for the Storybook, add the `experimentalZoneless` flag to the `@analogjs/storybook-angular` builder options in the `angular.json`.

```json
    "storybook": {
      "builder": "@analogjs/storybook-angular:start-storybook",
      "options": {
        // ... other options
        "experimentalZoneless": true
      }
    },
    "build-storybook": {
      "builder": "@analogjs/storybook-angular:build-storybook",
      "options": {
        // ... other options
        "experimentalZoneless": true
      }
    }
```

For `project.json`

```json
    "storybook": {
      "executor": "@analogjs/storybook-angular:start-storybook",
      "options": {
        // ... other options
        "configDir": "path/to/.storybook",
        "experimentalZoneless": true,
        "compodoc": false
      }
    },
    "build-storybook": {
      "executor": "@analogjs/storybook-angular:build-storybook",
      "options": {
        // ... other options
        "configDir": "path/to/.storybook",
        "experimentalZoneless": true,
        "compodoc": false
      }
    }
```

> Zoneless change detection is the default for new projects starting Angular v21.

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

```shell
npm install vite-tsconfig-paths --save-dev
```

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

`nxViteTsPaths()` only resolves TypeScript path aliases. It does not replace Storybook's `styles` option or SCSS `loadPaths`, so shared Sass setup usually needs all three pieces:

- `styles` for global Storybook stylesheets
- `stylePreprocessorOptions.loadPaths` for Sass import roots
- `nxViteTsPaths()` for TS/Angular library aliases used by your stories and components

If styles still do not load as expected, enable scoped preset logging before running Storybook or the Storybook build:

```sh
DEBUG=analog:storybook:styles,analog:storybook:styles:v npm run storybook
```

This logs the resolved workspace root, SCSS `loadPaths`, and how each `styles` entry was classified:

- `project` when it resolves relative to the Storybook project root
- `workspace` when it resolves from the workspace root
- `bare` when it is left as a package import such as `katex/dist/katex.css`

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

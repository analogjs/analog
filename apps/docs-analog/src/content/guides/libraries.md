import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Building an Angular Library

Angular libraries are built for supporting many different services and functionality. Angular libraries can be built using Vite that can be published to npm.

## Creating a Library

If you are creating a new package, use the `library` schematic:

```sh
ng generate lib my-lib
```

For an existing library, follow the setup instructions.

## Setup

Install the `@analogjs/platform` package:

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

Next, create a `vite.config.ts` at the root of the project, and configure it to build the library.

> Update the references to `my-lib` to match the library project name.

```ts
import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';

export default defineConfig(({ mode }) => ({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/libs/my-lib',
  plugins: [angular()],
  resolve: {
    mainFields: ['module'],
  },
  build: {
    target: ['esnext'],
    sourcemap: true,
    lib: {
      // Library entry point
      entry: 'src/public-api.ts',

      // Package output path, must contain fesm2022
      fileName: `fesm2022/my-lib`,

      // Publish as ESM package
      formats: ['es'],
    },
    rollupOptions: {
      // Add external libraries that should be excluded from the bundle
      external: [/^@angular\/.*/, 'rxjs', 'rxjs/operators'],
      output: {
        // Produce a single file bundle
        preserveModules: false,
      },
    },
    minify: false,
  },
}));
```

Next, update the project configuration to use the `@analogjs/platform:vite` builder to build the library.

```json
{
  "name": "my-lib",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "projects/my-lib/src",
  "prefix": "lib",
  "projectType": "library",
  "architect": {
    "build": {
      "builder": "@analogjs/platform:vite",
      "options": {
        "configFile": "projects/my-lib/vite.config.ts",
        "outputPath": "dist/projects/my-lib"
      },
      "defaultConfiguration": "production",
      "configurations": {
        "development": {
          "mode": "development"
        },
        "production": {
          "sourcemap": true,
          "mode": "production"
        }
      }
    }
  }
}
```

Adjust the `package.json` at the root of the project to point to the built output. Include any necessary `dependencies` or `peerDependencies` that are needed when installing the package.

```json
{
  "name": "my-lib",
  "description": "A description of the Angular library",
  "type": "module",
  "peerDependencies": {
    "@angular/common": "^19.0.0",
    "@angular/core": "^19.0.0"
  },
  "dependencies": {
    "tslib": "^2.0.0"
  },
  "types": "./src/public-api.d.ts",
  "exports": {
    "./package.json": {
      "default": "./package.json"
    },
    ".": {
      "import": "./fesm2022/my-lib.mjs",
      "require": "./fesm2022/my-lib.mjs",
      "default": "./fesm2022/my-lib.mjs"
    }
  },
  "sideEffects": false,
  "publishConfig": {
    "access": "public"
  }
}
```

## Copying Assets

Static assets in the `public` directory are copied to the build output directory by default. If you want to copy additional assets outside of that directory, use the `nxCopyAssetsPlugin` Vite plugin.

Import the plugin and set it up:

```ts
/// <reference types="vitest" />

import { defineConfig } from 'vite';
import analog from '@analogjs/vite-plugin-angular';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // ...
  plugins: [angular(), nxCopyAssetsPlugin(['*.md', 'package.json'])],
}));
```

## Building the Library

Run the build command:

```sh
ng build my-lib
```

## Publishing the Library

After logging using `npm login`, use the `npm publish` command to publish the package.

To see the output without publishing, use the `--dry-run` flag.

```sh
npm publish dist/projects/my-lib --dry-run
```

To publish the library to npm:

```sh
npm publish dist/projects/my-lib
```

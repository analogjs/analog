# @analogjs/vite-plugin-angular

A Vite plugin for building Angular applications

## Install

With npm:

```sh
npm install @analogjs/vite-plugin-angular --save-dev
```

With pnpm:

```sh
pnpm install @analogjs/vite-plugin-angular --save-dev
```

With yarn:

```sh
yarn install @analogjs/vite-plugin-angular --dev
```

With bun:

```sh
bun install @analogjs/vite-plugin-angular --dev
```

## Setup

Add the plugin to the `plugins` array in your Vite config

```ts
import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    mainFields: ['module'],
  },

  plugins: [angular()],
});
```

> The `angular` plugin should be listed **first** in the plugins array.

## Setting up the TypeScript config

The integration needs a `tsconfig.app.json` at the root of the project for compilation.

Create a `tsconfig.app.json` in the root of the project.

```json
{
  "extends": "./tsconfig.json",
  "compileOnSave": false,
  "compilerOptions": {
    "baseUrl": "./",
    "outDir": "./dist/out-tsc",
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "sourceMap": true,
    "declaration": false,
    "downlevelIteration": true,
    "experimentalDecorators": true,
    "moduleResolution": "node",
    "importHelpers": true,
    "noEmit": false,
    "target": "es2020",
    "module": "es2020",
    "lib": ["es2020", "dom"],
    "skipLibCheck": true
  },
  "angularCompilerOptions": {
    "enableI18nLegacyMessageIdFormat": false,
    "strictInjectionParameters": true,
    "strictInputAccessModifiers": true,
    "strictTemplates": true
  },
  "files": [],
  "include": ["src/**/*.ts"]
}
```

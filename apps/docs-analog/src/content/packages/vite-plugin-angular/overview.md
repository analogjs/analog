---
title: Vite
---

# @analogjs/vite-plugin-angular

[![Vite Plugin Registry](https://img.shields.io/badge/vite-plugin--registry-blue?logo=vite)](https://registry.vite.dev/plugin/@analogjs/vite-plugin-angular)

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

## Plugin Options

All options are optional.

| Option                  | Default                                   | Description                                                                                                                                                                                               |
| ----------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tsconfig`              | `tsconfig.app.json`                       | Path to the tsconfig used for compilation, or a function returning it. Libraries default to `tsconfig.lib.json` and tests to `tsconfig.spec.json`.                                                        |
| `workspaceRoot`         | `NX_WORKSPACE_ROOT`, then `process.cwd()` | Absolute path to the workspace root. Set it in monorepos where the app is not the working directory.                                                                                                      |
| `inlineStylesExtension` | `'css'`                                   | Stylesheet language for inline component `styles`, such as `'scss'`. See [CSS Pre-processors](https://analogjs.org/docs/packages/vite-plugin-angular/css-preprocessors).                                  |
| `jit`                   | `true` in tests, `false` otherwise        | Compile components in JIT mode instead of AOT.                                                                                                                                                            |
| `include`               | `[]`                                      | Additional globs, relative to the workspace root, to add to compilation, such as components from a library outside the tsconfig `include`.                                                                |
| `liveReload`            | `true`                                    | Enables Angular component HMR during development. This is separate from Vite's `server.hmr` transport option.                                                                                             |
| `disableTypeChecking`   | `true`                                    | Skips semantic and template diagnostics during compilation. Set to `false` to report type errors from the Vite build.                                                                                     |
| `fileReplacements`      | `[]`                                      | Replaces source files at build time, like `fileReplacements` in `angular.json`. Use `{ replace, with }`, or `{ replace, ssr }` for the SSR build. `with` and `ssr` paths resolve against `workspaceRoot`. |
| `fastCompile`           | `false`                                   | Opts into the [fast compile path](#fast-compile-mode).                                                                                                                                                    |
| `fastCompileMode`       | `'full'`                                  | Output mode for `fastCompile`: `'full'` for apps, `'partial'` for publishing libraries.                                                                                                                   |
| `debug`                 | `false`                                   | Enables `analog:angular:*` debug logging.                                                                                                                                                                 |

```ts
import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';

export default defineConfig(({ mode }) => ({
  plugins: [
    angular({
      inlineStylesExtension: 'scss',
      fileReplacements:
        mode === 'production'
          ? [
              {
                replace: 'src/environments/environment.ts',
                with: 'src/environments/environment.prod.ts',
              },
            ]
          : [],
    }),
  ],
}));
```

## Fast Compile Mode

`fastCompile` opts the plugin into a single-pass compilation path that emits Ivy instructions directly and skips Angular's template type-checking. It's intended for content-focused apps and faster dev iteration where build throughput matters more than inline type-safety feedback.

```ts
export default defineConfig({
  plugins: [angular({ fastCompile: true })],
});
```

When `fastCompile` is enabled, template and input type errors will not surface during compilation. Run `ngc -p tsconfig.app.json --noEmit` as a separate step in your build script to keep full type safety:

```json
{
  "scripts": {
    "build": "ngc -p tsconfig.app.json --noEmit && vite build"
  }
}
```

The fast compile path currently passes ~91% of Angular's conformance suite. Behavior and output may change between minor releases.

## Vendor Sourcemaps

The sourcemaps of dependencies and prebuilt libraries are preserved whenever `build.sourcemap` is enabled.

```ts
export default defineConfig({
  plugins: [angular()],
  build: { sourcemap: true },
});
```

Expect larger sourcemap files, since they now include the mappings for dependency code. The application bundles are unchanged, and builds without `build.sourcemap` are unaffected.

Angular's own packages are compiled through a separate path that always discards their sourcemaps, so mappings are not restored for `@angular/*`.

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

## Tailwind CSS v4

For Angular component styles that use Tailwind utilities like `@apply`, add a `@reference` to your root stylesheet in those component stylesheets and follow the Tailwind guide for Analog:

- https://analogjs.org/docs/integrations/tailwind

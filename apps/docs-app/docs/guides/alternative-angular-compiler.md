import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Using an Alternative Angular Compiler

Analog's `analog()` plugin wires up routing, server rendering, prerendering, Nitro integration, and content features. By default, it also includes the internal `@analogjs/vite-plugin-angular` compiler plugin.

If you want to use a different Angular compiler such as [`@oxc-angular/vite`](https://www.npmjs.com/package/@oxc-angular/vite), disable the internal compiler with `vite: false` and register the replacement plugin yourself.

## Install the compiler plugin

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm install @oxc-angular/vite --save-dev
```

  </TabItem>

  <TabItem label="Yarn" value="yarn">

```shell
yarn add @oxc-angular/vite --dev
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm install -w @oxc-angular/vite --save-dev
```

  </TabItem>
</Tabs>

## Basic setup

Update your app's `vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';
import angular from '@oxc-angular/vite';

export default defineConfig(() => ({
  plugins: [
    analog({
      vite: false,
    }),
    angular(),
  ],
}));
```

With this setup, Analog still provides its platform features, but Angular compilation is delegated to `@oxc-angular/vite`.

## What still works

Setting `vite: false` does **not** disable Analog itself. The rest of the platform plugin chain still runs, including:

- file-based routing
- SSR and static generation
- Nitro integration
- route generation
- content processing

## Which `analog()` options are ignored

When `vite: false` is set, Analog no longer forwards Angular-specific top-level options to the internal compiler plugin.

These `analog()` options are ignored in that mode:

- `jit`
- `disableTypeChecking`
- `liveReload`
- `inlineStylesExtension`
- `fileReplacements`
- `include`

If your replacement compiler supports equivalent options, configure them on that compiler plugin instead of on `analog()`.

For example, `@oxc-angular/vite` supports its own `fileReplacements` option:

```ts
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';
import angular from '@oxc-angular/vite';

export default defineConfig(({ mode }) => ({
  plugins: [
    analog({
      vite: false,
    }),
    angular({
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

## Nx workspaces

If you are using Analog inside an Nx workspace, add explicit Vite path resolution when your project depends on workspace TypeScript path aliases:

```ts
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';
import angular from '@oxc-angular/vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

export default defineConfig(() => ({
  plugins: [
    analog({
      vite: false,
    }),
    angular(),
    nxViteTsPaths(),
  ],
}));
```

## Testing with Vitest

`vite: false` only changes how Angular compilation is provided for your Vite app config. It does not automatically add the Vitest-specific helpers that come from `@analogjs/vite-plugin-angular`.

If you are using Vitest, configure test support separately. For Angular tests, use [`@analogjs/vitest-angular`](/docs/features/testing/vitest) as your test integration.

## When to use this

This setup is a good fit when:

- you want to experiment with a faster Angular compiler plugin
- you want to keep Analog's routing and server features while swapping the Angular compiler
- you are comfortable managing compiler-specific options directly in `vite.config.ts`

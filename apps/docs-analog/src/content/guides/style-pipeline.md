---
title: 'Style Pipeline'
---

Analog exposes a minimal `experimental.stylePipeline` surface so community
packages can integrate generated CSS and design-token workflows without
requiring Analog core to own those engines directly.

This is intentionally narrow:

- Analog owns the top-level framework config surface
- Analog owns the Angular stylesheet-resource seam
- community packages own the actual Vite plugins and token engines
- Tailwind, Panda, Tokiforge, Style Dictionary, and library-specific bridges
  stay outside `@analogjs/platform`

## Configure Analog

```ts
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';
import { stylePipeline } from '@snyder-tech/bdx-analog-style-pipeline-vite';

export default defineConfig({
  plugins: [
    analog({
      experimental: {
        stylePipeline: {
          plugins: [
            stylePipeline({
              configFile: 'style-pipeline.config.ts',
            }),
          ],
          angularPlugins: [
            {
              name: 'community-style-pipeline-angular',
              preprocessStylesheet(code, context) {
                return code;
              },
            },
          ],
        },
      },
    }),
  ],
});
```

## Strongly typed plugin lists

Use `defineStylePipelinePlugins()` when you want a typed helper around the
plugins you hand to Analog.

```ts
import { defineStylePipelinePlugins } from '@analogjs/platform';

const plugins = defineStylePipelinePlugins([
  stylePipeline({
    configFile: 'style-pipeline.config.ts',
  }),
]);
```

## Plugin factories

If a community plugin needs the resolved workspace root, pass a factory.
Analog will call it with a small context object.

```ts
import analog from '@analogjs/platform';
import { stylePipeline } from '@snyder-tech/bdx-analog-style-pipeline-vite';

analog({
  experimental: {
    stylePipeline: {
      plugins: [
        ({ workspaceRoot }) =>
          stylePipeline({
            workspaceRoot,
            configFile: 'style-pipeline.config.ts',
          }),
      ],
    },
  },
});
```

## Angular stylesheet hooks

`angularPlugins` is the framework-owned part of the contract.

Use it when a community package needs to participate in:

- Angular component stylesheet preprocessing
- Angular resource-aware stylesheet HMR behavior
- access to the live Angular stylesheet registry used for externalized styles

That is the seam a standalone Vite plugin does not own on its own.

```ts
analog({
  experimental: {
    stylePipeline: {
      angularPlugins: [
        {
          name: 'community-style-pipeline-angular',
          preprocessStylesheet(code, context) {
            if (context.inline) {
              return code;
            }

            return {
              code: `/* ${context.filename} */\n${code}`,
              dependencies: [
                {
                  id: 'virtual:brandos/tailwind.css',
                  kind: 'bridge',
                },
              ],
              diagnostics: [
                {
                  severity: 'warning',
                  code: 'tailwind-reference',
                  message: 'Injected shared Tailwind bridge reference.',
                },
              ],
              tags: ['tailwind'],
            };
          },
          configureStylesheetRegistry(registry, { workspaceRoot }) {
            void registry;
            void workspaceRoot;
          },
        },
      ],
    },
  },
});
```

The stylesheet transform context is strongly typed and includes:

- `filename`
- `containingFile`
- `resourceFile`
- `className`
- `order`
- `inline`

Angular-side preprocessors can return either a string or a structured result
with:

- `code`
- `dependencies`
- `diagnostics`
- `tags`

Analog tracks that metadata in the live stylesheet registry so HMR diagnostics
and community plugins can reason about which generated bridges, token manifests,
or runtime theme resources a component stylesheet depends on.

## Vite plugin interop with `analog.setup`

A community package does not need Analog config to reach the Angular
stylesheet seam. Any ordinary Vite plugin can expose an `analog` hook, and
`@analogjs/vite-plugin-angular` discovers it from the resolved plugin list
before the first Angular compilation. This follows the Nitro model: the Vite
plugin stays the public extension unit, and Analog only owns the small setup
context.

```ts
import type { AnalogIntegrationPlugin } from '@analogjs/vite-plugin-angular';

export function tokens(): AnalogIntegrationPlugin {
  return {
    name: 'vite-plugin-tokens',
    transform(code, id) {
      // regular Vite behavior
    },
    analog: {
      setup(ctx) {
        ctx.registerStylePreprocessor((code, filename, context) => {
          if (context?.inline) {
            return code;
          }

          return {
            code: `@import "virtual:tokens.css";\n${code}`,
            dependencies: [{ id: 'virtual:tokens.css', kind: 'bridge' }],
          };
        });
      },
    },
  };
}
```

Users add the plugin to `plugins: [...]` like any other Vite plugin. No extra
`analog()` option is required.

How the hook behaves:

- Discovery is structural. Analog checks `plugin.analog?.setup` on each
  resolved plugin; the exported types are optional.
- Preprocessors run in Vite plugin order, so `enforce: 'pre'` and
  `enforce: 'post'` decide the pipeline order. Plugin-registered preprocessors
  run first, followed by the chain configured through `angular()` options
  (`tailwindCss`, `stylePipeline.angularPlugins`, `stylePreprocessor`), and
  then Vite's own `preprocessCSS` pipeline.
- Plugin-registered preprocessors apply to the ngtsc, Angular Compilation
  API, and JIT inline stylesheet paths.
- A preprocessor error is rethrown with the plugin name and stylesheet path so
  the failing integration is easy to identify.
- `externalizeComponentStyles()` asks Analog to serve component styles as
  Vite modules in dev and watch mode instead of inlining them through
  `preprocessCSS`. Call it when your stylesheet output depends on a Vite CSS
  plugin such as `@tailwindcss/vite` rather than PostCSS. Production builds
  keep inlining component styles, and `tailwindCss` on `angular()` sets the
  same flag.
- `AnalogPluginContext` exposes `registerStylePreprocessor` and
  `externalizeComponentStyles` today. It grows when a concrete integration
  needs another seam.

## Scope

This API is intentionally generic. It does not make Analog responsible for:

- Style Dictionary dependencies
- Panda config/codegen semantics
- Tokiforge runtime theming
- PrimeNG, Spartan, daisyUI, MUI, or other library-specific target contracts

Those should remain in community-maintained packages unless real usage later
proves Analog needs a smaller generic hook.

## Debugging

Use these debug scopes when experimenting with community style-pipeline
integrations:

```sh
DEBUG=analog:platform:style-pipeline,analog:angular:style-pipeline pnpm nx serve your-app
```

`analog:platform:style-pipeline` is the platform-side namespace for this
integration surface.
`analog:angular:style-pipeline` covers Angular-side diagnostics, including
which Vite plugins registered preprocessors through `analog.setup`.

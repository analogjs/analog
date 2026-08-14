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
`analog:angular:style-pipeline` is reserved for Angular-side diagnostics if
future integrations need them.

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

## Vite plugin interop with `analog.setup`

The Angular stylesheet seam is the part of the contract a standalone Vite
plugin cannot own on its own: component stylesheet preprocessing,
resource-aware stylesheet HMR, and the live stylesheet registry used for
externalized styles. Any ordinary Vite plugin reaches it by exposing an
`analog` hook, and `@analogjs/vite-plugin-angular` discovers it from the
resolved plugin list before the first Angular compilation. This follows the
Nitro model: the Vite plugin stays the public extension unit, and Analog only
owns the small setup context.

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
            diagnostics: [
              {
                severity: 'warning',
                code: 'tokens-bridge',
                message: 'Injected the shared tokens bridge.',
              },
            ],
            tags: ['tokens'],
          };
        });
        ctx.configureStylesheetRegistry((registry, { workspaceRoot }) => {
          // registry.getDependenciesForSource(sourcePath), ...
        });
      },
    },
  };
}
```

Users add the plugin to `plugins: [...]` like any other Vite plugin. No extra
`analog()` option is required.

The stylesheet transform context is strongly typed and includes:

- `filename`
- `containingFile`
- `resourceFile`
- `className`
- `order`
- `inline`

Preprocessors can return either a string or a structured result with:

- `code`
- `dependencies`
- `diagnostics`
- `tags`

Analog tracks that metadata in the live stylesheet registry so HMR diagnostics
and community plugins can reason about which generated bridges, token manifests,
or runtime theme resources a component stylesheet depends on.

How the hook behaves:

- Discovery is structural. Analog checks `plugin.analog?.setup` on each
  resolved plugin; the exported types are optional.
- Preprocessors run in Vite plugin order, so `enforce: 'pre'` and
  `enforce: 'post'` decide the pipeline order. Plugin-registered preprocessors
  run first, followed by the `stylePreprocessor` configured on `angular()`,
  and then Vite's own `preprocessCSS` pipeline.
- Plugin-registered preprocessors apply to the ngtsc, Angular Compilation
  API, and JIT inline stylesheet paths.
- A preprocessor error is rethrown with the plugin name and stylesheet path so
  the failing integration is easy to identify.
- `externalizeComponentStyles()` asks Analog to serve component styles as
  Vite modules in dev and watch mode instead of inlining them through
  `preprocessCSS`. Call it when your stylesheet output depends on a Vite CSS
  plugin such as `@tailwindcss/vite` rather than PostCSS. Production builds
  keep inlining component styles.
- `configureStylesheetRegistry()` receives the live stylesheet registry each
  time a compilation creates one. The registry maps a component stylesheet
  source to its served ids, request ids, dependencies, diagnostics, and tags.
- `AnalogPluginContext` exposes `registerStylePreprocessor`,
  `externalizeComponentStyles`, and `configureStylesheetRegistry` today. It
  grows when a concrete integration needs another seam.

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

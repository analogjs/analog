---
title: 'Style Pipeline'
---

Community packages integrate generated CSS and design-token workflows with
Analog as ordinary Vite plugins. Analog does not own those engines directly.

This is intentionally narrow:

- Analog owns the Angular stylesheet-resource seam
- community packages own the actual Vite plugins and token engines
- Tailwind, Panda, Tokiforge, Style Dictionary, and library-specific bridges
  stay outside `@analogjs/platform`

## Reach Angular through `analog.setup`

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
  run first, followed by Vite's own `preprocessCSS` pipeline.
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
- `registerTransformFilter()` restricts which modules Angular compiles. A
  module is transformed only when every registered filter accepts it, which
  keeps Angular away from files owned by another framework integration.
- `registerComponentRegistry()` hands the fast compiler directive, component,
  pipe, and NgModule metadata keyed by class name for classes it cannot reach
  through its own tsconfig scan, such as components compiled from another
  source format. The map is read on every compile.
- `addInclude()` adds TypeScript include globs to the Angular compilation,
  resolved against the same workspace root as `angular({ include })`.
  `@analogjs/platform` uses it to compile pages from `additionalPagesDirs`.
- `AnalogPluginContext` exposes `registerStylePreprocessor`,
  `externalizeComponentStyles`, `configureStylesheetRegistry`,
  `registerTransformFilter`, `registerComponentRegistry`, and `addInclude`
  today. It grows when a concrete integration needs another seam.

## Scope

This API is intentionally generic. It does not make Analog responsible for:

- Style Dictionary dependencies
- Panda config/codegen semantics
- Tokiforge runtime theming
- PrimeNG, Spartan, daisyUI, MUI, or other library-specific target contracts

Those should remain in community-maintained packages unless real usage later
proves Analog needs a smaller generic hook.

## Debugging

Use this debug scope when experimenting with community style-pipeline
integrations:

```sh
DEBUG=analog:angular:style-pipeline pnpm nx serve your-app
```

`analog:angular:style-pipeline` covers Angular-side diagnostics, including
which Vite plugins registered preprocessors through `analog.setup`.

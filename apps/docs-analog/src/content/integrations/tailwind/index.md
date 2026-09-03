# Tailwind CSS v4

Analog does not replace Tailwind's installation guides. Start with one Tailwind setup that matches your project:

- [Install Tailwind with Vite](https://tailwindcss.com/docs/installation/using-vite)
- [Install Tailwind with PostCSS](https://tailwindcss.com/docs/installation/using-postcss)
- [Install Tailwind with Angular](https://tailwindcss.com/docs/installation/framework-guides/angular)

Once Tailwind is installed, the Angular-specific part is making Tailwind utilities available inside component styles.

## Component Styles

Angular compiles component styles in isolation. When a component stylesheet uses `@apply` or other Tailwind utilities, Tailwind still needs access to the root stylesheet that defines your theme, prefixes, and plugins. Add a `@reference` to that root stylesheet at the top of the component stylesheet, as described in [Tailwind's Angular guide](https://tailwindcss.com/docs/installation/framework-guides/angular):

```css
@reference '../styles.css';

.card {
  @apply rounded-lg p-4;
}
```

Use a path that resolves from the stylesheet file. Inline `styles` in the component decorator have no file location, so prefer external `styleUrl` files for component styles that use `@apply`.

If you only use Tailwind utilities in templates and a global stylesheet, no `@reference` is needed.

## Root Stylesheet

In `src/styles.css`:

```css
@import 'tailwindcss';
```

You can keep your theme, `@source`, plugins, and prefixes there as well:

```css
@import 'tailwindcss' prefix(tw);

@source './src';

@theme {
  --color-primary: #3b82f6;
}
```

## Automating `@reference` injection

A Vite plugin can inject `@reference` into component styles for you through the `analog.setup()` hook. Register a style preprocessor that prepends the directive, and call `externalizeComponentStyles()` so `@tailwindcss/vite` processes those styles during development:

```ts
import type { AnalogIntegrationPlugin } from '@analogjs/vite-plugin-angular';

export function angularTailwind(
  rootStylesheet: string,
): AnalogIntegrationPlugin {
  const inject = (code: string) =>
    code.includes('@apply') && !/^\s*@reference\b/m.test(code)
      ? `@reference "${rootStylesheet}";\n${code}`
      : code;

  return {
    name: 'angular-tailwind',
    enforce: 'pre',
    analog: {
      setup(ctx) {
        ctx.registerStylePreprocessor(inject);
        ctx.externalizeComponentStyles();
      },
    },
  };
}
```

Use an absolute `rootStylesheet` path here. Externalized component styles are served through virtual stylesheet ids during dev, so relative `@reference` paths are not reliable from a preprocessor. See the [Style Pipeline guide](/docs/guides/style-pipeline) for the full `analog.setup()` contract.

## HMR

Use `liveReload` when you need to configure Analog's Angular live-reload behavior explicitly.

Vite's `server.hmr` option is separate. It controls the HMR websocket transport, so you can use `server.hmr` together with `liveReload` when your dev server needs custom host, port, or path settings.

Angular HMR requires Angular v19 or newer. On Angular v17-v18, `liveReload` is intentionally disabled at runtime and emits a console warning, so HMR is unavailable on those versions. For broader migration guidance, see the [migration guide](/docs/guides/migrating).

Tailwind support does not require you to enable HMR manually. The stylesheet pipeline is handled independently from whether Angular can produce a hot component update for a given edit.

## Generated Apps

Current `create-analog` and Nx app scaffolds already:

- import Tailwind in `src/styles.css`
- register Tailwind in `vite.config.ts`
- keep the generated Vite plugin order aligned with the current Analog templates

Some templates may also include additional Tailwind tooling config files. Treat the generated scaffold as your project default, and only diverge after validating your own dev and build behavior.

## Related

- [Using CSS Pre-processors](/docs/packages/vite-plugin-angular/css-preprocessors)
- [create-analog](/docs/packages/create-analog/overview)

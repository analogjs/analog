# Tailwind CSS v4

Analog does not replace Tailwind's installation guides. Start with one Tailwind setup that matches your project:

- [Install Tailwind with Vite](https://tailwindcss.com/docs/installation/using-vite)
- [Install Tailwind with PostCSS](https://tailwindcss.com/docs/installation/using-postcss)
- [Install Tailwind with Angular](https://tailwindcss.com/docs/installation/framework-guides/angular)

Once Tailwind is installed, Analog adds the Angular-specific part: component stylesheet handling for `@apply` and Tailwind-aware `@reference` injection.

## What Analog adds

Use Analog's `tailwindCss.rootStylesheet` option when you want Tailwind utilities inside Angular component styles.

That option lets Analog:

- detect component stylesheets that use Tailwind utilities
- inject the correct `@reference` to your root stylesheet
- keep component styles aligned with your root Tailwind theme, prefixes, and plugins
- avoid manual `@reference` directives in every component stylesheet

If you only use Tailwind utilities in templates and a global stylesheet, you can follow Tailwind's install docs and keep your generated scaffold defaults without adding extra Analog configuration.

## Component Styles Setup

When you enable `tailwindCss.rootStylesheet`, keep Tailwind wired through Vite for the component stylesheet path:

```ts
/// <reference types="vitest" />

import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(() => ({
  plugins: [
    analog({
      vite: {
        tailwindCss: {
          rootStylesheet: resolve(__dirname, 'src/styles.css'),
        },
      },
    }),
    tailwindcss(),
  ],
}));
```

If you are using `@analogjs/vite-plugin-angular` directly instead of `@analogjs/platform`, the same option lives on the Angular plugin:

```ts
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(() => ({
  plugins: [
    angular({
      tailwindCss: {
        rootStylesheet: resolve(__dirname, 'src/styles.css'),
      },
    }),
    tailwindcss(),
  ],
}));
```

List `analog()` before `tailwindcss()` in your Vite config. Current generators now scaffold that order.

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

Use an absolute `rootStylesheet` path. Analog may serve component styles through virtual stylesheet ids during dev, so relative `@reference` paths are not reliable there.

## How Component Styles Work

Angular compiles component styles in isolation. When a component stylesheet contains `@apply`, Tailwind still needs access to the root stylesheet that defines prefixes, theme values, and plugins.

Analog handles that by:

- detecting Tailwind usage in component CSS
- injecting `@reference` to the configured root stylesheet
- routing those component styles through the Vite CSS pipeline when needed

That means you should not manually add `@reference` to every component stylesheet in the normal setup.

## Prefixes

If your component styles use custom-prefixed utilities, configure `prefixes` so Analog knows which stylesheets need Tailwind `@reference` injection:

```ts
analog({
  vite: {
    tailwindCss: {
      rootStylesheet: resolve(__dirname, 'src/styles.css'),
      prefixes: ['tw:'],
    },
  },
});
```

Without `prefixes`, Analog falls back to its default Tailwind usage detection for component styles.

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

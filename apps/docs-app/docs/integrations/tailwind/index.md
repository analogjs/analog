# Tailwind CSS v4

Analog supports Tailwind CSS v4 for both:

- utility classes in templates
- `@apply` inside Angular component styles

The supported v3 `alpha` setup is:

1. keep one root stylesheet such as `src/styles.css`
2. put `@import 'tailwindcss';` in that stylesheet
3. enable `@tailwindcss/vite` in `vite.config.ts`
4. keep a `postcss.config.mjs` with `@tailwindcss/postcss`
5. configure Analog with `tailwindCss.rootStylesheet`

Generated apps already follow this shape.

## Install

```sh
npm install -D tailwindcss @tailwindcss/vite @tailwindcss/postcss postcss
```

## Vite Config

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

Use an absolute `rootStylesheet` path. Analog may serve component styles through virtual stylesheet ids during dev, so relative `@reference` paths are not reliable there.

If you are using `@analogjs/vite-plugin-angular` directly instead of `@analogjs/platform`, the same Tailwind option lives on the Angular plugin itself:

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

## PostCSS Config

Create `postcss.config.mjs`:

```js
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
```

Keep this even if dev already works with `@tailwindcss/vite`. Current Analog builds still rely on the PostCSS path for production CSS processing.

## How Component Styles Work

Angular compiles component styles in isolation. When a component stylesheet contains `@apply`, Tailwind still needs access to the root stylesheet that defines prefixes, theme values, and plugins.

Analog handles that by:

- detecting Tailwind usage in component CSS
- injecting the correct `@reference` to the configured root stylesheet
- externalizing component styles during dev when needed so they flow through Vite's CSS pipeline
- preserving the build path through PostCSS for production

That means you should not manually add `@reference` to every component stylesheet in the normal setup.

## Plugin Order

List `analog()` before `tailwindcss()` in your Vite config. That is now how the generators scaffold it.

```ts
plugins: [analog({ vite: { tailwindCss: { ... } } }), tailwindcss()];
```

This keeps the config aligned with the generated apps and the current documentation.

## HMR

Prefer `hmr` over `liveReload` when you need to configure Angular HMR explicitly. `liveReload` remains a compatibility alias.

Tailwind support does not require you to enable HMR manually. The stylesheet pipeline is handled independently from whether Angular can produce a hot component update for a given edit.

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

## Generated Apps

Current `create-analog` and Nx app scaffolds both generate:

- `@import 'tailwindcss';` in `src/styles.css`
- `@tailwindcss/vite` in `vite.config.ts`
- `postcss.config.mjs` with `@tailwindcss/postcss`

If you start from a generated app, keep that structure unless you have a specific reason to diverge from the supported path.

## Related

- [Using CSS Pre-processors](/docs/packages/vite-plugin-angular/css-preprocessors)
- [create-analog](/docs/packages/create-analog/overview)

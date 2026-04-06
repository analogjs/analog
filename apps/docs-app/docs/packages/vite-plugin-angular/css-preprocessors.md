---
title: 'Using CSS Pre-processors'
---

The Vite Plugin supports CSS pre-processing using external `styleUrls` and inline `styles` in the Component decorator metadata.

## Recommended Tailwind v4 setup

If your app uses Tailwind v4, keep the supported Analog setup:

- keep a single root stylesheet such as `src/styles.css`
- put `@import 'tailwindcss';` in that root stylesheet
- keep `@tailwindcss/vite` enabled in `vite.config.ts`
- keep `postcss.config.mjs` with `@tailwindcss/postcss`
- configure Analog with `tailwindCss.rootStylesheet`

This lets Analog preprocess component stylesheets and inject the correct `@reference` directive automatically for component CSS that uses Tailwind utilities.

For the complete setup and Tailwind-specific guidance, see the [Tailwind CSS integration guide](/docs/integrations/tailwind).

```ts
/// <reference types="vitest" />

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
      hmr: true,
    }),
    tailwindcss(),
  ],
}));
```

And in `src/styles.css`:

```css
@import 'tailwindcss';
```

And in `postcss.config.mjs`:

```js
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
```

Use an absolute path for `rootStylesheet`. Analog serves some component styles through virtual stylesheet ids during dev, so relative `@reference` paths are not reliable there.

You only need `tailwindCss.prefixes` when your component styles use custom-prefixed utilities and you want Analog to look for those prefixes instead of the default `@apply` detection.

External `styleUrls` can be used without any additional configuration.

An example with `styleUrls`:

```ts
import { Component } from '@angular/core';

@Component({
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent {}
```

In order to support pre-processing of inline `styles`, configure the plugin with the `inlineStylesExtension` for the style language being used.

An example of using `scss` with inline `styles`:

```ts
import { Component } from '@angular/core';

@Component({
  templateUrl: './app.component.html',
  styles: [
    `
      $neon: #cf0;

      @mixin background($color: #fff) {
        background: $color;
      }

      h2 {
        @include background($neon);
      }
    `,
  ],
})
export class AppComponent {}
```

In `vite.config.ts`, pass an object to the `angular` plugin with `inlineStylesExtension` set to the CSS pre-processing file extension.

```ts
import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  return {
    // ... other config
    plugins: [
      angular({
        inlineStylesExtension: 'scss',
      }),
    ],
  };
});
```

Support CSS pre-processor extensions include `scss`, `sass` and `less`. More information about CSS pre-processing can be found in the [Vite Docs](https://vitejs.dev/guide/features.html#css-pre-processors).

## Combining Tailwind and another style preprocessor

If you use Tailwind and a custom stylesheet preprocessor together, keep Tailwind configured through `tailwindCss.rootStylesheet` and then add the other preprocessing options you need. Analog chains those steps in the right order for component styles.

---
title: 'Using CSS Pre-processors'
---

The Vite Plugin supports CSS pre-processing using external `styleUrls` and inline `styles` in the Component decorator metadata.

## Tailwind v4 component styles

Tailwind installation itself should follow Tailwind's docs. The Analog-specific configuration below is for Angular component styles that use Tailwind utilities such as `@apply`.

- keep a single root stylesheet such as `src/styles.css`
- put `@import 'tailwindcss';` in that root stylesheet
- keep `@tailwindcss/vite` enabled in `vite.config.ts`
- configure Analog with `tailwindCss.rootStylesheet`

This lets Analog preprocess component stylesheets and inject the correct `@reference` directive automatically for component CSS that uses Tailwind utilities.

For the broader Tailwind + Analog overview, see the [Tailwind CSS guide](/docs/integrations/tailwind).

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
      liveReload: true,
    }),
    tailwindcss(),
  ],
}));
```

And in `src/styles.css`:

```css
@import 'tailwindcss';
```

Use an absolute path for `rootStylesheet`. Analog serves some component styles through virtual stylesheet ids during dev, so relative `@reference` paths are not reliable there.

Use `liveReload` to control Analog's Angular reload behavior. Vite's top-level `server.hmr` option remains available when you need to configure the HMR websocket transport separately.

You only need `tailwindCss.prefixes` when your component styles use custom-prefixed utilities and you want Analog to look for those prefixes instead of the default `@apply` detection.

If you only use Tailwind utilities in templates and a global stylesheet, you can keep your Tailwind install path and skip `tailwindCss.rootStylesheet`.

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

---
title: 'Using CSS Pre-processors'
---

The Vite Plugin supports CSS pre-processing using external `styleUrls` and inline `styles` in the Component decorator metadata.

External `styleUrls` can be used without any additional configuration.

An example with `styleUrls`:

```ts
import { Component } from '@angular/core';

@Component({
  standalone: true,
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent {}
```

In order to support pre-processing of inline `styles`, the plugin must be configured to provide the extension of the type of styles being used.

An example of using `scss` with inline `styles`:

```ts
import { Component } from '@angular/core';

@Component({
  standalone: true,
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

In the `vite.config.ts`, provide and object to the `angular` plugin function with the `inlineStylesExtension` property set to the CSS pre-processing file extension.

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

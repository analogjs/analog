---
title: 'Using CSS Pre-processors'
---

The Vite Plugin supports CSS pre-processing using external `styleUrls` and inline `styles` in the Component decorator metadata.

## Tailwind v4 component styles

Tailwind installation itself should follow Tailwind's docs. For Angular component styles that use Tailwind utilities such as `@apply`, add a `@reference` to your root stylesheet at the top of the component stylesheet:

```css
@reference '../styles.css';

.card {
  @apply rounded-lg p-4;
}
```

For the broader Tailwind + Analog overview, including automated `@reference` injection through `analog.setup()`, see the [Tailwind CSS guide](/docs/integrations/tailwind).

External `styleUrls` can be used without any additional configuration.

An example with `styleUrls`:

```ts
@Component({
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent {}
```

In order to support pre-processing of inline `styles`, configure the plugin with the `inlineStylesExtension` for the style language being used.

An example of using `scss` with inline `styles`:

```ts
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

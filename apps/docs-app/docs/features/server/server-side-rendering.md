# Server Side Rendering

Analog supports server-side rendering during development and building for production.

## Transforming Packages for SSR Compatibility

Some dependencies may need additional transforms to work for server-side rendering. If you receive an error during SSR in development, one option is to add the package(s) to the `ssr.noExternal` array in the Vite config.

You can use glob patterns to include sets of packages or libraries. Some examples are listed below.

```ts
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  ssr: {
    noExternal: [
      'apollo-angular', // npm package import
      'apollo-angular/**', // npm package import along with sub-packages
      '@spartan-ng/**', // libs under the npmScope inside an Nx workspace
    ],
  },
  // ...other config
}));
```

For more information about externals with SSR, check out the [Vite documentation](https://vitejs.dev/guide/ssr.html#ssr-externals).

## Disabling SSR

SSR is enabled by default. You can opt-out of it and generate a client-only build by adding the following option to the `analog()` plugin in your `vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // ...other config
  plugins: [analog({ ssr: false })],
}));
```

## Prerendering routes

With SSR, the `"/"` route is prerendered by default.

It is a necessary step to return a rendered HTML when the user visits the root of the application. The prerendered routes can be customized, but keep in mind to include the `"/"` route also.

```js
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';
// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // ...other config
  plugins: [
    analog({
      prerender: {
        routes: ['/', '/about'],
      },
    }),
  ],
}));
```

You can opt out of prerendering by passing an empty array of routes.

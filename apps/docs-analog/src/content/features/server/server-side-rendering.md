# Server Side Rendering

Analog supports server-side rendering during development and building for production.

## Rendering failures

An unhandled Angular navigation or resolver error rejects `render()`.
The application is disposed, and Analog's Nitro adapter returns a generic HTML
error document. An integer `statusCode` or `status` between 400 and 599 is
preserved; other values produce HTTP 500. The response has `Cache-Control:
no-store` and `X-Robots-Tag: noindex`, and contains no exception details or
client bootstrap scripts. The original error remains available in server logs.

For example, a product resolver can report a missing product:

```ts
export const routeMeta: RouteMeta = {
  resolve: {
    product: async (route) => {
      const product = await getProduct(route.paramMap.get('id'));
      if (!product) {
        throw Object.assign(new Error('Product was not found'), {
          statusCode: 404,
        });
      }
      return product;
    },
  },
};
```

Navigation errors handled by Angular's `withNavigationErrorHandler` and a
successful redirect render the destination normally. Failure state belongs to
one render and does not affect a concurrent request.

## Built server entries

The Nitro adapter reads the emitted SSR service from the Vite server build. It
recognizes `main.server.mjs`, `main.server.js`, `index.mjs`, and `index.js` in
that order, or a single custom `.js`/`.mjs` entry. Missing output and ambiguous
custom entries fail the build with the directory and candidate names. Source
maps are not entries.

For Worker presets, Analog respects Nitro's `node: false` or `noExternals: true`
dependency policy. Node-specific externalization remains enabled for Node
targets; this does not make Node-only application dependencies Worker-compatible.

Cloudflare Module and Durable Worker presets also retain Nitro's separate server
and public asset directories. Use the generated Wrangler configuration when
deploying them. Cloudflare Pages keeps its `_worker.js` convention; that Pages
layout must not be applied to Module Workers because their asset uploader would
include server files.

## Transforming Packages for SSR Compatibility

Some dependencies may need additional transforms to work for server-side rendering. If you receive an error during SSR in development, one option is to add the package(s) to the `ssr.noExternal` array in the Vite config.

You can use glob patterns to include sets of packages or libraries. Some examples are listed below.

```ts
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

## Hybrid Rendering with Client-Only Routes

SSR is enabled by default. For a hybrid approach, you can specify some routes to only be rendered client-side, and not be server side rendered. This is done through the `routeRules` configuration object by specifying an `ssr` option.

In Analog v3, configure these rules on the separate Nitro plugin. A more specific
`ssr: true` rule enables server rendering under a parent rule that disables it.

```ts
// https://vitejs.dev/config/
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';
import angular from '@analogjs/vite-plugin-angular';
import { nitro } from 'nitro/vite';

export default defineConfig(({ mode }) => ({
  // ...other config
  plugins: [
    analog({
      prerender: {
        routes: ['/', '/404.html'],
      },
    }),
    angular(),
    nitro({
      routeRules: {
        // All admin URLs are only rendered on the client
        '/admin/**': { ssr: false },

        // A specific child can opt back into server rendering
        '/admin/help': { ssr: true },

        // Render a 404 page as a fallback page
        '/404.html': { ssr: false },
      },
    }),
  ],
}));
```

## Disabling SSR

You can opt-out of it and generate a client-only build by adding the following option to the `analog()` plugin in your `vite.config.ts`:

```ts
// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // ...other config
  plugins: [
    analog({
      ssr: false,
      prerender: {
        routes: [],
      },
    }),
  ],
}));
```

## Prerendering routes

With SSR, the `"/"` route is prerendered by default.

It is a necessary step to return a rendered HTML when the user visits the root of the application. The prerendered routes can be customized, but keep in mind to include the `"/"` route also.

```js
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

## Advanced Code Splitting (Vite 8+ / Rolldown)

When using Vite 8+ with Rolldown as the bundler, you can control how client-side chunks are created by passing `codeSplitting` through the `vite.build.rolldownOptions.output` config path. This is useful for further optimizing bundle sizes by grouping vendor or shared modules into separate chunks.

```ts
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // ...other config
  plugins: [analog()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          minSize: 10000,
          groups: [
            {
              name: 'vendor',
              test: /node_modules/,
              priority: 10,
            },
          ],
        },
      },
    },
  },
}));
```

### Code Splitting Options

| Option    | Type     | Description                                  |
| --------- | -------- | -------------------------------------------- |
| `groups`  | `array`  | Define custom chunk groups                   |
| `minSize` | `number` | Minimum chunk size in bytes before splitting |
| `maxSize` | `number` | Maximum chunk size in bytes                  |

### Code Splitting Group Options

| Option          | Type                           | Description                                                 |
| --------------- | ------------------------------ | ----------------------------------------------------------- |
| `name`          | `string \| function`           | Chunk name or function returning a chunk name               |
| `test`          | `RegExp \| string \| function` | Pattern or predicate used to match module IDs for the group |
| `priority`      | `number`                       | Priority when a module matches multiple groups              |
| `minSize`       | `number`                       | Minimum size for this group's chunks                        |
| `maxSize`       | `number`                       | Maximum size for this group's chunks                        |
| `minShareCount` | `number`                       | Minimum number of chunks sharing a module before splitting  |

> This option only applies when using Rolldown as the bundler (Vite 8+). It has no effect with Rollup-based builds.

You can opt-out of prerendering altogether by passing an empty array of routes.

```js
// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // ...other config
  plugins: [
    analog({
      ssr: true,
      prerender: {
        routes: async () => {
          return [];
        },
      },
    }),
  ],
}));
```

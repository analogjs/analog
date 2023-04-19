# Building Static Sites

Analog supports Static Site Generation when building for deployment. This includes prerendering provided routes to static HTML files along with the client-side application.

## Static Site Generation

To prerender pages, use the `prerender` property to configure routes to be rendered at build time. The routes to be prerendered can be provided asynchronously also.

```ts
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    analog({
      prerender: {
        routes: async () => [
          '/',
          '/about',
          '/blog',
          '/blog/posts/2023-02-01-my-first-post',
        ],
      },
    }),
  ],
}));
```

To only prerender the static pages, use the `static: true` flag.

```ts
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    analog({
      static: true,
      prerender: {
        routes: async () => [
          '/',
          '/about',
          '/blog',
          '/blog/posts/2023-02-01-my-first-post',
        ],
      },
    }),
  ],
}));
```

The static pages can be deployed from the `dist/analog/public` directory.

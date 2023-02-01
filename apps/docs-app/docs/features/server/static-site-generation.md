# Building Static Sites

Analog supports Static Site Generation when building for deployment.

To prerender pages, enable SSR, and use the `prerender` property to configure routes to be rendered at build time. The routes to be prerendered can be provided asynchronously also.

This alsos produce a server build for your application.

```ts
/// <reference types="vitest" />

import { defineConfig } from 'vite';
import analog from '@analogjs/platform';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    analog({
      ssr: true,
      static: true, // prerender pages without building an SSR server
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

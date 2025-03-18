# Building Static Sites

Analog supports Static Site Generation when building for deployment. This includes prerendering provided routes to static HTML files along with the client-side application.

## Static Site Generation

### From Routes List

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

### From Content Directory

You might want to prerender all routes that are the result of a rendered content directory.
For example if you have a blog and all your articles are places as Markdown files in the `contents` directory.
For such scenarios, you can add an object to the `routes` config to render everything within a directory.
Keep in mind, that your directory structure may not be reflected 1:1 in your apps path.
Therefore, you have to pass a `transform` function which maps the file paths to the URLs.
The returning string should be the URL path in your app.
Using `transform` allows you also filter out some routes by returning `false`.
This does not include them in the prerender process, such as files marked as `draft` in the frontmatter.
The `contentDir` value of that object can be a glob pattern or just a specific path.

```ts
import { defineConfig } from 'vite';
import analog, { type PrerenderContentFile } from '@analogjs/platform';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    analog({
      prerender: {
        routes: async () => [
          '/',
          '/blog',
          {
            contentDir: 'src/content/blog',
            transform: (file: PrerenderContentFile) => {
              // do not include files marked as draft in frontmatter
              if (file.attributes.draft) {
                return false;
              }
              // use the slug from frontmatter if defined, otherwise use the files basename
              const slug = file.attributes.slug || file.name;
              return `/blog/${slug}`;
            },
          },
        ],
      },
    }),
  ],
}));
```

### Only static pages

To only prerender the static pages, use the `static: true` flag.

> The `ssr` flag must still be set to `true` for prerendering static pages.

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
          // Prerender 404.html page for SPAs
          '/404.html',
        ],
      },
      nitro: {
        routeRules: {
          '/404.html': { ssr: false },
        },
      },
    }),
  ],
}));
```

The static pages can be deployed from the `dist/analog/public` directory.

### Sitemap Generation

Analog also supports automatic sitemap generation. Analog generates a sitemap in the `dist/analog/public` directory when running a build if a sitemap configuration is provided.

```ts
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    analog({
      prerender: {
        routes: async () => ['/', '/blog'],
        sitemap: {
          host: 'https://analogjs.org/',
        },
      },
    }),
  ],
}));
```

To customize the sitemap definition, use the `sitemap` callback function to customize the `lastmod`, `changefreq`, and `priority` fields.

```ts
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';
import fs from 'node:fs';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    analog({
      prerender: {
        sitemap: {
          host: 'https://analogjs.org/',
        },
        routes: async () => [
          '/',
          '/blog',
          {
            route: '/blog/2022-12-27-my-first-post',
            sitemap: {
              lastmod: '2022-12-27',
            },
          },
          {
            contentDir: '/src/content/archived',
            transform: (file: PrerenderContentFile) => {
              return `/archived/${file.attributes.slug || file.name}`;
            },
            sitemap: (file: PrerenderContentFile) => {
              return {
                lastmod: 'read last modified date for content file',
                changefreq: 'never',
              };
            },
          },
        ],
      },
    }),
  ],
}));
```

As long as prerender routes are provided, Analog generates a `sitemap.xml` file containing a
mapping of the pages' `<loc>`, `<lastmod>`, `<changefreq>`, and `<priority>` properties.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset...>
    <!--This file was automatically generated by Analog.-->
    <url>
        <loc>https://analogjs.org/</loc>
        <lastmod>2023-07-01</lastmod>
    </url>
    <url>
        <loc>https://analogjs.org/blog/2022-12-27-my-first-post</loc>
        <lastmod>2022-12-27</lastmod>
    </url>
    <url>
        <loc>https://analogjs.org/blog/archived/hello-world</loc>
        <lastmod>2022-12-01</lastmod>
        <changefreq>never</changefreq>
    </url>
</urlset...>
```

### Post-rendering Hooks

Analog supports the post-rendering hooks during the prerendering process. The use case for post-rendering hooks can be inlining critical CSS, adding/removing scripts in HTML files, etc.

The sample code below shows how to use `postRenderingHooks` in your code:

```ts
import analog from '@analogjs/platform';
import { defineConfig } from 'vite';
import { PrerenderRoute } from 'nitropack';

// https://vitejs.dev/config/
export default defineConfig(() => {
  return {
    publicDir: 'src/public',
    build: {
      target: ['es2020'],
    },
    plugins: [
      analog({
        static: true,
        prerender: {
          routes: async () => [],
          postRenderingHooks: [
            async (route: PrerenderRoute) => console.log(route),
          ],
        },
      }),
    ],
  };
});
```

The `PrerenderRoute` gives you information about `route`, `contents`, `data`, and `fileName`, which can be useful for making changes to your content during the prerendering phase.

Below is a small example where we can append a script to include Google Analytics during the prerendering process using `postRenderingHooks`:

```ts
/// <reference types="vitest" />

import analog from '@analogjs/platform';
import { defineConfig, splitVendorChunkPlugin } from 'vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { PrerenderRoute } from 'nitropack';

// https://vitejs.dev/config/
export default defineConfig(() => {
  return {
    publicDir: 'src/public',
    build: {
      target: ['es2020'],
    },
    plugins: [
      analog({
        static: true,
        prerender: {
          routes: async () => ['/', '/aboutus'],
          postRenderingHooks: [
            async (route: PrerenderRoute) => {
              const gTag = `<script>
              (function(i,s,o,g,r,a,m){i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){
                (i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o),
                m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m)
                })(window,document,'script','//www.google-analytics.com/analytics.js','ga');

                ga('create', 'UA-xxxxxx-1', 'auto');
                ga('send', 'pageview');
              </script>`;
              if (route.route === '/aboutus') {
                route.contents = route.contents?.concat(gTag);
              }
            },
          ],
        },
      }),
    ],
  };
});
```

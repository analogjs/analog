# 构建静态站

Analog 在构建部署时支持静态站点生成。这包括将提供的路由预渲染到静态 HTML 以及客户端应用。

## 静态站点生成

### 从路由列表

要预渲染页面，请使用 `prerender` 属性来配置在构建时的要渲染的路由。预渲染的路由也可以通过异步的方式提供。

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

### 从内容目录

也许你想将所有的内容目录的路由都进行预渲染。
例如你有一个博客并且所有的文章都是位于 `contents` 目录的 Markdown 文件。
在这种情况下，你可以在 `routes` 配置里添加一个对象来渲染一个目录下的所有内容。
请注意，目录结构可能不会完全跟应用的路径完全匹配。
因此，您必须传递一个将文件路径映射到 URL 的 `transform` 函数。
返回的字符串应该是应用中的 URL 路径
`transform` 函数还可以通过返回 `false` 的方式过滤掉一些不想预渲染的路由。
例如在前言部分被标记为 `draft` 的文件将不会被进行预渲染处理
配置对象的 `contentDir` 值可以是一个 glob 范式，也可以只是一个目录。

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

### 仅渲染静态页

要只渲染静态页，使用 `static: true` 标记。

> 预渲染静态页面时，`ssr` 标志必须仍设置为 `true`。

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
          // 为 SPA 预渲染 404.html 页面
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

静态页可以从 `dist/analog/public` 目录来部署。

## 预渲染服务器端数据

当使用[服务器端数据获取](/docs/features/data-fetching/server-side-data-fetching)时，数据仅在第一次请求时使用传输状态进行缓存和重用。要预渲染与路由一起获取的服务器端数据，请在预渲染路由的配置对象中将 `staticData` 标志设置为 `true`。

例如，定义为 `src/app/pages/shipping.page.ts` 的路由以及关联的 `src/app/pages/shipping.server.ts`，其路由和服务器数据将被预渲染为完全静态。

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
          {
            route: '/shipping',
            staticData: true,
          },
        ],
      },
    }),
  ],
}));
```

### 网站地图生成

Analog 同样支持自动的网站地图生成。如果指定了网站地图配置，生成的网站地图位于 `dist/analog/public` 目录。

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
          host: 'https://analogjs.org',
        },
      },
    }),
  ],
}));
```

要自定义网站地图定义，请使用 `sitemap` 回调函数来自定义 `lastmod`、`changefreq` 和 `priority` 字段。

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
          host: 'https://analogjs.org',
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
                lastmod: '读取内容文件的最后修改日期',
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

只要提供了预渲染路由，Analog 会生成包含页面的 `<loc>`、`<lastmod>`、`<changefreq>` 和 `<priority>` 属性的 `sitemap.xml` 文件。

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset...>
    <!--此文件由 Analog 自动生成。-->
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

### Post-rendering 钩子

Ananlog 支持预渲染处理过程中的 post-rendering 钩子。通过 post-rendering 钩子可以用来在 HTML 文件里执行内联关键 CSS，添加/删除脚本等操作。

下面的例子展示了如何在代码中使用 `postRenderingHooks`：

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

`PrerenderRoute` 提供了关于 `route`，`contents`，`data`以及`fileName`的信息，这些信息对于在预渲染阶段更改内容很有用。

下面是一个小例子，我们可以使用 `postRenderingHooks` 在预渲染过程中附加一个脚本来包含 Google Analytics：

```ts
/// <reference types="vitest" />

import analog from '@analogjs/platform';
import { defineConfig } from 'vite';
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

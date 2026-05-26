# API 路由

Analog 支持定义 API 路由来为应用提供数据。

## 定义一个 API 路由

API 路由在 `src/server/routes` 目录里定义。API 路由同样是基于文件系统的，并且在开发过程中通过 `/api` 前缀访问。

```ts
import { defineEventHandler } from 'h3';

export default defineEventHandler(() => ({ message: 'Hello World' }));
```

## 定义 XML 内容

如果要为你的站点提供一个 RSS feed，将 `content-type` 设置为 `text/xml`，Analog 会为内容提供对应的内容类型。

```ts
//server/routes/rss.xml.ts

import { defineEventHandler, setHeader } from 'h3';
export default defineEventHandler((event) => {
  const feedString = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
</rss>
  `;
  setHeader(event, 'content-type', 'text/xml');
  return feedString;
});
```

**Note:** 如果要支持 SSG 内容，请设置 Ananlog 预载 API 路由来支持要预先渲染的内容：

```ts
// vite.config.ts
...
prerender: {
  routes: async () => {
    return [
      ...
      '/api/rss.xml',
      ...
      .
    ];
  },
  sitemap: {
    host: 'https://analog-blog.netlify.app',
  },
},
```

XML 作为一个静态的 XML 文档位于 `/dist/analog/public/api/rss.xml`

## 自定义 API 前缀

API 路由的前缀可以通过在 `analog` 的 vite 插件的 `apiPrefix` 参数来修改。

```ts
export default defineConfig(({ mode }) => {
  return {
    plugins: [
      analog({
        apiPrefix: 'services',
      }),
    ],
  };
});
```

基于以上配置，Ananlog 会在 `/services` 提供 API 接口。

在 `src/server/routes/api/v1/hello.ts` 里定义的路由将通过 `/services/v1/hello` 地址来访问。

## 动态 API 路由

动态路由通过文件名中[]中括号部分提供。参数可以通过 `event.context.params` 来访问。

```ts
// /server/routes/api/v1/hello/[name].ts
import { defineEventHandler } from 'h3';

export default defineEventHandler(
  (event) => `Hello ${event.context.params?.['name']}!`,
);
```

另一个访问路由参数的方法是调用 `getRouterParam` 函数

```ts
// /server/routes/api/v1/hello/[name].ts
import { defineEventHandler, getRouterParam } from 'h3';

export default defineEventHandler((event) => {
  const name = getRouterParam(event, 'name');
  return `Hello, ${name}!`;
});
```

## 指定 HTTP 请求的方法

文件名可以加 `.get`, `.post`, `.put`, `.delete` 后缀等等，来匹配对应的 HTTP 方法。

### GET

```ts
// /server/routes/api/v1/users/[id].get.ts
import { defineEventHandler, getRouterParam } from 'h3';

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');
  // TODO: fetch user by id
  return `User profile of ${id}!`;
});
```

### POST

```ts
// /server/routes/api/v1/users.post.ts
import { defineEventHandler, readBody } from 'h3';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  // TODO: Handle body and add user
  return { updated: true };
});
```

[h3 JSDocs](https://www.jsdocs.io/package/h3#package-index-functions) 提供了更多的信息和工具，包括 readBody。

## 包含 Query Parameters 的请求

示例查询 `/api/v1/query?param1=Analog&param2=Angular`

```ts
// routes/v1/query.ts
import { defineEventHandler, getQuery } from 'h3';

export default defineEventHandler((event) => {
  const { param1, param2 } = getQuery(event);
  return `Hello, ${param1} and ${param2}!`;
});
```

## Catch-all 路由

Catch-all 路由在处理 fallback 路由的时候很有用。

```ts
// routes/[...].ts
export default defineEventHandler((event) => `Default page`);
```

## 错误处理

如果没有错误被抛出，状态码 200 将会返回。如果有任何错误，都会返回 500 Internal Server Error HTTP Error。如果要返回其他的错误码，请返回一个包含 createError 的异常。

```ts
// routes/v1/[id].ts
import { defineEventHandler, getRouterParam, createError } from 'h3';

export default defineEventHandler((event) => {
  const param = getRouterParam(event, 'id');
  const id = parseInt(param ? param : '');
  if (!Number.isInteger(id)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'ID should be an integer',
    });
  }
  return `ID is ${id}`;
});
```

## 访问 Cookies

Analog 支持在服务端调用的时候设置和读取 cookies。

### 设置 cookies

```ts
//(home).server.ts
import { setCookie } from 'h3';
import { PageServerLoad } from '@analogjs/router';

import { Product } from '../products';

export const load = async ({ fetch, event }: PageServerLoad) => {
  setCookie(event, 'products', 'loaded'); // setting the cookie
  const products = await fetch<Product[]>('/api/v1/products');

  return {
    products: products,
  };
};
```

### 读取 cookies

```ts
//index.server.ts
import { parseCookies } from 'h3';
import { PageServerLoad } from '@analogjs/router';

export const load = async ({ event }: PageServerLoad) => {
  const cookies = parseCookies(event);

  console.log('products cookie', cookies['products']);

  return {
    shipping: true,
  };
};
```

## 更多信息

API 路由功能由 [Nitro](https://nitro.unjs.io/guide/routing) and [h3](https://h3.unjs.io/) 强力驱动。请查看 Nitro 和 h3 文档了解更多创建 API 路由的例子。

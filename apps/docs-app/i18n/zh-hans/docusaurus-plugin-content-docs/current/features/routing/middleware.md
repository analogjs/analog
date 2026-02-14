# 中间件

Analog 支持服务端中间件，可以用于修改请求，检查认证，发送跳转等其他操作。

## 设置中间件

位于 `src/server/middleware` 目录下的中间件会自动被注册。

```treeview
src/
└── server/
    └── middleware/
        └── auth.ts
```

中间件通过 `defineEventHandler` 函数来定义。

```ts
import { defineEventHandler, sendRedirect, setHeaders } from 'h3';

export default defineEventHandler((event) => {
  if (event.node.req.originalUrl === '/checkout') {
    console.log('event url', event.node.req.originalUrl);

    setHeaders(event, {
      'x-analog-checkout': 'true',
    });
  }
});
```

- 中间件应该只修改请求并且没有任何返回值！
- 中间件按照文件名的顺序执行。如果要自定义顺序，建议给文件名上加上数字前缀来实现。

## 中间件的筛选器

中间件可以通过筛选器只处理特定的路由。

```ts
export default defineEventHandler(async (event) => {
  // Only execute for /admin routes
  if (getRequestURL(event).pathname.startsWith('/admin')) {
    const cookies = parseCookies(event);
    const isLoggedIn = cookies['authToken'];

    // check auth and redirect
    if (!isLoggedIn) {
      sendRedirect(event, '/login', 401);
    }
  }
});
```

## 访问环境变量

使用 `process.env` 全局变量在中间件函数中访问环境变量。在 `.env` 文件中定义的仅服务器和可公开访问的环境变量都可以从中读取。

```ts
import { defineEventHandler, getRequestURL } from 'h3';

export default defineEventHandler((event) => {
  console.log('Path:', getRequestURL(event).pathname);
  console.log(
    'Server Only Environment Variable:',
    process.env['SERVER_ONLY_VARIABLE'],
  );
  console.log(
    'Public Environment Variable:',
    process.env['VITE_EXAMPLE_VARIABLE'],
  );
});
```

在 Vite 文档中了解更多关于 [环境变量](https://vite.dev/guide/env-and-mode.html#env-variables) 的信息。

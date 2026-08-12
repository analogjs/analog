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

中间件通过 `defineHandler` 函数来定义。

```ts
import { defineHandler, redirect } from 'h3';

export default defineHandler((event) => {
  if (event.path === '/checkout') {
    event.res.headers.set('x-analog-checkout', 'true');
    return redirect('/cart', 302);
  }
});
```

- 中间件可以修改请求或响应上下文，也可以返回一个响应来提前结束处理流程。
- 中间件按照文件名的顺序执行。如果要自定义顺序，建议给文件名上加上数字前缀来实现。

## 中间件的筛选器

中间件可以通过筛选器只处理特定的路由。

```ts
import { defineHandler, getCookie, redirect } from 'h3';

export default defineHandler(async (event) => {
  // Only execute for /admin routes
  if (event.url.pathname.startsWith('/admin')) {
    const authToken = getCookie(event, 'authToken');

    // check auth and redirect
    if (!authToken) {
      return redirect('/login', 401);
    }
  }
});
```

## 访问环境变量

使用 `process.env` 全局变量在中间件函数中访问环境变量。在 `.env` 文件中定义的仅服务器和可公开访问的环境变量都可以从中读取。

```ts
import { defineHandler } from 'h3';

export default defineHandler((event) => {
  console.log('Path:', event.url.pathname);
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

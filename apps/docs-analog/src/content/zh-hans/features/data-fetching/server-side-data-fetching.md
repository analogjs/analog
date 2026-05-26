# 服务端数据获取

Analog 支持在加载页面之前从服务端数据获取。通过在当前页面的 `.server.ts` 文件里定义一个异步的 `load` 函数来实现。

## 数据获取

在 `.page.ts` 文件同目录下创建一个同名且后缀为 `.server.ts` 的文件并实现异步的 `load` 函数来数据获取。

```ts
// src/app/pages/index.server.ts
};
```

## 注入数据

通过 `@analogjs/router` 包提供的 `injectLoad` 函数可以访问从服务端获取的数据。

`load` 函数是通过 Angular 的路由解析器来解析的，所以 `requireSync: false` 设置 和 `initialValue: {}` 不会带来任何好处，因为 load 是在组件实例化之前被调用的。

```ts
// src/app/pages/index.page.ts
export const appConfig: ApplicationConfig = {
  providers: [
    provideFileRouter(
      withComponentInputBinding(),
      withNavigationErrorHandler(console.error),
    ),
    provideHttpClient(),
    provideClientHydration(),
  ],
};
```

现在在组件中添加一个名为 `load` 的 Input。

```ts
// src/app/pages/index.page.ts
export const routeMeta: RouteMeta = {
  resolve: {
    data: async (route) => {
      // call server load resolver for this route from another resolver
      const data = await getLoadResolver(route);

      return { ...data };
    },
  },
};
```

## 复写公开的 Base URL

Analog automatically infers the public base URL to be set when using the server-side data fetching through its [Server Request Context](/docs/features/data-fetching/overview#server-request-context) and [Request Context Interceptor](/docs/features/data-fetching/overview#request-context-interceptor). To explcitly set the base URL, set an environment variable, using a `.env` file to define the public base URL.
使用服务端数据获取时，Analog 会通过其 [服务器请求上下文](/docs/features/data-fetching/overview#server-request-context) 和 [请求上下文拦截器](/docs/features/data-fetching/overview#request-context-interceptor) 自动推断要设置的 Public Base URL。要显示的设置 Public Base URL，请设置环境变量，使用 `.env` 文件来定义 Public Base URL。

```
// .env
VITE_ANALOG_PUBLIC_BASE_URL="http://localhost:5173"
```

部署之前也要先设置好这个环境变量。

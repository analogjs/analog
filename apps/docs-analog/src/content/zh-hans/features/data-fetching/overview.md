---
title: 数据获取
---

# 概述

数据获取是 Analog 基于 Angular 概念早上构建，类似使用 `HttpClient` 来发起 API 请求。

## 使用 HttpClient

推荐使用 `HttpClient` 来调用内部或者外部的 API。任何使用 `HttpClient` 并且以 `/` 打头的请求上下文由 `provideServerContext` 函数提供。

## 服务端请求上下文

在服务端，使用 `main.server.ts` 中 Analog 路由的 `provideServerContext` 函数。

```ts
// Analog server context
if (import.meta.env.PROD) {
  enableProdMode();
}

export function bootstrap() {
  return bootstrapApplication(AppComponent, config);
}

export default async function render(
  url: string,
  document: string,
  serverContext: ServerContext,
) {
  const html = await renderApplication(bootstrap, {
    document,
    url,
    platformProviders: [provideServerContext(serverContext)],
  });

  return html;
}
```

它将从服务端提供 `Request`，`Response` 以及 `Base URL` 并将他们注册为依赖提供者，用于注入和调用。

## 注入函数

```ts
class MyService {
  request = injectRequest(); // <- Server Request Object
  response = injectResponse(); // <- Server Response Object
  baseUrl = injectBaseURL(); // <-- Server Base URL
}
```

## 请求上下文拦截器

Analog 同样为 HttpClient 提供了 `requestContextInterceptor` 以在服务端，客户端或者渲染阶段将任何以 `/` 打头的 URL 转换成完整 URL 路径。

在 `@angular/common/http` 软件包的 `withInterceptors` 函数中使用。

```ts
export const appConfig: ApplicationConfig = {
  providers: [
    provideFileRouter(withNavigationErrorHandler(console.error)),
    provideHttpClient(
      withFetch(),
      withInterceptors([requestContextInterceptor]),
    ),
    provideClientHydration(),
  ],
};
```

> 请确保 `requestContextInterceptor` 是拦截器列表中的 **最后一个**。

## 发起请求

在你的组件/服务里，使用 `HttpClient` 以及[API 路由](/docs/features/api/overview)并提供完整的 URL。

一个获取 todo 列表的 API 路由的例子。

```ts
// src/server/routes/api/v1/todos.ts -> /api/v1/todos
export default eventHandler(async () => {
  const response = await fetch('https://jsonplaceholder.typicode.com/todos');
  const todos = await response.json();

  return todos;
});
```

一个从 API 获取 todo 列表的服务示例。

```ts
// todos.service.ts
@Injectable({
  providedIn: 'root',
})
export class TodosService {
  http = inject(HttpClient);

  getAll() {
    return this.http.get<Todo[]>('/api/v1/todos');
  }

  getData() {
    return this.http.get<Todo[]>('/assets/data.json');
  }
}
```

数据请求同样使用了 Angular 的 `TransferState` 来存储任何在服务端渲染期间的请求，并进行传输以防止在客户端水合时发起额外的请求。

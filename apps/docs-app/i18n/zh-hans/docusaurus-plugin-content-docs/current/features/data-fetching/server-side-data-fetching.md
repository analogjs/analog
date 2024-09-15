# 服务端数据获取

Analog 支持在加载页面之前从服务端数据获取。通过在当前页面的 `.server.ts` 文件里定义一个异步的 `load` 函数来实现。

## 数据获取

在 `.page.ts` 文件同目录下创建一个同名且后缀为 `.server.ts` 的文件并实现异步的 `load` 函数来数据获取。

```ts
// src/app/pages/index.server.ts
import { PageServerLoad } from '@analogjs/router';

export const load = async ({
  params, // params/queryParams from the request
  req, // H3 Request
  res, // H3 Response handler
  fetch, // internal fetch for direct API calls,
  event, // full request event
}: PageServerLoad) => {
  return {
    loaded: true,
  };
};
```

## 注入数据

通过 `@analogjs/router` 包提供的 `injectLoad` 函数可以访问从服务端获取的数据。

```ts
// src/app/pages/index.page.ts
import { Component } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { injectLoad } from '@analogjs/router';

import { load } from './index.server'; // not included in client build

@Component({
  standalone: true,
  template: `
    <h2>Home</h2>

    Loaded: {{ data().loaded }}
  `,
})
export default class BlogComponent {
  data = toSignal(injectLoad<typeof load>(), { requireSync: true });
}
```

通过组件的 Input 和 Angular 路由配置的组件 Input 绑定也可以访问这些数据。要配置 `Component Input Bindings`，请在 `app.config.ts` 的 `provideFileRouter()` 中添加 `withComponentInputBinding()` 参数。

```ts
import { provideHttpClient } from '@angular/common/http';
import { ApplicationConfig } from '@angular/core';
import { provideClientHydration } from '@angular/platform-browser';
import { provideFileRouter } from '@analogjs/router';
import { withNavigationErrorHandler } from '@angular/router';

export const appConfig: ApplicationConfig = {
  providers: [provideFileRouter(withComponentInputBinding(), withNavigationErrorHandler(console.error)), provideHttpClient(), provideClientHydration()],
};
```

现在在组件中添加一个名为 `load` 的 Input。

```ts
// src/app/pages/index.page.ts
import { Component } from '@angular/core';
import { LoadResult } from '@analogjs/router';

import { load } from './index.server'; // not included in client build

@Component({
  standalone: true,
  template: `
    <h2>Home</h2>
    Loaded: {{ data.loaded }}
  `,
})
export default class BlogComponent {
  @Input() load(data: LoadResult<typeof load>) {
    this.data = data;
  }

  data!: LoadResult<typeof load>;
}
```

## 访问服务端加载的数据

要从 `RouteMeta` 解析器访问服务器端加载的数据，可以通过 `@analogjs/router` 包提供的 `getLoadResolver` 函数。

```ts
import { getLoadResolver } from '@analogjs/router';

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

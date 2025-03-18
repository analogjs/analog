import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# 部署

Node.js 部署是 Analog 为生产环境构建的默认预设输出。

在默认预设情况下运行 `npm run build` 时，编译结果就是一个 ready-to-run 的 Node 服务。

要单独启动这个服务，可以运行：

```bash
$ node dist/analog/server/index.mjs
Listening on http://localhost:3000
```

### 环境变量

你可以用下面的环境变量自定义一些服务器行为：

- `NITRO_PORT` or `PORT` (defaults to `3000`)
- `NITRO_HOST` or `HOST`

## 内置的预设

Analog 可以一套代码为不同的 [主机托管商](/docs/features/deployment/providers) 提供相应的输出格式，你可以通过环境变量或者 `vite.config.ts` 修改部署预设。

以来 CI/CD 的部署建议使用环境变量。

**例如:** 使用 `BUILD_PRESET`

```bash
BUILD_PRESET=node-server
```

**例如:** 使用 `vite.config.ts`

```ts
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    analog({
      nitro: {
        preset: 'node-server',
      },
    }),
  ],
});
```

## 部署时自定义 URL 前缀

如果你部署是需要指定一个自定义的 URL 前缀，例如 https://domain.com/ `basehref`/ 你必须确保 [服务端数据获取](https://analogjs.org/docs/features/data-fetching/server-side-data-fetching)，[HTML 标记和资源](https://angular.io/api/common/APP_BASE_HREF) 和 [动态 API 路由](https://analogjs.org/docs/features/api/overview) 能在 `basehref` 下正常工作。

1. 更新文件 `app.config.env.ts`。

这里告知 Angular 如何识别并生成对应的 URL

```ts
import { ApplicationConfig } from '@angular/core';
import { APP_BASE_HREF } from '@angular/common';

export const appConfig: ApplicationConfig = {
  providers: [
    [{ provide: APP_BASE_HREF, useValue: import.meta.env.BASE_URL || '/' }],
    ...
  ],
};
```

2. 在 CI 生产环境构建

```bash
  # sets the base url for server-side data fetching
  export VITE_ANALOG_PUBLIC_BASE_URL="https://domain.com/basehref"
  # Prefixes all assets and html with /basehref/
  # if using nx:
  npx nx run appname:build:production --baseHref='/basehref/'
  # if using angular build directly:
  npx ng build --baseHref="/basehref/"
```

3. 在生产环境的镜像指定环境变量 `NITRO_APP_BASE_URL`。

```bash
NITRO_APP_BASE_URL="/basehref/"
```

`vite.config.ts` 文件类似的配置：

```ts
    plugins: [
      analog({
        apiPrefix: 'api',
        nitro: {
          routeRules: {
            '/': {
              prerender: false,
            },
          },
        },
        prerender: {
          routes: async () => {
            return ['/'];
          }
        }
```

Nitro 所有的 API 路由将基于 `/basehref/api` 。

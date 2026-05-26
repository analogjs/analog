---
title: ''
---

# @analogjs/vite-plugin-nitro

一个轻量级的 [Vite](https://vite.dev) 插件，用于集成 [Nitro](https://nitro.unjs.io)，以启用：

- 运行时服务端渲染 (Runtime Server Side Rendering)
- 构建时预渲染 (Build-time Pre-rendering)
- 静态站点生成 (Static Site Generation)
- API 路由
- 站点地图 (Sitemaps)

## 安装

npm install @analogjs/vite-plugin-nitro --save-dev

## 设置

将 `nitro` 插件添加到 Vite 配置的 `plugins` 数组中。

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import nitro from '@analogjs/vite-plugin-nitro';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    nitro({
      ssr: true,
      entryServer: 'src/main.server.tsx',
      prerender: {
        routes: ['/'],
      },
    }),
  ],
});
```

### SSR 设置

定义一个 `src/main.server.ts(x)` 文件，声明如何在服务器上渲染应用程序。

下面是 React SSR 的最小示例：

```ts
import React from 'react';
import ReactDOMServer from 'react-dom/server';

import App from './App';

export default async function render(_url: string, document: string) {
  const html = ReactDOMServer.renderToString(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
  return document.replace('<!--app-html-->', html);
}
```

同时设置在 `index.html` 中要被替换的占位符：

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <title>Vite + React + Nitro</title>
  </head>
  <body>
    <div id="root"><!--app-html--></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

## API 路由

API 路由定义在 `src/server/routes/api` 文件夹中。API 路由也是基于文件系统的，
并通过默认的 `/api` 前缀暴露。

```ts
// src/server/routes/api/v1/hello
import { defineEventHandler } from 'h3';

export default defineEventHandler(() => ({ message: 'Hello World' }));
```

该 API 路由可以通过 `/api/v1/hello` 访问。

## 自定义源根目录

默认情况下，使用 `src` 文件夹作为发现服务器文件和 API 路由的路径。您可以使用 `sourceRoot` 选项自定义文件夹。

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import nitro from '@analogjs/vite-plugin-nitro';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    nitro({
      ssr: true,
      entryServer: 'app/main.server.tsx',
      sourceRoot: 'app',
    }),
  ],
});
```

使用此配置，API 路由将在 `app/server/routes/api` 目录下被发现。您也可以通过将 `sourceRoot` 设置为 `'.'` 来使其变为可选；

## 示例

React: https://github.com/brandonroberts/vite-nitro-react \
SolidJS: https://github.com/brandonroberts/vite-nitro-solid \
Vue: https://github.com/brandonroberts/vite-nitro-vue

## 社区

- 访问并为 [GitHub Repo](https://github.com/analogjs/analog) 点星
- 加入 [Discord](https://chat.analogjs.org)
- 在 [Twitter](https://twitter.com/analogjs) 和 [Bluesky](https://bsky.app/profile/analogjs.org) 上关注我们
- 成为 [赞助者](https://github.com/sponsors/brandonroberts)

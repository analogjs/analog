---
title: 'Nitro'
---

# @analogjs/vite-plugin-nitro

一个轻量级的 [Vite](https://vite.dev) 插件，用于与 [Nitro](https://nitro.unjs.io) 集成，以实现：

- 运行时服务器端渲染
- 构建时预渲染
- 静态网站生成
- API 路由

## 安装

npm install @analogjs/vite-plugin-nitro --save-dev

## 设置

在 Vite 配置中的 `plugins` 数组中添加 `nitro` 插件。

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

定义一个 `src/main.server.ts(x)` 文件来声明如何在服务器上渲染应用程序。

下面是一个使用 React 进行 SSR 的最小示例：

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

还需要在 `index.html` 中设置要替换的占位符：

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

API 路由定义在 `src/server/routes/api` 文件夹中。API 路由也是基于文件系统的，并且在默认的 `/api` 前缀下暴露。

```ts
// src/server/routes/api/v1/hello
import { defineEventHandler } from 'h3';

export default defineEventHandler(() => ({ message: 'Hello World' }));
```

API 路由可以通过 `/api/v1/hello` 访问。

## 示例

React: https://github.com/brandonroberts/vite-nitro-react \
SolidJS: https://github.com/brandonroberts/vite-nitro-solid \
Vue: https://github.com/brandonroberts/vite-nitro-vue

## 社区

- 访问并加星 [GitHub 仓库](https://github.com/analogjs/analog)
- 加入 [Discord](https://chat.analogjs.org)
- 关注我们在 [Twitter](https://twitter.com/analogjs) 和 [Bluesky](https://bsky.app/profile/analogjs.org) 上的动态
- 成为 [赞助者](https://github.com/sponsors/brandonroberts)

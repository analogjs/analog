---
title: 从Angular迁移到Analog
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# 从 Angular 迁移到 Analog

一个现有的 Angular 单页应用可以通过一个 Angular CLI 或者 Nx 工作区的原理器/生成器配置成使用 Analog。

> Analog 兼容 Angular v15 及以上版本.

## 使用原理器/生成器

首先，安装 `@analogjs/platform` 软件包：

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm install @analogjs/platform --save-dev
```

  </TabItem>

  <TabItem label="Yarn" value="yarn">

```shell
yarn add @analogjs/platform --dev
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm install -w @analogjs/platform
```

  </TabItem>
</Tabs>

下一步，执行一下命令来配置 Vite，更新项目配置的构建/伺服的目标，移动必须的文件并且设置 Vitest 进行单元测试（可选）

```shell
npx ng generate @analogjs/platform:migrate --project [your-project-name]
```

Nx 项目:

```shell
npx nx generate @analogjs/platform:migrate --project [your-project-name]
```

## 更新全局样式和脚本

如果在你的 `angular.json` 里有全局的脚本或者样式文件，把他们移动到 `index.html` 里的 `head` 里。

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>My Analog app</title>
    <base href="/" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" type="image/x-icon" href="/favicon.ico" />
    <link rel="stylesheet" href="/src/styles.css" />
  </head>
  <body>
    <app-root></app-root>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

## 设置环境

在 Angular 应用程序中，`fileReplacements` 是在 `angular.json` 中针对不同环境进行配置的。

### 使用环境变量

在 Analog 中，你可以设置并使用环境变量。这是**推荐**的方法。

在应用程序的根目录添加一个 `.env` 文件，并为任何**公共**环境变量加上 `VITE_` 前缀。**不要**将此文件提交到你的源代码仓库中。

```sh
VITE_MY_API_KEY=development-key

# 仅在服务器构建中可用
MY_SERVER_API_KEY=development-server-key
```

在你的代码中导入并使用环境变量。

```ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly apiKey = import.meta.env['VITE_MY_API_KEY'];

  constructor(private http: HttpClient) {}
}
```

部署时，将环境变量设置为生产环境对应的值。

```sh
VITE_MY_API_KEY=production-key

# 仅在服务器构建中可用
MY_SERVER_API_KEY=production-server-key
```

阅读[这里](https://vitejs.dev/guide/env-and-mode.html)了解更多关于环境变量的信息。

### 使用文件替换

你也可以使用 `fileReplacements` 选项来替换文件。

```ts
/// <reference types="vitest" />

import { defineConfig } from 'vite';
import analog from '@analogjs/platform';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  build: {
    target: ['es2020'],
  },
  resolve: {
    mainFields: ['module'],
  },
  plugins: [
    analog({
      fileReplacements:
        mode === 'production'
          ? [
              {
                replace: 'src/environments/environment.ts',
                with: 'src/environments/environment.prod.ts',
              },
            ]
          : [],
    }),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
    include: ['**/*.spec.ts'],
    reporters: ['default'],
  },
  define: {
    'import.meta.vitest': mode !== 'production',
  },
}));
```

## 复制资产

默认情况下，`public` 目录中的静态资产会复制到构建输出目录。如果要复制该目录之外的其他资产，请使用 `nxCopyAssetsPlugin` Vite 插件。

导入插件并进行设置：

```ts
/// <reference types="vitest" />

import { defineConfig } from 'vite';
import analog from '@analogjs/platform';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // ...
  plugins: [analog(), nxCopyAssetsPlugin(['*.md'])],
}));
```

## 启用 HMR

Angular 支持 HMR/Live reload，在大多数情况下，无需重新加载页面即可更新组件。要在 Analog 中启用它，请使用 `liveReload: true` 选项。

```ts
/// <reference types="vitest" />

import { defineConfig } from 'vite';
import analog from '@analogjs/platform';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // .. 其他配置
  plugins: [
    analog({
      liveReload: true,
    }),
  ],
}));
```

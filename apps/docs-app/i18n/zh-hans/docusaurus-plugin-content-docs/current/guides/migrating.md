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

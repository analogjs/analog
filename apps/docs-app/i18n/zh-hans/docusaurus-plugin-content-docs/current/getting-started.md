---
sidebar_position: 2
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# 快速入门

## 系统要求

Analog 对于 NodeJS 和 Angular 的版本要求如下：

- Node v18.13.0 或更高
- Angular v15 或更高版本

## 创建一个新的应用

你可以通过使用以下工具通过 `create-analog` 命令来创建一个新的 Analog 项目

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm create analog@latest
```

  </TabItem>

  <TabItem label="Yarn" value="yarn">

```shell
yarn create analog
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm create analog
```

  </TabItem>
</Tabs>

你也可以[用 Nx 搭建新的项目](/docs/integrations/nx).

### 启动项目应用

运行 `start` 命令来启动创建的项目应用

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm run start
```

  </TabItem>

  <TabItem label="Yarn" value="yarn">

```shell
yarn start
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm start
```

  </TabItem>
</Tabs>

在浏览器访问 [http://localhost:5173](http://localhost:5173) 来查看运行的应用

下一步，你可以基于 [组件路由](/docs/features/routing/overview) 添加导航

### 构建应用

构建应用进行发布

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm run build
```

  </TabItem>

  <TabItem label="Yarn" value="yarn">

```shell
yarn build
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm run build
```

  </TabItem>
</Tabs>

### 构建工件

Analog 默认启用了 [服务端渲染](/docs/features/server/server-side-rendering)，
客户端的包位于 `dist/analog/public` 目录，
服务器端的 API/SSR 包目录位于 `dist/analog/server` 目录。

## 从现有项目迁移

你也可以将现有的 Angular 应用迁移到 Analog。请移步[迁移向导](/docs/guides/migrating)查看迁移步骤。

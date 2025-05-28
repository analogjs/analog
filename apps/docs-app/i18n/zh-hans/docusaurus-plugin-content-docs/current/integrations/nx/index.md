---
sidebar_position: 2
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Nx

## 概述

[Nx](https://nx.dev) 是一个智能、快速、可扩展的构建系统，具有一流的单一代码库支持和强大的集成能力。

Analog 通过工作区预设和应用生成器提供了对 Nx 单一代码库和工作区的集成。

## 创建一个独立的 Nx 项目

要搭建一个独立的 Nx 项目，请使用 `create-nx-workspace` 命令并指定 `@analogjs/platform` 预设。

创建一个预设 Analog 应用的 Nx 工作区：

```shell
npx create-nx-workspace@latest --preset=@analogjs/platform
```

Analog 预设会提示你提供应用程序的名称。在此示例中，我们就用 `analog-app`。
此外，还会询问你是否要在新项目中包含 [TailwindCSS](https://tailwindcss.com) 和 [tRPC](https://trpc.io) 。
如果你选择包含其中任何一个，则会自动安装所有必须的依赖项，并添加所需的配置。

### 启动应用

要运行应用的开发服务器，运行 `nx serve` 命令。

```shell
npx nx serve analog-app
```

用浏览器打开 `http://localhost:4200` 查看运行的应用。

### 构建应用

要构建应用进行部署：

```shell
npx nx build analog-app
```

### 构建工件

客户端的构建工件在你的 Nx 工作区的 dist 目录。

在独立工作区布局中， `analog-app`的客户端工件位于 `dist/analog/public` 目录。
服务端 API/SSR 构建工件位于 `dist/analog/server` 目录。

## 添加到现有的 Nx 工作区

可以在一个现有的 Nx 工作区里生成一个 Analog 应用。要生成一个应用：

首先，安装 `@analogjs/platform` 包：

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
pnpm install @analogjs/platform --save-dev
```

  </TabItem>
</Tabs>

然后，使用应用生成器搭建一个新的应用：

```shell
npx nx g @analogjs/platform:application analog-app
```

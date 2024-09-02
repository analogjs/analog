---
sidebar_position: 3
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# 用 Vite 集成 Storybook

[Storybook](https://storybook.js.org) 是一个用于独立构建 UI 组件和页面的前端工作室。

默认情况下，Angular 和 Storybook 使用 Webpack 构建和提供 Storybook 应用。

这里将展示如何切换成用 Angular 和 Vite 来构建和提供 Storybook 应用。这个向导也适用于 _任何_ 集成 Storybook 的 Angular 项目。

## 设置 Storybook

如果你还没有设置 Storybook，运行下面的命令在你的项目里初始化 Storybook：

```sh
npx storybook@latest init
```

按照提供的指示继续，并且提交你的变更。

## 安装 Storybook 和 Vite 包

安装 Angular 的 Vite 插件和 Storybook 的 Vite 构建器。按照你使用的包管理器，运行下面的命令：

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm install @analogjs/vite-plugin-angular @storybook/builder-vite --save-dev
```

  </TabItem>

  <TabItem label="yarn" value="yarn">

```shell
yarn add @analogjs/vite-plugin-angular @storybook/builder-vite --dev
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm install @analogjs/vite-plugin-angular @storybook/builder-vite -w --save-dev
```

  </TabItem>

  <TabItem value="bun">

```shell
bun install @analogjs/vite-plugin-angular @storybook/builder-vite --save-dev
```

  </TabItem>  
</Tabs>

## 配置 Storybook 使用 Vite 构建器

更新 `.storybook/main.ts` 文件以使用 `@storybook/builder-vite`，并且添加 `viteFinal` 配置函数来配置 Angular 的 Vite 插件。

```ts
import { StorybookConfig } from '@storybook/angular';
import { StorybookConfigVite } from '@storybook/builder-vite';
import { UserConfig } from 'vite';

const config: StorybookConfig & StorybookConfigVite = {
  // other config, addons, etc.
  core: {
    builder: {
      name: '@storybook/builder-vite',
      options: {
        viteConfigPath: undefined,
      },
    },
  },
  async viteFinal(config: UserConfig) {
    // Merge custom configuration into the default config
    const { mergeConfig } = await import('vite');
    const { default: angular } = await import('@analogjs/vite-plugin-angular');

    return mergeConfig(config, {
      // Add dependencies to pre-optimization
      optimizeDeps: {
        include: [
          '@storybook/angular',
          '@storybook/angular/dist/client',
          '@angular/compiler',
          '@storybook/blocks',
          'tslib',
        ],
      },
      plugins: [angular({ jit: true, tsconfig: './.storybook/tsconfig.json' })],
    });
  },
};
```

移除现有的 `webpackFinal` 配置函数。

然后，更新 `package.json` 来直接运行 Storybook 命令。

```json
{
  "name": "my-app",
  "scripts": {
    "storybook": "storybook dev --port 4400",
    "build-storybook": "storybook build"
  }
}
```

> 你还可以删除 angular.json 里的 Storybook 目标

如果你用的是 [Nx](https://nx.dev)，更新你的 `project.json` storybook 目标为运行 Storybook 命令：

```json
    "storybook": {
      "executor": "nx:run-commands",
      "options": {
        "cwd": "apps/my-app",
        "command": "storybook dev --port 4400"
      }
    },
    "build-storybook": {
      "executor": "nx:run-commands",
      "options": {
        "cwd": "apps/my-app",
        "command": "storybook build --output-dir ../../dist/storybook/my-app"
      }
    }
```

添加 `/storybook-static` 目录到你的 `.gitignore` 文件里。

## 运行 Storybook

直接运行 storybook 命令来启动开发服务器。

```sh
npm run storybook
```

## 构建 Storybook

运行以下命令来构建 storybook。

```sh
npm run build-storybook
```

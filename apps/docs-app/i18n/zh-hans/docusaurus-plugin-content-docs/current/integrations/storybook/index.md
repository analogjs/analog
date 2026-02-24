---
sidebar_position: 3
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# 在 Angular 和 Vite 中使用 Storybook

[Storybook](https://storybook.js.org) 是一个用于独立构建 UI 组件和页面的前端工作室。

默认情况下，Angular 和 Storybook 使用 Webpack 构建和提供 Storybook 应用。

本指南将带你了解使用 AnalogJS Storybook 集成将 Storybook 切换为使用 Angular 和 Vite 进行构建和服务的流程。该包可应用于*任何*使用 Storybook 的 Angular 项目。

> 这是一个社区集成，并非由 Storybook 团队维护。如果你遇到问题，请在我们的 [GitHub 仓库](https://github.com/analogjs/analog/issues)中提交 issue。

## 兼容性指南

用于 Angular 和 Vite 的 AnalogJS Storybook 集成支持多个版本的 Storybook。请参阅下表，根据项目依赖项安装相应的版本。

| Storybook 版本 | Analog 版本 |
| -------------- | ----------- |
| ^10.0.0        | ^2.0.0      |
| ^9.0.0         | ^1.22.0     |
| ^8.6.0         | ^1.22.0     |

## 设置 Storybook

如果你还没有设置 Storybook，请运行以下命令为你的项目初始化 Storybook：

```sh
npx storybook@latest init
```

按照提供的提示操作，并提交你的更改。

## 安装 Storybook 包

安装 Angular 和 Vite 的 Storybook 集成。根据你偏好的包管理器，运行以下命令之一：

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm install @analogjs/storybook-angular --save-dev
```

  </TabItem>

  <TabItem label="yarn" value="yarn">

```shell
yarn add @analogjs/storybook-angular --dev
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm install @analogjs/storybook-angular -w --save-dev
```

  </TabItem>

  <TabItem value="bun">

```shell
bun install @analogjs/storybook-angular --save-dev
```

  </TabItem>  
</Tabs>

## 配置 Storybook

更新 `.storybook/main.ts` 文件以使用 `StorybookConfig` 类型。同时更新 `framework` 以使用 `@analogjs/storybook-angular` 包。

```ts
import { StorybookConfig } from '@analogjs/storybook-angular';

const config: StorybookConfig = {
  // 其他配置, addons 等
  framework: {
    name: '@analogjs/storybook-angular',
    options: {},
  },
  staticDirs: ['../public'],
};

export default config;
```

如果存在现有的 `webpackFinal` 配置函数，请将其移除。

接下来，更新 `angular.json` 或 `project.json` 中的 Storybook 目标。

```json
    "storybook": {
      "builder": "@analogjs/storybook-angular:start-storybook",
    },
    "build-storybook": {
      "builder": "@analogjs/storybook-angular:build-storybook"
    }
```

移除任何 `webpack` 特定选项并移除 `browserTarget` 选项。

将 `/storybook-static` 文件夹添加到 `.gitignore` 文件中。

## 设置 CSS

要注册全局样式，请将其添加到 `angular.json` 或 `project.json` 中的 `@analogjs/storybook-angular` 构建器选项中。

```json
    "storybook": {
      "builder": "@analogjs/storybook-angular:start-storybook",
      "options": {
        // ... 其他选项
        "styles": [
          "src/styles.css"
        ],
        "stylePreprocessorOptions": {
          "loadPaths": ["libs/my-lib/styles"]
        }
      }
    },
    "build-storybook": {
      "builder": "@analogjs/storybook-angular:build-storybook",
      "options": {
        // ... 其他选项
        "styles": [
          "src/styles.css"
        ],
        "stylePreprocessorOptions": {
          "loadPaths": ["libs/my-lib/styles"]
        }
      }
    }
```

## 启用 Zoneless 变更检测

要在 Storybook 中使用 Zoneless 变更检测，请在 `angular.json` 或 `project.json` 中的 `@analogjs/storybook-angular` 构建器选项中添加 `experimentalZoneless` 标志。

<Tabs groupId="zoneless-change-detection">
  <TabItem value="angular.json">

```json
    "storybook": {
      "builder": "@analogjs/storybook-angular:start-storybook",
      "options": {
        // ... 其他选项
        "experimentalZoneless": true
      }
    },
    "build-storybook": {
      "builder": "@analogjs/storybook-angular:build-storybook",
      "options": {
        // ... 其他选项
        "experimentalZoneless": true
      }
    }
```

  </TabItem>
  <TabItem value="project.json">

```json
    "storybook": {
      "executor": "@analogjs/storybook-angular:start-storybook",
      "options": {
        // ... 其他选项
        "configDir": "path/to/.storybook",
        "experimentalZoneless": true,
        "compodoc": false
      }
    },
    "build-storybook": {
      "executor": "@analogjs/storybook-angular:build-storybook",
      "options": {
        // ... 其他选项
        "configDir": "path/to/.storybook",
        "experimentalZoneless": true,
        "compodoc": false
      }
    }
```

  </TabItem>
</Tabs>

> Zoneless 变更检测是 Angular v21 开始的新项目的默认设置。

## 设置静态资产

静态资产在 `.storybook/main.ts` 文件中使用 `staticDirs` 数组进行配置。

下面的示例展示了如何添加相对于 `.storybook/main.ts` 文件的 `src/public` 中的 `public` 目录。

```ts
import { StorybookConfig } from '@analogjs/storybook-angular';

const config: StorybookConfig = {
  // 其他配置, addons 等
  framework: {
    name: '@analogjs/storybook-angular',
    options: {},
  },
  staticDirs: ['../public'],
};

export default config;
```

有关更多信息，请参阅 [Storybook 关于图像和资产的文档](https://storybook.js.org/docs/configure/integration/images-and-assets)。

## 运行 Storybook

运行启动开发服务器的命令。

```sh
npm run storybook
```

## 构建 Storybook

运行构建 storybook 的命令。

```sh
npm run build-storybook
```

## 使用 TypeScript 配置路径别名

如果你在 `tsconfig.json` 中使用 `paths`，可以在 `vite.config.ts` 中添加对这些别名的支持。

### 使用 Angular CLI

首先，安装 `vite-tsconfig-paths` 包。

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm install vite-tsconfig-paths --save-dev
```

  </TabItem>

  <TabItem label="Yarn" value="yarn">

```shell
yarn add vite-tsconfig-paths --dev
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm install -w vite-tsconfig-paths --save-dev
```

  </TabItem>
</Tabs>

接下来，将插件添加到 `.storybook/main.ts` 中的 `plugins` 数组。

```ts
import viteTsConfigPaths from 'vite-tsconfig-paths';
import { UserConfig, mergeConfig } from 'vite';

import type { StorybookConfig } from '@analogjs/storybook-angular';

const config: StorybookConfig = {
  // ... 其他配置, addons 等
  async viteFinal(config: UserConfig) {
    return mergeConfig(config, {
      plugins: [viteTsConfigPaths()],
    });
  },
};

export default config;
```

### 使用 Nx

对于 Nx 工作区，从 `@nx/vite` 包导入并使用 `nxViteTsPaths` 插件。将插件添加到 `.storybook/main.ts` 中的 `plugins` 数组。

```ts
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { UserConfig, mergeConfig } from 'vite';

import type { StorybookConfig } from '@analogjs/storybook-angular';

const config: StorybookConfig = {
  // ... 其他配置, addons 等
  async viteFinal(config: UserConfig) {
    return mergeConfig(config, {
      plugins: [nxViteTsPaths()],
    });
  },
};

export default config;
```

## 使用文件替换

你还可以使用 Nx 的 `replaceFiles()` 插件在构建期间替换文件。

导入插件并进行设置：

```ts
import { replaceFiles } from '@nx/vite/plugins/rollup-replace-files.plugin';
import { UserConfig, mergeConfig } from 'vite';

import type { StorybookConfig } from '@analogjs/storybook-angular';

const config: StorybookConfig = {
  // ... 其他配置, addons 等
  async viteFinal(config: UserConfig) {
    return mergeConfig(config, {
      plugins: [
        replaceFiles([
          {
            replace: './src/one.ts',
            with: './src/two.ts',
          },
        ]),
      ],
    });
  },
};

export default config;
```

可能还需要将替换文件添加到 `tsconfig.app.json` 中的 `files` 数组中。

```json
{
  "extends": "./tsconfig.json",
  // 其他配置
  "files": ["src/main.ts", "src/main.server.ts", "src/two.ts"]
}
```

## 设置 Vitest 进行交互测试

Storybook 还支持使用 Vitest 测试组件交互。

### 安装包

安装 Vitest 插件和依赖项：

```sh
npm install @analogjs/vitest-angular @storybook/addon-vitest vitest @vitest/browser-playwright --save-dev
```

### 添加 Vitest 插件

将插件添加到你的 `.storybook/main.ts`：

```ts
import { StorybookConfig } from '@analogjs/storybook-angular';

const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: [
    '@storybook/addon-essentials',
    '@storybook/addon-interactions',
    '@storybook/addon-vitest',
  ],
  framework: {
    name: '@analogjs/storybook-angular',
    options: {},
  },
};

export default config;
```

### 设置 Vitest 配置

创建一个 `.storybook/vitest.setup.ts` 文件：

```ts
import '@angular/compiler';
import { setProjectAnnotations } from '@analogjs/storybook-angular/testing';
import { beforeAll } from 'vitest';
import * as projectAnnotations from './preview';

const project = setProjectAnnotations([projectAnnotations]);

beforeAll(project.beforeAll);
```

更新 `.storybook/tsconfig.json` 以包含设置文件：

```json
{
  "extends": "../tsconfig.app.json",
  "compilerOptions": {
    "types": ["node"],
    "allowSyntheticDefaultImports": true,
    "resolveJsonModule": true
  },
  "exclude": ["../src/test.ts", "../src/**/*.spec.ts"],
  "include": ["../src/**/*.stories.*", "./preview.ts", "./vitest.setup.ts"],
  "files": ["./typings.d.ts"]
}
```

在你的项目根目录创建一个 `vitest.config.ts` 文件，或者添加一个 `storybook` 项目到你现有的 `vite.config.ts`：

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';

const dirname =
  typeof __dirname !== 'undefined'
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        plugins: [
          storybookTest({
            configDir: path.join(dirname, '.storybook'),
          }),
        ],
        test: {
          name: 'storybook',
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
          },
          setupFiles: ['.storybook/vitest.setup.ts'],
        },
      },
    ],
  },
});
```

### 安装 Playwright

安装 Playwright 浏览器二进制文件：

```sh
npx playwright install chromium
```

### 运行组件测试

将 `test-storybook` 目标添加到你的 `angular.json`：

```json
"test-storybook": {
  "builder": "@analogjs/vitest-angular:test",
  "options": {
    "configFile": "vitest.config.ts"
  }
}
```

将测试脚本添加到你的 `package.json`：

```json
"scripts": {
  "test-storybook": "ng run your-app:test-storybook"
}
```

运行你的交互测试：

```sh
npm run test-storybook
```

你也可以直接在 Storybook UI 中运行测试。启动 Storybook 并使用侧边栏中的“Run Tests”按钮，或导航到一个 story 以在 Interactions 面板中查看自动运行的交互测试。

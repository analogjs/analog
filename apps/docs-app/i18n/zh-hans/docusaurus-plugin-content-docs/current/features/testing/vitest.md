---
title: 添加Vitest
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# 添加 Vitest 到现有的项目

通过几个步骤，[Vitest](https://vitest.dev) 可以被添加到现有的 Angular 工作区。

## 使用原理器/生成器

通过 Angular CLI 或者 Nx 工作区的原理器/生成器来安装和设置 Vitest。

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
pnpm install -w @analogjs/platform --save-dev
```

  </TabItem>
</Tabs>

下一步，运行原理器来设置 Vite 配置，测试配置文件并且更新测试配置。

```shell
ng g @analogjs/platform:setup-vitest --project [your-project-name]
```

下一步，[运行测试](#running-tests)

## 手动安装

要手动安装 Vitest，先安装必须的包：

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm install @analogjs/vite-plugin-angular @analogjs/vitest-angular jsdom --save-dev
```

  </TabItem>

  <TabItem label="Yarn" value="yarn">

```shell
yarn add @analogjs/vite-plugin-angular @analogjs/vitest-angular jsdom --dev
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm install -w @analogjs/vite-plugin-angular @analogjs/vitest-angular jsdom --save-dev
```

  </TabItem>
</Tabs>

## 通过 Node 运行测试的配置

要配置 Vitest，在你的项目根目录创建 `vite.config.ts`：

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite';

import angular from '@analogjs/vite-plugin-angular';

export default defineConfig(({ mode }) => ({
  plugins: [angular()],
  test: {
    globals: true,
    setupFiles: ['src/test-setup.ts'],
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
  },
  define: {
    'import.meta.vitest': mode !== 'production',
  },
}));
```

下一步，定义 `src/test-setup.ts` 来配置 `TestBed`：

```ts
import '@analogjs/vitest-angular/setup-zone';

import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';
import { getTestBed } from '@angular/core/testing';

getTestBed().initTestEnvironment(
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting(),
);
```

然后，更新 `angular.json` 里的 `test` 目标，使用 `@analogjs/vitest-angular:test` 构建器：

```json
{
  "$schema": "./node_modules/@angular/cli/lib/config/schema.json",
  "version": 1,
  "newProjectRoot": "projects",
  "projects": {
    "your-project": {
      "projectType": "application",
      "architect": {
        "build": ...,
        "serve": ...,
        "extract-i18n": ...,
        "test": {
          "builder": "@analogjs/vitest-angular:test"
        }
      }
    }
  }
}
```

> 你可以不改变原有的 `test`，添加一个新的目标并且命名为 `vitest`。

最后，将 `src/test-setup.ts` 添加到你项目根目录的 `tsconfig.spec.json` 文件的 `files` 列表里，设置 `target` 为 `es2016`，并且更新 `types`。

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "./out-tsc/spec",
    "target": "es2016",
    "types": ["vitest/globals", "node"]
  },
  "files": ["src/test-setup.ts"],
  "include": ["src/**/*.spec.ts", "src/**/*.d.ts"]
}
```

然后，[运行测试](#运行测试)

## 配置在浏览器里运行测试

如果你想在浏览器里运行测试的话，Vitest 也支持，不过现在仍处于实验性阶段。

首先，按照 [通过 Node 运行测试的配置](#通过Node运行测试的配置).

然后，安装在浏览器里运行测试所必须的包：

<Tabs groupId="package-manager-browser">
  <TabItem value="npm">

```shell
npm install @vitest/browser playwright --save-dev
```

  </TabItem>

  <TabItem label="Yarn" value="yarn">

```shell
yarn add @vitest/browser playwright --dev
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm install -w @vitest/browser playwright
```

  </TabItem>
</Tabs>

更新 `vite.config.ts` 的 `test` 对象。

- 移除 `environment: 'jsdom'` 属性。
- 添加 `browser` 配置。

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite';

import angular from '@analogjs/vite-plugin-angular';

export default defineConfig(({ mode }) => ({
  plugins: [angular()],
  test: {
    globals: true,
    setupFiles: ['src/test-setup.ts'],
    // environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    // Vitest browser config
    browser: {
      enabled: true,
      name: 'chromium',
      headless: false, // set to true in CI
      provider: 'playwright',
    },
  },
  define: {
    'import.meta.vitest': mode !== 'production',
  },
}));
```

## 运行测试

使用 `test` 命令来运行测试：

<Tabs groupId="package-manager-node">
  <TabItem value="npm">

```shell
npm run test
```

  </TabItem>

  <TabItem label="Yarn" value="yarn">

```shell
yarn test
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm test
```

  </TabItem>
</Tabs>

## 快照测试

你可以调用 `expect` API 的 `toMatchSnapshot` 来运行快照测试。

下面时一个如何写一个快照测试的小例子：

```ts
// card.component.spec.ts

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CardComponent } from './card.component';

describe('CardComponent', () => {
  let fixture: ComponentFixture<CardComponent>;
  let component: CardComponent;

  beforeEach(() =>
    TestBed.configureTestingModule({
      imports: [CardComponent],
    }),
  );

  beforeEach(() => {
    fixture = TestBed.createComponent(CardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the app', () => {
    expect(fixture).toMatchSnapshot();
  });
});
```

在你运行这个测试以后，一个 `card.component.spec.ts.snap` 文件将会在 `__snapshots__` 目录下被创建，并包含如下内容：

```ts
// Vitest Snapshot v1, https://vitest.dev/guide/snapshot.html

exports[`CardComponent > should create the app 1`] = `
  <component-code>
`;
```

生成的快照应该进行审核并添加到版本控制里去。

## 使用 TypeScript 配置目录别名

如果你使用了 `tsconfig.json` 里的 `paths`，这些别名可以被添加到 `vite.config.ts` 里。

### 基于 Angular CLI

首先，运行 `vite-tsconfig-paths` 包。

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

下一步，把这个插件添加到 `vite.config.ts` 的 `plugins` 列表，并且设置 `root` 为项目根目录的相对路径。

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite';

import angular from '@analogjs/vite-plugin-angular';
import viteTsConfigPaths from 'vite-tsconfig-paths';

export default defineConfig(({ mode }) => ({
  plugins: [angular(), viteTsConfigPaths()],
}));
```

### 基于 Nx

从 `@nx/vite` 包导入并使用 `nxViteTsPaths` 插件。

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite';

import angular from '@analogjs/vite-plugin-angular';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

export default defineConfig(({ mode }) => ({
  plugins: [angular(), nxViteTsPaths()],
}));
```

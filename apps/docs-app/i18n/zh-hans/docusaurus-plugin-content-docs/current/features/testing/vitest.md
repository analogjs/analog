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

然后，[运行测试](#运行测试)

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

### Zone.js 设置

如果你使用 `Zone.js` 进行变更检测，导入 `setup-zone` 脚本。此脚本自动包含设置快照测试的支持。

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

### 无 Zone 设置

如果你使用 `Zoneless` 变更检测，使用以下设置：

```ts
import '@analogjs/vitest-angular/setup-snapshots';

import {
  provideExperimentalZonelessChangeDetection,
  NgModule,
} from '@angular/core';
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';
import { getTestBed } from '@angular/core/testing';

@NgModule({
  providers: [provideExperimentalZonelessChangeDetection()],
})
export class ZonelessTestModule {}

getTestBed().initTestEnvironment(
  [BrowserDynamicTestingModule, ZonelessTestModule],
  platformBrowserDynamicTesting(),
);
```

接下来，更新 `angular.json` 中的 `test` 目标以使用 `@analogjs/vitest-angular:test` 构建器：

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

> 你也可以添加一个新的目标并命名为 `vitest` 以与 `test` 目标一起运行。

最后，将 `src/test-setup.ts` 添加到项目根目录的 `tsconfig.spec.json` 的 `files` 数组中，将 `target` 设置为 `es2016`，并更新 `types`。

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

接下来，前往 [运行测试](#运行测试)

## 在浏览器中运行测试的设置

如果你更喜欢在浏览器中运行测试，Vitest 也有实验性的浏览器测试支持。

首先，按照[在 Node 中运行测试](#通过 Node 运行测试的配置)的步骤进行操作。

然后，安装在浏览器中运行测试所需的包：

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

更新 `vite.config.ts` 中的 `test` 对象。

- 移除 `environment: 'jsdom'` 属性。
- 为 Vitest 添加一个 `browser` 配置。

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
    // Vitest 浏览器配置
    browser: {
      enabled: true,
      name: 'chromium',
      headless: false, // 在 CI 中设置为 true
      provider: 'playwright',
    },
  },
  define: {
    'import.meta.vitest': mode !== 'production',
  },
}));
```

接下来，添加 `@angular/compiler` 导入到 `src/test-setup.ts` 文件。

```ts
import '@angular/compiler';
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

## 运行测试

要运行单元测试，使用 `test` 命令：

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

> 也可以直接使用 `npx vitest` 命令。

## 快照测试

对于快照测试，你可以使用 `expect` API 中的 `toMatchSnapshot`。

下面是一个如何编写快照测试的小例子：

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

运行测试后，会在 `__snapshots__` 文件夹中创建一个 `card.component.spec.ts.snap` 文件，内容如下：

```ts
// Vitest Snapshot v1, https://vitest.dev/guide/snapshot.html

exports[`CardComponent > should create the app 1`] = `
  <component-code>
`;
```

生成的快照应进行审核并添加到版本控制中。

## 使用 TypeScript 配置路径别名

如果你在 `tsconfig.json` 中使用了 `paths`，可以在 `vite.config.ts` 中添加对这些别名的支持。

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

接下来，在 `vite.config.ts` 中的 `plugins` 数组中添加该插件，并将 `root` 设置为项目根目录的相对路径。

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite';

import angular from '@analogjs/vite-plugin-angular';
import viteTsConfigPaths from 'vite-tsconfig-paths';

export default defineConfig(({ mode }) => ({
  plugins: [angular(), viteTsConfigPaths()],
}));
```

### 使用 Nx

对于 Nx 工作区，从 `@nx/vite` 包中导入并使用 `nxViteTsPaths` 插件。

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite';

import angular from '@analogjs/vite-plugin-angular';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

export default defineConfig(({ mode }) => ({
  plugins: [angular(), nxViteTsPaths()],
}));
```

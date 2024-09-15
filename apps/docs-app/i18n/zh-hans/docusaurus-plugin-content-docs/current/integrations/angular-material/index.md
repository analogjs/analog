---
sidebar_position: 3
title: Angular Material
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# 集成 Angular Material

此向导将向你展示如何在 Analog 应用里集成 Angular Material。

## 步骤 1: 安装 Angular Material 库

你需要先安装 `@angular/cdk` 和 `@angular/material` 包。基于你所选的包管理器，运行以下命令中的一种：

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm install @angular/cdk @angular/material
```

  </TabItem>

  <TabItem label="yarn" value="yarn">

```shell
yarn add @angular/cdk @angular/material
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm install @angular/cdk @angular/material
```

  </TabItem>
</Tabs>

## 步骤 2: 配置 Angular Material 库

1. 重命名 `styles.css` 为 `styles.scss`。
2. 在 `vite.config.ts` 里设置 `inlineStylesExtension` 属性 为 `'scss'`：

```ts
export default defineConfig(({ mode }) => {
  return {
    plugins: [
      analog({
        vite: {
          inlineStylesExtension: 'scss',
        },
      }),
    ],
  };
});
```

3. 更新 `index.html` 文件来引用 SCSS 样式：

```html
<head>
  <!-- other headers -->
  <link rel="stylesheet" href="/src/styles.scss" />
  <link rel="preconnect" href="https://fonts.gstatic.com" />
  <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500&display=swap" rel="stylesheet" />
  <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet" />
</head>
<body class="mat-typography">
  <!-- content -->
</body>
```

4. 更新 `styles.scss` 文件，导入 Angular Material 样式并设置自定义主题：

```scss
@use '@angular/material' as mat;

$theme: mat.define-theme(
  (
    color: (
      theme-type: light,
      primary: mat.$azure-palette,
      tertiary: mat.$blue-palette,
    ),
  )
);

body {
  @include mat.all-component-themes($theme);
  font-family: Roboto, 'Helvetica Neue', sans-serif;
  margin: 0;
  padding: 30px;
  height: 100%;
}

html {
  height: 100%;
}

@include mat.core();
@include mat.color-variants-backwards-compatibility($theme);
```

## 可选步骤: 配置动画

如果你想要启用或者禁用动画效果，参考以下步骤：

1. 打开 `app.config.ts` 文件并添加 `provideAnimations()` 为依赖提供者

```ts
providers: [
  // other providers
  provideAnimations(),
],
```

2. 打开 `app.config.server.ts` 文件并添加 `provideNoopAnimations()` 为依赖提供者

```ts
providers: [
  // other providers
  provideNoopAnimations(),
],
```

以上步骤将在你 Analog 应用的客户端启用动画并且在你的服务端禁用动画。

就这些！你已经在你的 Analog 应用里成功的安装并且配置了 Angular Material 库。你现在可以在你的项目里使用 Angular Material 组件和样式了。

要了解更多关于 Angular Material 主题的信息，请参考 [Angular Material 主题向导](https://material.angular.io/guide/theming)。

---
sidebar_position: 4
title: Ionic Framework
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# 集成 Ionic 框架

此向导将向你展示如何在 Analog 应用里集成 Ionic 框架，这样你就可以在你的 Analog 项目里应用 Ionic 强大的 iOS 以及 Andriod 组件了。

## 步骤 1: 安装 Ionic 框架

你先要安装 `@ionic/angular@latest` 包。基于你的包管理器，运行下面命令中的一种：

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm install @ionic/angular@latest
```

  </TabItem>

  <TabItem label="yarn" value="yarn">

```shell
yarn add @ionic/angular@latest
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm install @ionic/angular@latest
```

  </TabItem>
</Tabs>

### 可选: 安装 Ionic Angular 原理器工具

Ionic 也提供了一系列原理器帮助你按照 Ionic 的结构创建组件。你可以通过安装 `@ionic/angular-toolkit` 包到你的 devDependencies 来添加。

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm install -D @ionic/angular-toolkit
```

  </TabItem>

  <TabItem label="yarn" value="yarn">

```shell
yarn add -D @ionic/angular-toolkit
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm install -D @ionic/angular-toolkit
```

  </TabItem>
</Tabs>

### 可选: 安装 Ionicons: Ionic 自定义图标库

Ionic 还提供了一个包括了移动应用所需的超过了 500 个的图标库。你可以通过添加 `ionicons` 包到你的项目来安装它：

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm install ionicons
```

  </TabItem>

  <TabItem label="yarn" value="yarn">

```shell
yarn add ionicons
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm install ionicons
```

  </TabItem>
</Tabs>

## 步骤 2: 在你的应用里配置 Ionic 框架

1. 更新你的 `vite.config.ts` 文件，在 **SSR** 处理里添加 Ionic 包，把他们添加到 `noExternal` 列表。如果你安装了 ionicons 包，你可以也加进去。如果你使用 Vitest，把 @ionic/angular 包添加到 inline 以允许 Vitest 能正确构建。

```ts
export default defineConfig(({ mode }) => {
  return {
    // ...

    // add these lines
    ssr: {
      noExternal: ['@ionic/**', '@stencil/**', 'ionicons'],
    },

    // ...

    // add these lines if you use Vitest
    test: {
      server: {
        deps: {
          inline: ['@ionic/angular'],
        },
      },
    },
  };
});
```

2. 在 `app.config.ts` 里添加 `provideIonicAngular` 方法和 `IonicRouteStrategy` 依赖提供者

```ts
import { RouteReuseStrategy, provideRouter } from '@angular/router';
import {
  IonicRouteStrategy,
  provideIonicAngular,
} from '@ionic/angular/standalone';

export const appConfig: ApplicationConfig = {
  providers: [
    provideFileRouter(),
    provideClientHydration(),
    provideHttpClient(withFetch()),
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular(),
  ],
};
```

3. 更新你的 `app.component.ts` 文件以在模板中设置所需的 Ionic 标签。你可能要查看 [服务端渲染注意事项](#server-side-rendering-caveat) 因为 [Ionic 尚不支持客户端水合](https://github.com/ionic-team/)

```ts
import { Component } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';

@Component({
  selector: 'demo-root',
  standalone: true,
  imports: [IonApp, IonRouterOutlet],
  template: `<ion-app><ion-router-outlet></ion-router-outlet></ion-app>`,
})
export class AppComponent {}
```

4. 重命名 `styles.css` 为 `styles.scss`.
5. 设置 `vite.config.ts` 文件里的 `inlineStylesExtension` 属性为 `'scss'`：

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

6. 更新 `index.html` 文件并应用 SCSS 文件：

```html
<head>
  <!-- other headers -->
  <link rel="stylesheet" href="/src/styles.scss" />
</head>
<body>
  <!-- content -->
</body>
```

7. 更新 `styles.scss` 文件，导入 Ionic 样式并定义你的 [自定义主题](https://ionicframework.com/docs/theming/color-generator)：

```scss
/* Core CSS required for Ionic components to work properly */
@import '@ionic/angular/css/core.css';

/* Basic CSS for apps built with Ionic */
@import '@ionic/angular/css/normalize.css';
@import '@ionic/angular/css/structure.css';
@import '@ionic/angular/css/typography.css';
@import '@ionic/angular/css/display.css';

/* Optional CSS utils that can be commented out */
@import '@ionic/angular/css/padding.css';
@import '@ionic/angular/css/float-elements.css';
@import '@ionic/angular/css/text-alignment.css';
@import '@ionic/angular/css/text-transformation.css';
@import '@ionic/angular/css/flex-utils.css';

/**
 * Ionic Dark Mode
 * -----------------------------------------------------
 * For more info, please see:
 * https://ionicframework.com/docs/theming/dark-mode
 */

/* @import "@ionic/angular/css/palettes/dark.always.css"; */
/* @import "@ionic/angular/css/palettes/dark.class.css"; */
@import '@ionic/angular/css/palettes/dark.system.css';
```

### 服务端渲染注意事项

Ionic 框架 [尚不支持 Angular 新的客户端水合](https://github.com/ionic-team/ionic-framework/issues/28625#issuecomment-1843919548), 因为 Angular [不支持带有 web components 的 SSR](https://github.com/angular/angular/issues/52275), 并且当它们受支持时，必须对 Stencil 组件进行一些工作才能启用它。因此目前有三个选项可以解决这个问题:

1. 从 `app.config.ts` 依赖提供者里移除 `provideClientHydration()`。

   - 下面的代码移除 Angular 新的客户端水合机制并改为上一个版本，新的版本会导致客户端重渲染时的闪屏现象。

   ```ts
   import { RouteReuseStrategy, provideRouter } from '@angular/router';
   import {
     IonicRouteStrategy,
     provideIonicAngular,
   } from '@ionic/angular/standalone';

   export const appConfig: ApplicationConfig = {
     providers: [
       provideFileRouter(),
       //provideClientHydration(), // remove this.
       provideHttpClient(withFetch()),
       { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
       provideIonicAngular(),
     ],
   };
   ```

2. 在 `ion-app` 标签上添加 `ngSkipHydration` 属性。

   - 这将在 `ion-app` 元素及其子元素上禁用客户端水合机制，但将继续对其他元素使用客户端水合。这还会导致 Ionic 组件的页面闪，而且对其他元素/组件没有太大帮助，因为对于 Ionic 应用，您的所有 Ionic 组件都存在于 `ion-app` 标签内。

     ```ts
     import { Component } from '@angular/core';
     import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';

     @Component({
       selector: 'demo-root',
       standalone: true,
       imports: [IonApp, IonRouterOutlet],
       template: `
         <ion-app ngSkipHydration>
           <ion-router-outlet></ion-router-outlet>
         </ion-app>
       `,
     })
     export class AppComponent {}
     ```

3. 完全禁用 SSR

   - 在 `vite.config.ts` 里禁用 SSR。这将 **消除闪烁** 但是你将失去 SSR 带来的任何好处。

     ```ts
     plugins: [
       analog({
         ssr: false,
       }),
     ],
     ```

你 **必须** 选择一种方案，不然的话你的应用将会抛出运行时错误，就像下面这样：

```js
ERROR Error: NG0500: During hydration Angular expected <ion-toolbar> but found a comment node.

Angular expected this DOM:

  <ion-toolbar color="secondary">…</ion-toolbar>  <-- AT THIS LOCATION
  …


Actual DOM is:

<ion-header _ngcontent-ng-c1775393043="">
  <!--  -->  <-- AT THIS LOCATION
  …
</ion-header>

Note: attributes are only displayed to better represent the DOM but have no effect on hydration mismatches.

To fix this problem:
  * check the "AppComponent" component for hydration-related issues
  * check to see if your template has valid HTML structure
  * or skip hydration by adding the `ngSkipHydration` attribute to its host node in a template
```

## 步骤 3: 添加 Capacitor (可选)

Capacitor 将帮助你便捷的开发可以在 iOS 和 Android 设备上运行的 web 原生应用。

### 步骤 3.1 安装并配置你的 Capacitor 应用

1. 首先，你需要安装 `@capacitor/core` 和 `@capacitor/cli` 包。基于你的包管理器，运行下面命令中的一种：

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm install @capacitor/core
npm install -D @capacitor/cli
```

  </TabItem>

  <TabItem label="yarn" value="yarn">

```shell
yarn add @capacitor/core
yarn add -D @capacitor/cli
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm install @capacitor/core
pnpm install -D @capacitor/cli
```

  </TabItem>
</Tabs>

2. 然后你要执行以下命令初始化 Capacitor 项目。这个 CLI 会提供一些选项，从你的 app 名字开始，然后是你的应用包的 ID。

```shell
npx cap init
```

3. 更新 `capacitor.config.ts` 的 `webDir` 属性指向 analog 构建的 dist 目录

```ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ionic.capacitor',
  appName: 'ionic-capacitor',
  webDir: 'dist/analog/public',
};

export default config;
```

### 步骤 3.2 创建你的 Android 和 iOS 项目

1. 基于你想要支持的手机平台，安装 `@capacitor/android` 和/或 `@capacitor/ios` 包。

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm install @capacitor/android
npm install @capacitor/ios
```

  </TabItem>

  <TabItem label="yarn" value="yarn">

```shell
yarn add @capacitor/android
yarn add @capacitor/ios
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm install @capacitor/android
pnpm install @capacitor/ios
```

  </TabItem>
</Tabs>

2. 将 Android 和/或 iOS 项目添加到你的应用

```shell
npx cap add android
npx cap add ios
```

3. 将文件同步到你安装的平台

```shell
npx cap sync
```

4. 你可以用下面的命令运行你的应用了

```shell
npx cap run android
npx cap run ios
```

---

就这样！你成功的在你的 Analog 应用里安装并配置了 Ionic 框架和 Capacitor！

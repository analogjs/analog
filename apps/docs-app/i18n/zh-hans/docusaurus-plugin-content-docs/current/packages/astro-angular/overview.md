---
title: 'Astro'
---

# @analogjs/astro-angular

[Astro](https://astro.build) 是一款现代化的 web 框架，旨在构建快速、以内容为中心的网站，与所有主要前端框架兼容。虽然它主要是一个静态站点生成 (SSG) 工具，但它也可以集成称为“岛”的动态组件，支持部分水合。

这个软件包允许将 [Angular](https://angular.dev) 渲染为 Astro 中的岛

## 安装

### 使用 Astro CLI

使用 `astro add` 命令安装集成

```sh
# Using NPM
npx astro add @analogjs/astro-angular
# Using Yarn
yarn astro add @analogjs/astro-angular
# Using PNPM
pnpm astro add @analogjs/astro-angular
```

这个命令将：

- 安装 `@analogjs/astro-angular` 包。
- 添加 `@analogjs/astro-angular` 集成到 `astro.config.mjs` 文件。
- 安装在服务端和客户端上呈现 Angular 组件所需的依赖项，以及常见的 Angular 依赖项，例如 `@angular/common`。

### 设置 TypeScript 配置

这个集成需要在根目录添加一个 `tsconfig.app.json` 文件用于编译。

在你项目的根目录添加一个 `tsconfig.app.json`。

```json
{
  "extends": "./tsconfig.json",
  "compileOnSave": false,
  "compilerOptions": {
    "baseUrl": "./",
    "outDir": "./dist/out-tsc",
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "sourceMap": true,
    "declaration": false,
    "downlevelIteration": true,
    "experimentalDecorators": true,
    "moduleResolution": "node",
    "importHelpers": true,
    "noEmit": false,
    "target": "es2020",
    "module": "es2020",
    "lib": ["es2020", "dom"],
    "skipLibCheck": true
  },
  "angularCompilerOptions": {
    "enableI18nLegacyMessageIdFormat": false,
    "strictInjectionParameters": true,
    "strictInputAccessModifiers": true,
    "strictTemplates": true,
    "allowJs": false
  },
  "files": [],
  "include": ["src/**/*.ts", "src/**/*.tsx"]
}
```

前往 [定义一个组件](#定义一个组件) 来添加用于 Astro 组件中的 Angular 组件

## 手动安装

这个集成也可以通过手动的方式安装

### 安装 Astro 集成

```sh
yarn add @analogjs/astro-angular
```

### 安装所需的 Angular 依赖

```sh
yarn add @angular-devkit/build-angular @angular/{animations,common,compiler-cli,compiler,core,language-service,forms,platform-browser,platform-browser-dynamic,platform-server} rxjs zone.js tslib
```

### 添加这个集成

将集成添加到 `astro.config.mjs`

```js
import { defineConfig } from 'astro/config';
import angular from '@analogjs/astro-angular';

export default defineConfig({
  integrations: [angular()],
});
```

前往 [定义一个组件](#定义一个组件)

## 配置

### 配置 Vite Angular 插件

添加一个选项对象为该插件提供支持的 `@analogjs/vite-plugin-angular`。

```js
import { defineConfig } from 'astro/config';
import angular from '@analogjs/astro-angular';

export default defineConfig({
  integrations: [
    angular({
      vite: {
        inlineStylesExtension: 'scss|sass|less',
      },
    }),
  ],
});
```

### 转换包以实现 SSR 兼容性

为了确保 Angular 库在 Astro 的 SSR 过程中进行转换，请将他们添加到 Vite 配置中的 `ssr.noExternal` 列表里。

```js
import { defineConfig } from 'astro/config';

import angular from '@analogjs/astro-angular';

export default defineConfig({
  integrations: [angular()],
  vite: {
    ssr: {
      // transform these packages during SSR. Globs supported
      noExternal: ['@rx-angular/**'],
    },
  },
});
```

## 定义一个组件

Astro Angular 集成**仅**支持渲染独立组件：

```ts
import { NgIf } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-hello',
  standalone: true,
  imports: [NgIf],
  template: `
    <p>Hello from Angular!!</p>

    <p *ngIf="show">{{ helpText }}</p>

    <button (click)="toggle()">Toggle</button>
  `,
})
export class HelloComponent {
  @Input() helpText = 'help';

  show = false;

  toggle() {
    this.show = !this.show;
  }
}
```

将 Angular 组件添加到 Astro 组件模板里。这仅呈现来自 Angular 组件的 HTML。

```tsx
---
import { HelloComponent } from '../components/hello.component';

const helpText = "Helping binding";
---

<HelloComponent />
<HelloComponent helpText="Helping" />
<HelloComponent helpText={helpText} />
```

要在客户端水合组件，使用 Astro [客户端指令](https://docs.astro.build/en/reference/directives-reference/#client-directives) 中的一种：

```tsx
---
import { HelloComponent } from '../components/hello.component';
---

<HelloComponent client:visible />
```

在 Astro 文档里查看更多关于 [客户端指令](https://docs.astro.build/en/reference/directives-reference/#client-directives) 的信息。

### 监听组件的输出

Angular 组件的 Outputs 可以被转发到 Astro 岛的 HTML 时间。
要启用这个功能，在每一个 Angular 组件上添加一个客户端指令和一个唯一的 `[data-analog-id]` 属性。

```tsx
---
import { HelloComponent } from '../components/hello.component';
---

<HelloComponent client:visible data-analog-id="hello-component-1" />
```

然后，在 Astro 组件上用 `addOutputListener` 函数监听事件：

```tsx
---
import { HelloComponent } from '../components/hello.component';
---

<HelloComponent client:visible data-analog-id="hello-component-1" />

<script>
  import { addOutputListener } from '@analogjs/astro-angular/utils';

  addOutputListener('hello-component-1', 'outputName', (event) => {
    console.log(event.detail);
  });
</script>
```

## 添加组件的依赖提供者

可以将附加依赖提供者添加到组件，以进行静态渲染和客户端水合。

他们分别是 `renderProviders` 和 `clientProviders`。这些提供者在组件类上被定义为静态数组，并且在组件渲染时注册，并在客户端上进行水合。

```ts
import { Component, OnInit, inject } from '@angular/core';
import { NgFor } from '@angular/common';
import { provideHttpClient, HttpClient } from '@angular/common/http';

interface Todo {
  id: number;
  title: string;
  completed: boolean;
}

@Component({
  selector: 'app-todos',
  standalone: true,
  imports: [NgFor],
  template: `
    <h2>Todos</h2>

    <ul>
      <li *ngFor="let todo of todos">
        {{ todo.title }}
      </li>
    </ul>
  `,
})
export class TodosComponent implements OnInit {
  static clientProviders = [provideHttpClient()];
  static renderProviders = [];

  http = inject(HttpClient);
  todos: Todo[] = [];

  ngOnInit() {
    this.http
      .get<Todo[]>('https://jsonplaceholder.typicode.com/todos')
      .subscribe((todos) => (this.todos = todos));
  }
}
```

## 在 MDX 页面上使用组件

要在 MDX 页面上使用组件，您必须按照 [@astrojs/mdx](https://docs.astro.build/en/guides/integrations-guide/mdx/) 的 Astro 集成安装和配置 MDX 支持。你的 `astro.config.mjs` 现在应该包含 `@astrojs/mdx` 集成。

> 注意：Shiki 是 MDX 插件的默认语法高亮插件但是当前还不支持。 `astro-angular` 会用 `prism` 覆盖默认的配置，但是你应该在配置里显示指定以阻止警告或者错误。

```js
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import angular from '@analogjs/astro-angular';

export default defineConfig({
  integrations: [mdx({ syntaxHighlight: 'prism' }), angular()],
});
```

在 `src/pages` 目录创建一个 `.mdx` 文件然后按照下面的格式导入一个 Angular 组件。

```md
---
layout: '../../layouts/BlogPost.astro'
title: 'Using Angular in MDX'
description: 'Lorem ipsum dolor sit amet'
pubDate: 'Sep 22 2022'
---

import { HelloComponent } from "../../components/hello.component.ts";

<HelloComponent />
<HelloComponent helpText="Helping" />
```

要在客户端水合组件，使用 Astro [客户端指令](https://docs.astro.build/en/reference/directives-reference/#client-directives)的一种：

```md
---
layout: '../../layouts/BlogPost.astro'
title: 'Using Angular in MDX'
description: 'Lorem ipsum dolor sit amet'
pubDate: 'Sep 22 2022'
---

import { HelloComponent } from "../../components/hello.component.ts";

<HelloComponent client:load />
<HelloComponent client:visible helpText="Helping" />
```

> 重要：在 `.mdx` 文件里导入组件必须以 `.ts` 后缀结尾。否则导入组件会失败并且不会被水合。

## 当前的限制

- 只支持 v14.2+ 以上版本的独立 Angular 组件

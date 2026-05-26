---
title: 'Astro'
---

# @analogjs/astro-angular

[Astro](https://astro.build) 是一个现代 Web 框架，专为构建快速、内容为中心的网站而设计，兼容所有主流前端框架。虽然它主要是一个静态站点生成 (SSG) 工具，但它也可以集成称为 "islands" 的动态组件，这些组件支持部分 hydration。

此包允许在 Astro 中将 [Angular](https://angular.dev) 组件作为 islands 渲染。

## 设置

### 使用 Astro CLI

使用 `astro add` 命令安装集成

使用 npm:

```sh
npx astro add @analogjs/astro-angular
```

使用 pnpm:

```sh
pnpm astro add @analogjs/astro-angular
```

使用 yarn:

```sh
yarn astro add @analogjs/astro-angular
```

此命令将：

- 安装 `@analogjs/astro-angular` 包。
- 将 `@analogjs/astro-angular` 集成添加到 `astro.config.mjs` 文件中。
- 安装在服务端和客户端渲染 Angular 组件所需的依赖项，以及常见的 Angular 依赖项，例如 `@angular/common`。

### 设置 TypeScript 配置

该集成需要在项目根目录下有一个 `tsconfig.app.json` 用于编译。

在项目根目录下创建一个 `tsconfig.app.json`。

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

前往 [定义组件](#defining-a-component) 以设置要在 Astro 组件中使用的 Angular 组件。

## 手动安装

也可以手动安装该集成

### 安装 Astro 集成

```sh
yarn add @analogjs/astro-angular
```

### 安装必要的 Angular 依赖项

```sh
npm install @angular/build @angular/{animations,common,compiler-cli,compiler,core,language-service,forms,platform-browser,platform-server} rxjs tslib --save
```

### 添加集成

将集成添加到 `astro.config.mjs`

```js
import { defineConfig } from 'astro/config';
import angular from '@analogjs/astro-angular';

export default defineConfig({
  integrations: [angular()],
});
```

前往 [定义组件](#defining-a-component)

## 配置

### 配置 Vite Angular 插件

提供一个选项对象来配置驱动此插件的 `@analogjs/vite-plugin-angular`。

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

### 过滤文件转换

为了在与其他插件（如 [Starlight](https://starlight.astro.build)）集成时获得更好的兼容性，请将 Angular 组件放在特定文件夹中，并使用 `transformFilter` 回调函数仅转换这些文件。

```js
import { defineConfig } from 'astro/config';
import angular from '@analogjs/astro-angular';

export default defineConfig({
  integrations: [
    angular({
      vite: {
        transformFilter: (_code, id) => {
          return id.includes('src/components'); // <- only transform Angular TypeScript files
        },
      },
    }),
  ],
});
```

### 为 SSR 兼容性转换包

为确保 Angular 库在 Astro 的 SSR 过程中被转换，请将它们添加到 Vite 配置中的 `ssr.noExternal` 数组中。

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

## 定义组件

Astro Angular 集成 **仅** 支持渲染 standalone components：

```ts
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-hello',
  template: `
    <p>Hello from Angular!!</p>

    @if (show()) {
      <p>{{ helpText() }}</p>
    }

    <button (click)="toggle()">Toggle</button>
  `,
})
export class HelloComponent {
  helpText = input('help');

  show = signal(false);

  toggle() {
    this.show.update((show) => !show);
  }
}
```

将 Angular 组件添加到 Astro 组件模板中。这仅渲染 Angular 组件的 HTML。

```tsx
---
import { HelloComponent } from '../components/hello.component';

const helpText = "Helping binding";
---

<HelloComponent />
<HelloComponent helpText="Helping" />
<HelloComponent helpText={helpText} />
```

要在客户端 hydrate 组件，请使用 Astro [client directives](https://docs.astro.build/en/reference/directives-reference/#client-directives) 之一：

```tsx
---
import { HelloComponent } from '../components/hello.component';
---

<HelloComponent client:visible />
```

在 Astro 文档中查找有关 [Client Directives](https://docs.astro.build/en/reference/directives-reference/#client-directives) 的更多信息。

### 监听组件 Output

Angular 组件发出的 Output 会作为 HTML 事件转发给 Astro island。
要启用此功能，请向每个 Angular 组件添加一个 client directive 和唯一的 `[data-analog-id]` 属性：

```tsx
---
import { HelloComponent } from '../components/hello.component';
---

<HelloComponent client:visible data-analog-id="hello-component-1" />
```

然后，使用 `addOutputListener` 函数在 Astro 组件中监听该事件：

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

## 添加组件 Providers

可以向组件添加额外的 providers 以用于静态渲染和客户端 hydration。

它们分别是 `renderProviders` 和 `clientProviders`。这些 providers 被定义为组件类上的静态数组，并在组件渲染和在客户端 hydrate 时注册。

```ts
import { Component, OnInit, inject } from '@angular/core';
import { provideHttpClient, HttpClient } from '@angular/common/http';

interface Todo {
  id: number;
  title: string;
  completed: boolean;
}

@Component({
  selector: 'app-todos',
  template: `
    <h2>Todos</h2>

    <ul>
      @for (todo of todos(); track todo.id) {
        <li>
          {{ todo.title }}
        </li>
      }
    </ul>
  `,
})
export class TodosComponent implements OnInit {
  static clientProviders = [provideHttpClient()];
  static renderProviders = [TodosComponent.clientProviders];

  http = inject(HttpClient);
  todos = signal<Todo[]>([]);

  ngOnInit() {
    this.http
      .get<Todo[]>('https://jsonplaceholder.typicode.com/todos')
      .subscribe((todos) => this.todos.set(todos));
  }
}
```

## 在 MDX 页面中使用组件

要在 MDX 页面中使用组件，必须按照 [@astrojs/mdx](https://docs.astro.build/en/guides/integrations-guide/mdx/) 的 Astro 集成指南安装和配置 MDX 支持。你的 `astro.config.mjs` 现在应该包含 `@astrojs/mdx` 集成。

```js
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import angular from '@analogjs/astro-angular';

export default defineConfig({
  integrations: [mdx(), angular()],
});
```

在 `src/pages` 目录中创建一个 `.mdx` 文件，并在 frontmatter 下方添加 Angular 组件导入。

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

要在客户端 hydrate 组件，请使用 Astro [client directives](https://docs.astro.build/en/reference/directives-reference/#client-directives) 之一：

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

> 重要提示：在 `.mdx` 文件中，组件导入必须以 `.ts` 后缀结尾。否则，组件的动态导入将失败，组件将不会被 hydrate。

## 当前限制

- 仅支持 v14.2+ 版本的 standalone Angular 组件
- 不支持向 island 组件进行内容投影 (Content projection)

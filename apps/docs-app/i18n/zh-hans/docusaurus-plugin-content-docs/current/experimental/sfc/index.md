---
sidebar_position: 1
---

# Analog SFCs

> **注意:**
>
> 这个文件格式和 API 是实验性的，由社区驱动的，并非 Angular 官方提议的变更。使用它需要你自担风险。

`.analog` 文件扩展名表示单文件组件（SFCs）的新文件格式，旨在简化开发体验并提供与 Angular 兼容的组件和指令。

总而言之，它结合了:

- 共置模板，脚本和样式标签
- 使用没有装饰器的 Angular 信号 API
- 默认性能优先（`OnPush` 变更检测, 不访问 `ngDoCheck`, 等等。）

## 使用

要使用 Analog SFC，你需要使用 Analog Vite 插件或者 [Analog Astro 插件](/docs/packages/astro-angular/overview)并提供额外的选项来启用：

```typescript
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';

export default defineConfig({
  // ...
  plugins: [
    analog({
      vite: {
        // Required to use the Analog SFC format
        experimental: {
          supportAnalogFormat: true,
        },
      },
    }),
  ],
});
```

> 你必须取消注释 `src/vite-env.d.ts` 里的类型信息。在 Angular SFC 实验性阶段这是临时的。

### 额外的配置

如果你使用了在项目的根目录以外的 `.analog` 文件，你需要通过 globs 指定所有的 `.analog` 文件，例如：

```typescript
export default defineConfig(({ mode }) => ({
  // ...
  plugins: [
    analog({
      vite: {
        experimental: {
          supportAnalogFormat: {
            include: ['/libs/shared/ui/**/*', '/libs/some-lib/ui/**/*'],
          },
        },
      },
    }),
  ],
}));
```

### IDE 支持

要支持 `.analog` 文件的语法高亮和其他 IDE 功能，你需要为 IDE 安装一些扩展：

- [WebStorm 2024.1+ or IDEA Ultimate 2024.1+ (EAP)](https://github.com/analogjs/idea-plugin)

> [VSCode 即将支持！请查看这个 issue 了解详细](https://github.com/analogjs/analog/issues/858/).

## 编写一个 SFC

这是一个简单计数器的的例子：

```html
<script lang="ts">
  // counter.analog
  import { signal } from '@angular/core';

  const count = signal(0);

  function add() {
    count.set(count() + 1);
  }
</script>

<template>
  <div class="container">
    <button (click)="add()">{{count()}}</button>
  </div>
</template>

<style>
  .container {
    display: flex;
    justify-content: center;
  }

  button {
    font-size: 2rem;
    padding: 1rem 2rem;
    border-radius: 0.5rem;
    background-color: #f0f0f0;
    border: 1px solid #ccc;
  }
</style>
```

查看 [定义元数据](#定义元数据) 章节来添加额外的组件元数据。

## 定义元数据

与传统的 Angular 写法里用类装饰器来添加组件或者指令的元数据不同，在 Analog 格式里用全局的 `defineMetadata` 函数来定义元数据：

```typescript
defineMetadata({
  host: { class: 'block articles-toggle' },
});
```

这个函数支持 `@Component` 或 `@Directive` 的所有的装饰器，除了一些例外。

### 禁用的元数据属性

以下的数据在元数据字段是无法指定的：

- `template`: 使用 SFC `<template>` 或者 `defineMetadata.templateUrl`
- `standalone`: 总是 `true`
- `changeDetection`: 总是 `OnPush`
- `styles`: 使用 SFC `<style>` 标签
- `outputs`: 使用 `output` signal API
- `inputs`: 使用 `input` signal API

### Host 元数据

如上所展示，你可以通过 `host` 字段在你的组件里添加 host 元数据：

```typescript
defineMetadata({
  host: { class: 'block articles-toggle' },
});
```

另一个方式添加元数据是用 `<template>` 标签

```html
<template class="block articles-toggle"></template>
```

你还可以在 `<template>` 标签里使用 **属性绑定** 和 **事件绑定** ：

```html
<script lang="ts">
  import { signal } from '@angular/core';

  const bg = signal('black');

  function handleClick() {}
</script>

<template [style.backgroundColor]="bg()" (click)="handleClick()"></template>
```

### 使用外部的模板和样式

如果你喜欢用 Analog 的 `<script>` 开发体验来实现你的逻辑，但是你不想把模板和样式都放在同一个文件里，你可以用下面的方式把它们放到各自的目录里：

- `templateUrl`
- `styleUrl`
- `styleUrls`

在 `defineMetadata`里，类似这样：

```html
<script lang="ts">
  defineMetadata({
    selector: 'app-root',
    templateUrl: './test.html',
    styleUrl: './test.css',
  });

  onInit(() => {
    alert('Hello World');
  });
</script>
```

## 使用组件

当使用 Analog 格式时，你不用显示的导出任何东西，`.analog` 文件里的组件默认都会被导出：

```typescript
import { bootstrapApplication } from '@angular/platform-browser';
import App from './app/app.analog';
import { appConfig } from './app/app.config';

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
```

要使用这些组件，你需要将他们添加到你的 `imports` （或者你可以使用如下所示的 **导入属性** ）：

```html
<!-- layout.analog -->
<script lang="ts">
  import { inject } from '@angular/core';
  import { RouterOutlet } from '@angular/router';
  import { AuthStore } from '../shared-data-access-auth/auth.store';
  import LayoutFooter from '../ui-layout/layout-footer.analog';
  import LayoutHeader from '../ui-layout/layout-header.analog';

  defineMetadata({ imports: [RouterOutlet, LayoutFooter, LayoutHeader] });

  const authStore = inject(AuthStore);
</script>

<template>
  <LayoutHeader
    [isAuthenticated]="authStore.isAuthenticated()"
    [username]="authStore.username()"
  />
  <router-outlet />
  <LayoutFooter />
</template>
```

> 组件的 `selector` 不由导入的名字决定，而是取决与文件名。如果你将导入的名字改为：
>
> ```html
> <script lang="ts">
>   import LayoutHeaderHeading from '../ui-layout/layout-header.analog';
> </script>
>
> <template>
>   <LayoutHeaderHeading />
> </template>
> ```
>
> 它将不工作。要解决这个问题，你需要确保默认导入的名字和 `.analog` 的文件名匹配。
>
> Angular 团队表示将推出针对此问题的官方解决方案，并且可能会在 Angular 未来的版本中推出。

### 导入属性

为了避免手动将组件添加到 `imports` 元数据中，你也可以使用 [导入属性](https://github.com/tc39/proposal-import-attributes)

```html
<script lang="ts">
  import YourComponent from './your-component.analog' with { analog: 'imports' };
</script>
```

使用导入属性方法将组件添加到元数据的 `imports` ，并可用于你想要添加到元数据的其他导入，如下所示：

```html
<script lang="ts">
  // This adds to the `providers` array in your metadata
  import { MyService } from './my.service' with { analog: 'providers' };
  // This adds the `ExternalEnum` field to your component's constructor so that you can use it in your template
  import { ExternalEnum } from './external.model' with { analog: 'exposes' };
  // ...
</script>
```

### 生命周期方法

目前， `.analog` SFCs 文件里只有 Angular 的两个生命周期方法可用：

- `onInit`
- `onDestroy`

你可以这样使用这些生命周期方法：

```html
<!-- app.analog -->
<script lang="ts">
  onInit(() => {
    console.log('I am mounting');
  });

  onDestroy(() => {
    console.log('I am unmounting');
  });
</script>
```

这鼓励在使用 Angular 信号时采用最佳实践，因为大部分其他的生命周期方法都可能导致性能问题或者很容易被其他 API 取代。

## 输入和输出

要添加输入和输出到 Analog 组件，你可以使用新的 Angular 信号 API。

我们来解释一下实际使用的场景：

### 输入

可以使用 [新的 `input` 信号 API](https://angular.io/guide/signal-inputs)将输入添加到 Analog 格式的组件或指令中：

```typescript
const namedInput = input();
```

下面将添加一个名为 `namedInput` 的输入，可以在模板中使用，如下所示：

```html
<template>
  <SomeComponent [namedInput]="someValue" />
</template>
```

### 输出

将输出添加到 Analog 格式中，如下所示：

```html
<script lang="ts">
  // my-item.analog
  const itemSelected = output();

  function selectItem(id: number) {
    itemSelected.emit(id);
  }
</script>
```

并且可以在模板中使用，如下所示：

```html
<template>
  <h2>My Item</h2>

  <button (click)="selectItem(1)">Select</button>
</template>
```

输出会在组件之外被消费

```html
<script lang="ts">
  function doSomething(id: number) {
    console.log('Item Selected' + id);
  }
</script>

<template>
  <MyItem (itemSelected)="doSomething($event)" />
</template>
```

### 模型

在 Analog 格式中添加模型，如下所示：

```html
<script lang="ts">
  // some-component.analog
  const myValue = model();
</script>
```

并且在模板中使用，如下所示：

```html
<template>
  <SomeComponent [myValue]="val" (myValueChange)="doSomething($event)" />
</template>
```

## 编写指令

任何不包含 `<template>` 标签或者没有在 `defineMetadata` 函数与中使用 `templateUrl` 的 `.analog` 文件都将被视为 Angular 指令。

以下是一个关注一个输入并且包含两个生命周期函数的指令的例子：

```html
<script lang="ts">
  import { inject, ElementRef, afterNextRender, effect } from '@angular/core';

  defineMetadata({
    selector: 'input[directive]',
  });

  const elRef = inject(ElementRef);

  afterNextRender(() => {
    elRef.nativeElement.focus();
  });

  onInit(() => {
    console.log('init code');
  });

  effect(() => {
    console.log('just some effect');
  });
</script>
```

## 使用 Mardown 编写 SFC

如果你像写 Markdown 作为你的模板而不是 Angular 的 HTML，你可以添加 `lang="md"` 到你 `.analog` 文件的 `<template>` 里：

```html
<template lang="md"> # Hello World </template>
```

它同样可以和 SFC 的其他标签： `<script>` 和 `<style>` 一起使用。

### 在 Markdown 中使用组件

Analog 里的 `lang="md"` 同样支持在模板里添加 Angular 组件：

```html
<script lang="ts">
  import Hello from './hello.analog' with { analog: 'imports' };
</script>

<template lang="md">
  # Greeting

  <Hello />

  > You might want to say "Hello" back!
</template>
```

## SFC 用于交互式内容文件

你还可以在 `src/content` 目录下使用 Analog SFC 格式使用 `.agx` 扩展名创建包含前言的内容文件。它将提供类似 MDX 文件的体验：

```html
---
title: Hello World
slug: 'hello'
---

<script lang="ts">
  // src/content/post.agx
  const name = 'Analog';
</script>

<template lang="md"> My First Post on {{ name }} </template>
```

就像 `.md` 文件已有，你可以通过 [injectContentFiles](https://analogjs.org/docs/features/routing/content#using-the-content-files-list) 动态搜索和过滤 `.agx` 内容文件，并且你可以在组件中使用 [injectContent](https://analogjs.org/docs/features/routing/content#using-the-analog-markdown-component) 和 `MarkdownComponent` 来渲染内容；

```html
<script lang="ts">
  // posts.[slug].page.analog
  import { injectContent } from '@analogjs/content';
  import { MarkdownComponent } from '@analogjs/content' with { analog: 'imports' }
  import { toSignal } from '@angular/core/rxjs-interop';

  import { PostAttributes } from './models';

  // inject content file based on current slug
  const post$ = injectContent<PostAttributes>();
  const post = toSignal(post$);
</script>

<template>
  @if(post()){
  <analog-markdown [content]="post().content"></analog-markdown>
  }
</template>
```

## 限制

Analog 格式目前有一些限制：

- 你不能使用装饰器 API （`@Input`, `@Component`, `@ViewChild`）
- 你必须在 `<script>` 标签中指定 `lang="ts"` 预设

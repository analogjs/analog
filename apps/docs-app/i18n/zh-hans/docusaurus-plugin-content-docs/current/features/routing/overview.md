# 路由

Analog 在 Angular 路由之上支持基于文件系统的路由。

## 定义路由

路由通过 `src/app/pages` 目录的文件和子目录来定义。只有文件名以 `.page.ts` 结尾的文件会被记录并创建路由。

:::info

路由组件**必须**被定义为 default 导出并且所有的路由组件都是**懒加载**的

:::

路由主要由以下 5 种：

- [路由](#路由)
  - [定义路由](#定义路由)
  - [索引页路由](#索引页路由)
  - [静态路由](#静态路由)
    - [路由组](#路由组)
  - [动态路由](#动态路由)
    - [使用路由组件的输入绑定](#使用路由组件的输入绑定)
  - [布局路由](#布局路由)
    - [隐式布局路由](#隐式布局路由)
  - [Catch-all 路由](#catch-all-路由)
  - [多种路由的组合](#多种路由的组合)

这些路由可以通过不同的方式组合来生成导航 URL。

:::note

除了以上 5 种主要路由以外，Analog 还支持 [重定向路由](/docs/features/routing/metadata#重定向路由) 和 [内容路由](/docs/features/routing/content)。

:::

## 索引页路由

索引页路由是通过在文件名中加括号的方式定义的。

以下文件 `src/app/pages/(home).page.ts` 定义了一个 `/` 路由。

```ts
import { Component } from '@angular/core';

@Component({
  standalone: true,
  template: ` <h2>Welcome</h2> `,
})
export default class HomePageComponent {}
```

:::tip

索引页路由也可以通过文件名 `index.page.ts` 来定义。

:::

## 静态路由

静态路由是使用文件名作为路由路径来定义的。

以下文件 `src/app/pages/about.page.ts` 中定义了一个 `/about` 路由.

```ts
import { Component } from '@angular/core';

@Component({
  standalone: true,
  template: `
    <h2>Hello Analog</h2>

    Analog is a meta-framework on top of Angular.
  `,
})
export default class AboutPageComponent {}
```

定义多层静态路由有以下两种方式：

1. 通过多层目录路由文件来实现 - `src/app/pages/about/team.page.ts` 定义了 `/about/team` 路由。
2. 通过路由文件的`.`分隔符定义 - `src/app/pages/about.team.page.ts` 同样定义了 `/about/team` 路由。

### 路由组

路由文件可以通过放置在一个名字括号的目录里实现路由的分组。

```treeview
src/
└── app/
    └── pages/
        └── (auth)/
            ├── login.page.ts
            └── signup.page.ts
```

以上例子定义了 `/login` 和 `/signup` 路由，**注意**：(auth)不会成为路由 URL 的一部分。

## 动态路由

动态路由通过文件名中的方括号`[]`表示。路由的参数会从路由的地址中抽取。

以下的例子中 `src/app/pages/products/[productId].page.ts` 定义了 `/products/:productId` 路由。

```ts
import { Component, inject } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';

@Component({
  standalone: true,
  imports: [AsyncPipe],
  template: `
    <h2>Product Details</h2>

    ID: {{ productId$ | async }}
  `,
})
export default class ProductDetailsPageComponent {
  private readonly route = inject(ActivatedRoute);

  readonly productId$ = this.route.paramMap.pipe(
    map((params) => params.get('productId')),
  );
}
```

动态路由也可以通过文件名中的`.`分隔符来定义 - `src/app/pages/products.[productId].page.ts` 同样定义了 `/products/:productId` 路由。

### 使用路由组件的输入绑定

如果你使用了 Angular 路由的`withComponentInputBinding()`功能，你就可以使用**Input**装饰器来通过**参数名**获取路由参数。

首先，在`provideFileRouter()`函数参数中添加`withComponentInputBinding()`

```ts
// src/app/app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideFileRouter } from '@analogjs/router';
import { withComponentInputBinding } from '@angular/router';

export const appConfig: ApplicationConfig = {
  providers: [
    provideFileRouter(withComponentInputBinding()),
    // other providers
  ],
};
```

然后，通过 input 的方式获取路由参数

```ts
// src/app/pages/products/[productId].page.ts
import { Component, Input } from '@angular/core';

@Component({
  standalone: true,
  template: `
    <h2>Product Details</h2>

    ID: {{ productId }}
  `,
})
export default class ProductDetailsPageComponent {
  @Input() productId: string;
}
```

## 布局路由

布局路由是通过一个父级文件加同名目录来定义的。

下面的文档结构定义了一个布局路由。

```treeview
src/
└── app/
    └── pages/
        ├── products/
        │   ├── [productId].page.ts
        │   └── (products-list).page.ts
        └── products.page.ts
```

它定义了两个共享布局的路由：

- `/products`
- `/products/:productId`

父级文件 `src/app/pages/products.page.ts` 是一个包含了 router outlet 的布局页。

```ts
import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  standalone: true,
  imports: [RouterOutlet],
  template: `
    <h2>Products</h2>

    <router-outlet></router-outlet>
  `,
})
export default class ProductsComponent {}
```

下一级的 `src/app/pages/products/(products-list).page.ts` 文件包含了 `/products` 列表页。

```ts
import { Component } from '@angular/core';

@Component({
  standalone: true,
  template: ` <h2>Products List</h2> `,
})
export default class ProductsListComponent {}
```

再下一级的 `src/app/pages/products/[productId].page.ts` 文件则包含了 `/products/:productId` 详情页。

```ts
import { Component, inject } from '@angular/core';
import { AsyncPipe, JsonPipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';

@Component({
  standalone: true,
  imports: [AsyncPipe, JsonPipe],
  template: `
    <h2>Product Details</h2>

    ID: {{ productId$ | async }}
  `,
})
export default class ProductDetailsPageComponent {
  private readonly route = inject(ActivatedRoute);

  readonly productId$ = this.route.paramMap.pipe(
    map((params) => params.get('productId')),
  );
}
```

### 隐式布局路由

布局路由同样支持隐式路由，即不添加额外路由项。

```treeview
src/
└── app/
    └── pages/
        ├── (auth)/
        │   ├── login.page.ts
        │   └── signup.page.ts
        └── (auth).page.ts
```

上面的例子定义了共享布局的 `/login` 和 `/signup` 路由。父级文件 `src/app/pages/(auth).page.ts` 是一个包含 router outlet 的布局页。

## Catch-all 路由

Catch-all 路由通过一个包含`[]`并且以`...`为开头的文件来定义

下面在 `src/app/pages/[...page-not-found].page.ts` 里定义了一个通配符`**`路由，通常用于展示 404 页面。

```ts
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { injectResponse } from '@analogjs/router/tokens';
import { RouteMeta } from '@analogjs/router';

export const routeMeta: RouteMeta = {
  title: 'Page Not Found',
  canActivate: [
    () => {
      const response = injectResponse();
      if (import.meta.env.SSR && response) {
        response.statusCode = 404;
        response.end();
      }
      return true;
    },
  ],
};

@Component({
  standalone: true,
  imports: [RouterLink],
  template: `
    <h2>Page Not Found</h2>

    <a routerLink="/">Go Back Home</a>
  `,
})
export default class PageNotFoundComponent {}
```

Catch-all 路由同样支持多层子路由。

## 多种路由的组合

以下的目录结构：

```treeview
src/
└── app/
    └── pages/
        ├── (auth)/
        │   ├── login.page.ts
        │   └── signup.page.ts
        ├── (marketing)/
        │   ├── about.md
        │   └── contact.md
        ├── products/
        │   ├── (product-list).page.ts
        │   ├── [productId].edit.page.ts
        │   └── [productId].page.ts
        ├── (auth).page.ts
        ├── (home).page.ts
        ├── [...not-found].md
        └── products.page.ts
```

将基于文件的路由生成如下路径：

| 路径               | 页面                                                             |
| ------------------ | ---------------------------------------------------------------- |
| `/`                | `(home).page.ts`                                                 |
| `/about`           | `(marketing)/about.md`                                           |
| `/contact`         | `(marketing)/contact.md`                                         |
| `/login`           | `(auth)/login.page.ts` (layout: `(auth).page.ts`)                |
| `/signup`          | `(auth)/signup.page.ts` (layout: `(auth).page.ts`)               |
| `/products`        | `products/(product-list).page.ts` (layout: `products.page.ts`)   |
| `/products/1`      | `products/[productId].page.ts` (layout: `products.page.ts`)      |
| `/products/1/edit` | `products/[productId].edit.page.ts` (layout: `products.page.ts`) |
| `/unknown-url`     | `[...not-found].md`                                              |

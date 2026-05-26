# 路由元数据

通过 `RouteMeta` 类型可以为生成的路由配置添加额外的路由元数据。通过路由元数据可以定义页面标题，所需的 guards, resolvers, providers 以及其他选项。

## 定义路由元数据

```ts
import { Component } from '@angular/core';
import { RouteMeta } from '@analogjs/router';

import { AboutService } from './about.service';

export const routeMeta: RouteMeta = {
  title: 'About Analog',
  canActivate: [() => true],
  providers: [AboutService],
};

@Component({
  standalone: true,
  template: `
    <h2>Hello Analog</h2>

    Analog is a meta-framework on top of Angular.
  `,
})
export default class AboutPageComponent {
  private readonly service = inject(AboutService);
}
```

## 重定向路由

可以定义一个路由，专门用于重定向到另一个路由。

在路由文件里添加 `redirectTo` 和 `pathMatch` 属性来创建一个重定向路由

```ts
// src/app/pages/index.page.ts
import { RouteMeta } from '@analogjs/router';

export const routeMeta: RouteMeta = {
  redirectTo: '/home',
  pathMatch: 'full',
};
```

以上的例子添加了一个从 `/` 重定向到 `/home` 的路由。

:::tip

重定向路由通常不导出任何组件。

:::

还可以定义多层重定向路由。例如以下目录结构：

```treeview
src/
└── app/
    └── pages/
        └── cities/
            ├── index.page.ts
            ├── new-york.page.ts
            └── san-francisco.page.ts
```

以及 `src/app/pages/cities/index.page.ts` 中的 `routeMeta` 定义：

```ts
import { RouteMeta } from '@analogjs/router';

export const routeMeta: RouteMeta = {
  redirectTo: '/cities/new-york',
  pathMatch: 'full',
};
```

访问 `/cities` 将会重定向到 `/cities/new-york`。

:::note

多层重定向必须使用绝对路径。

:::

## 路由 meta 标签

`RouteMeta` 类型由一个 `meta` 属性可以用来为每一个路由定义一组 meta 标签：

```ts
import { Component } from '@angular/core';
import { RouteMeta } from '@analogjs/router';

import { AboutService } from './about.service';

export const routeMeta: RouteMeta = {
  title: 'Refresh every 30 sec',
  meta: [
    {
      httpEquiv: 'refresh',
      content: '30',
    },
  ],
};

@Component({
  standalone: true,
  template: `
    <h2>Hello Analog</h2>

    See you again in 30 seconds.
  `,
})
export default class RefreshComponent {}
```

以上例子设置了一个 meta 标签 `<meta http-equiv="refresh" content="30">`，将会强制浏览器每 30 秒刷新一次。

请访问官方[文档](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/meta)了解标准的 meta 标签

## Open Graph meta 标签

以上的 `meta` 属性还可以用来定义用于 SEO 和社交 app 优化的 OpenGraph meta 标签。

```ts
export const routeMeta: RouteMeta = {
  meta: [
    {
      name: 'description',
      content: 'Description of the page',
    },
    {
      name: 'author',
      content: 'Analog Team',
    },
    {
      property: 'og:title',
      content: 'Title of the page',
    },
    {
      property: 'og:description',
      content: 'Some catchy description',
    },
    {
      property: 'og:image',
      content: 'https://somepage.com/someimage.png',
    },
  ],
};
```

这个例子将允许社交 app，例如 Facebook 或者 Twitter 以最佳方式显示标题，描述以及图片。

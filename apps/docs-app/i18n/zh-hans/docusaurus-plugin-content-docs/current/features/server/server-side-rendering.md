# 服务端渲染

Analog 支持在开发和生产环境构建时的服务端渲染。

## 转换包以实现 SSR 兼容性

有些依赖项可能需要额外的转换才能用于服务端渲染。如果你在开发过程中遇到 SSR 错误，一个选项是在 Vite 配置中吧这些包添加到 `ssr.noExternal` 数组中。

你可以使用 glob 范式来包括包或者库。下面是一些例子：

```ts
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  ssr: {
    noExternal: [
      'apollo-angular', // npm package import
      'apollo-angular/**', // npm package import along with sub-packages
      '@spartan-ng/**', // libs under the npmScope inside an Nx workspace
    ],
  },
  // ...other config
}));
```

要了解更多关于 SSR 的外部依赖，请移步[Vite 文档](https://vitejs.dev/guide/ssr.html#ssr-externals)。

## 禁用 SSR

SSR 默认是开启的。你可以通过在 `vite.config.ts` 的 `analog()` 插件里添加以下选项来禁用它并且生成仅客户端的构建：

```ts
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // ...other config
  plugins: [analog({ ssr: false })],
}));
```

## 预渲染路由

`"/"` 路由在 SSR 模式下默认会被预渲染。

当用户访问应用的根目录时返回渲染的 HTML 是一个关键步骤。预渲染的路由可以自定义，但是请记住一定要包含 `"/"` 根路由。

```js
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';
// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // ...other config
  plugins: [
    analog({
      prerender: {
        routes: ['/', '/about'],
      },
    }),
  ],
}));
```

你可以通过传入一个空数组来禁用预渲染，并在根路由上禁用预渲染。

```js
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';
// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // ...other config
  plugins: [
    analog({
      ssr: true,
      nitro: {
        routeRules: {
          '/': {
            prerender: false,
          },
        },
      },
      prerender: {
        routes: async () => {
          return [];
        },
      },
    }),
  ],
}));
```

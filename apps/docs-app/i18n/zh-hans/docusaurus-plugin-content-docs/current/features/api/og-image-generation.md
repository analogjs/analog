import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# 开放图谱 (OG) 图片生成

开放图谱图片可以用来在例如：Twitter/X，LinkedIn，Facebook 等社交媒体上分享时展示页面的预览。Analog 支持通过[API Routes](./overview)来生成开放图谱图片

## 设置

首先，安装所需的 [satori](https://github.com/vercel/satori) 依赖：

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm install satori satori-html sharp --save
```

  </TabItem>

  <TabItem label="Yarn" value="yarn">

```shell
yarn add satori satori-html sharp
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm install -w satori satori-html sharp
```

  </TabItem>
</Tabs>

## 设置一个 API 路由

然后，在 `src/server/routes` 目录下定义一个 API 路由。

```ts
// src/server/routes/v1/og-images.ts
import { defineEventHandler, getQuery } from 'h3';

import { ImageResponse } from '@analogjs/content/og';

export default defineEventHandler(async (event) => {
  const fontFile = await fetch(
    'https://og-playground.vercel.app/inter-latin-ext-700-normal.woff',
  );
  const fontData: ArrayBuffer = await fontFile.arrayBuffer();
  const query = getQuery(event); // query params

  const template = `
    <div tw="bg-gray-50 flex w-full h-full items-center justify-center">
        <div tw="flex flex-col md:flex-row w-full py-12 px-4 md:items-center justify-between p-8">
          <h2 tw="flex flex-col text-3xl sm:text-4xl font-bold tracking-tight text-gray-900 text-left">
            <span>${query['title'] ? `${query['title']}` : 'Hello World'}</span>
          </h2>
        </div>
      </div>    
  `;

  return new ImageResponse(template, {
    debug: true, // disable caching
    fonts: [
      {
        name: 'Inter Latin',
        data: fontData,
        style: 'normal',
      },
    ],
  });
});
```

- 该 API 路由从 `@analogjs/content/og` 子包中引用了 `ImageResponse` 类。
- 提供的 HTML 被渲染成了 png 图像。
- 支持 Tailwind 类，而且是可选的。

## 添加开放图谱元数据

开放图谱图片由 HTML 里的 `head` 标签里的 meta 标签注册。

```html
<html>
  <head>
    <meta
      property="og:image"
      content="https://your-url.com/api/v1/og-images?name=Developer"
    />
    <meta
      name="twitter:image"
      content="https://your-url.com/api/v1/og-images?name=Developer"
      key="twitter:image"
    />
    ...
  </head>
</html>
```

meta 标签可以通过在 `index.html` 里手动设置或者通过 [Route Metadata](/docs/features/routing/metadata#open-graph-meta-tags) 动态设置。

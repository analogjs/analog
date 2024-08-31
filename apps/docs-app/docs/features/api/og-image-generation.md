import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Open Graph (OG) Image Generation

Open Graph images can be used to display previews of pages when shared on social media sites such as Twitter/X, LinkedIn, Facebook, etc. Analog supports generating Open Graph images using [API Routes](./overview).

## Setup

First, install the necessary [satori](https://github.com/vercel/satori) dependencies:

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

## Setting Up An API Route

Next, define an API route in the `src/server/routes` directory.

```ts
// src/server/routes/v1/og-images.ts
import { defineEventHandler, getQuery } from 'h3';

import { ImageResponse } from '@analogjs/content/og';

export default defineEventHandler(async (event) => {
  const fontFile = await fetch(
    'https://og-playground.vercel.app/inter-latin-ext-700-normal.woff'
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

- The API route uses the `ImageResponse` class from the `@analogjs/content/og` sub-package.
- Provide HTML that is rendered to a png.
- Tailwind class are supported, and optional.

## Adding Open Graph Metadata

Open Graph images are registered through meta tags inside the HTML `head` tag.

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

The meta tags can be set manually in the `index.html` or dynamically using [Route Metadata](/docs/features/routing/metadata#open-graph-meta-tags)

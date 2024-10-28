import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Open-Graph-(OG)-Bildgenerierung

Open-Graph-Bilder können verwendet werden, um Vorschauen von Seiten anzuzeigen, wenn die Seiten auf Social-Media-Websites wie Twitter/X, LinkedIn, Facebook usw. geteilt werden. Analog unterstützt die Generierung von Open-Graph-Bildern mithilfe von [API-Routen](./overview).

## Einrichtung

Installiere zunächst die erforderlichen [satori](https://github.com/vercel/satori)-Abhängigkeiten:

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

## Einrichten einer API-Route

Als Nächstes definiere eine API-Route im Verzeichnis `src/server/routes`.

```ts
// src/server/routes/v1/og-images.ts
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

- Die API-Route verwendet die `ImageResponse`-Klasse aus dem `@analogjs/content/og`-Unterpaket.
- Stelle HTML bereit, das in eine PNG-Datei umgewandelt wird.
- Tailwind Klassen werden unterstützt und sind optional.

## Hinzufügen von Open-Graph-Metadaten

Open-Graph-Bilder werden über Meta-Tags innerhalb des HTML-`head`-Tags registriert.

```html
<html>
  <head>
    <meta
      property="og:image"
      content="https://your-url.com/api/v1/og-images?title=Developer"
    />
    <meta
      name="twitter:image"
      content="https://your-url.com/api/v1/og-images?title=Developer"
      key="twitter:image"
    />
    ...
  </head>
</html>
```

Die Meta-Tags können manuell in der `index.html` oder dynamisch mithilfe von [Route Metadata](/de/docs/features/routing/metadata#open-graph-meta-tags) festgelegt werden.

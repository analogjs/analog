import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Generación de Imágenes Open Graph (OG)

Las imágenes de Open Graph se pueden usar para mostrar vistas previas de páginas cuando se comparten en sitios de redes sociales como Twitter/X, LinkedIn, Facebook, etc. Analog soporta la generación de imágenes Open Graph usando [API Routes](./overview).

## Configuración

Primero, instala las dependencias necesarias de [satori](https://github.com/vercel/satori):

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

## Configuración de una Ruta API

A continuación, define una ruta API en el directorio `src/server/routes`.

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

- La ruta API utiliza la clase `ImageResponse` del sub-paquete `@analogjs/content/og`.
- Proporciona HTML que se renderiza a un png.
- Las clases de Tailwind son soportadas, y opcionales.

## Añadiendo Metadatos Open Graph

Las imágenes de Open Graph se registran a través de meta tags dentro de la etiqueta `head` de HTML.

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

Las meta tags pueden ser configuradas manualmente en el `index.html` o dinámicamente usando [Route Metadata](/docs/features/routing/metadata#open-graph-meta-tags)

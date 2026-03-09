# Rutas API

Analog admite la definición de rutas de API que se pueden utilizar para servir datos a la aplicación.

## Definición de una ruta API

Las rutas API se definen en el directorio `src/server/routes`. Las rutas API también se basan en el sistema de ficheros y se exponen bajo el prefijo `/api` predeterminado en el desarrollo.

```ts
import { defineHandler } from 'h3';

export default defineHandler(() => ({ message: 'Hello World' }));
```

## Definiendo contenido XML

Para crear un feed RSS para su sitio, establezca el `content-type` en `text/xml` y Analog sirve el tipo de contenido correcto para la ruta.

```ts
//server/routes/api/rss.xml.ts

import { defineHandler, setHeader } from 'h3';
export default defineHandler((event) => {
  const feedString = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
</rss>
  `;
  setHeader(event, 'content-type', 'text/xml');
  return feedString;
});
```

**Nota:** Para el contenido SSG, configure Analog para prerender una ruta de API para que esté disponible como contenido prerenderizado:

```ts
// vite.config.ts
...
prerender: {
  routes: async () => {
    return [
      ...
      '/api/rss.xml',
      ...
      .
    ];
  },
  sitemap: {
    host: 'https://analog-blog.netlify.app',
  },
},
```

El XML está disponible como un documento XML estático en `/dist/analog/public/api/rss.xml`

## Rutas API dinámicas

Las rutas API dinámicas se definen usando el nombre de fichero como la ruta de la ruta encerrada entre corchetes. Los parámetros se pueden acceder a través de `event.context.params`.

```ts
// /server/routes/api/v1/hello/[name].ts
import { defineHandler } from 'h3';

export default defineHandler(
  (event) => `Hello ${event.context.params?.['name']}!`,
);
```

Otra manera de acceder a los parámetros de la ruta es usando la función `getRouterParam`.

```ts
// /server/routes/api/v1/hello/[name].ts
import { defineHandler, getRouterParam } from 'h3';

export default defineHandler((event) => {
  const name = getRouterParam(event, 'name');
  return `Hello, ${name}!`;
});
```

## Métodos de solicitud HTTP específicos

Los nombres de fichero se pueden sufijar con `.get`, `.post`, `.put`, `.delete`, etc. para que coincidan con el método de solicitud HTTP específico.

### GET

```ts
// /server/routes/api/v1/users/[id].get.ts
import { defineHandler, getRouterParam } from 'h3';

export default defineHandler(async (event) => {
  const id = getRouterParam(event, 'id');
  // TODO: fetch user by id
  return `User profile of ${id}!`;
});
```

### POST

```ts
// /server/routes/api/v1/users.post.ts
import { defineHandler, readBody } from 'h3';

export default defineHandler(async (event) => {
  const body = await readBody(event);
  // TODO: Handle body and add user
  return { updated: true };
});
```

[h3 JSDocs](https://www.jsdocs.io/package/h3#package-index-functions) proporciona más información y utilidades, incluida `readBody`.

## Solicitudes con parámetros de consulta

Solicitud de ejemplo `/api/v1/query?param1=Analog&param2=Angular`

```ts
// routes/api/v1/query.ts
import { defineHandler } from 'h3';

export default defineHandler((event) => {
  const param1 = event.url.searchParams.get('param1') ?? '';
  const param2 = event.url.searchParams.get('param2') ?? '';
  return `Hello, ${param1} and ${param2}!`;
});
```

## Rutas Atrapa-todo (Catch-all)

Las rutas Atrapa-todo (Catch-all) son útiles para el manejo de rutas de fallback.

```ts
// routes/api/[...].ts
import { defineHandler } from 'h3';

export default defineHandler(() => `Default page`);
```

## Manejo de Errores

Si ningun error es lanzado, un código de estado 200 OK será retornado. Cualquier error no capturado retornará un error HTTP 500 Internal Server Error.
Para retornar otros códigos de error, lance una excepción con `createError`

```ts
// routes/api/v1/[id].ts
import { defineHandler, getRouterParam, createError } from 'h3';

export default defineHandler((event) => {
  const param = getRouterParam(event, 'id');
  const id = parseInt(param ? param : '');
  if (!Number.isInteger(id)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'ID should be an integer',
    });
  }
  return `ID is ${id}`;
});
```

## Accediendo a las Cookies

Analog permite establecer y leer cookies en las llamadas del lado del servidor.

### Establecer cookies

```ts
//(home).server.ts
import { PageServerLoad } from '@analogjs/router';

import { Product } from '../products';

export const load = async ({ fetch, event }: PageServerLoad) => {
  event.res.headers.append('set-cookie', 'products=loaded; Path=/');
  const products = await fetch<Product[]>('/api/v1/products');

  return {
    products: products,
  };
};
```

### Leer cookies

```ts
//index.server.ts
import { PageServerLoad } from '@analogjs/router';

function getCookieValue(cookieHeader: string | null, name: string) {
  if (!cookieHeader) {
    return undefined;
  }

  return cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

export const load = async ({ event }: PageServerLoad) => {
  const productsCookie = getCookieValue(
    event.req.headers.get('cookie'),
    'products',
  );

  console.log('products cookie', productsCookie);

  return {
    shipping: true,
  };
};
```

## Más información

Las rutas API están alimentadas por [Nitro](https://nitro.unjs.io). Consulte la documentación de Nitro para obtener más ejemplos sobre cómo crear rutas API.

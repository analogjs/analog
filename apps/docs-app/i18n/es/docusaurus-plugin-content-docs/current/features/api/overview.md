# Rutas API

Analog admite la definición de rutas de API que se pueden utilizar para servir datos a la aplicación.

## Definición de una ruta API

Las rutas API se definen en el directorio `src/server/routes`. Las rutas API también se basan en el sistema de ficheros y se exponen bajo el prefijo `/api` predeterminado en el desarrollo.

```ts
import { defineEventHandler } from 'h3';

export default defineEventHandler(() => ({ message: 'Hello World' }));
```

## Definiendo contenido XML

Para crear un feed RSS para su sitio, establezca el `content-type` en `text/xml` y Analog sirve el tipo de contenido correcto para la ruta.

```ts
//server/routes/rss.xml.ts

import { defineEventHandler } from 'h3';
export default defineEventHandler((event) => {
  const feedString = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
</rss>
  `;
  event.node.res.setHeader('content-type', 'text/xml');
  event.node.res.end(feedString);
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

## Prefijo de API personalizado

El prefijo bajo el cual se exponen las rutas de API se puede configurar con el parámetro `apiPrefix` que se pasa al plugin vite de `analog`.

```ts
export default defineConfig(({ mode }) => {
  return {
    plugins: [
      analog({
        apiPrefix: 'services',
      }),
    ],
  };
});
```

Con esta configuración, Analog expone las rutas de API bajo el prefijo `/services`.

Una ruta definida en `src/server/routes/v1/hello.ts` ahora se puede acceder en `/services/v1/hello`.

## Rutas API dinámicas

Las rutas API dinámicas se definen usando el nombre de fichero como la ruta de la ruta encerrada entre corchetes. Los parámetros se pueden acceder a través de `event.context.params`.

```ts
// /server/routes/v1/hello/[name].ts
import { defineEventHandler } from 'h3';

export default defineEventHandler(
  (event: H3Event) => `Hello ${event.context.params?.['name']}!`
);
```

Otra manera de acceder a los parámetros de la ruta es usando la función `getRouterParam`.

```ts
// /server/routes/v1/hello/[name].ts
import { defineEventHandler, getRouterParam } from 'h3';

export default defineEventHandler((event) => {
  const name = getRouterParam(event, 'name');
  return `Hello, ${name}!`;
});
```

## Métodos de solicitud HTTP específicos

Los nombres de fichero se pueden sufijar con `.get`, `.post`, `.put`, `.delete`, etc. para que coincidan con el método de solicitud HTTP específico.

### GET

```ts
// /server/routes/v1/users/[id].get.ts
import { defineEventHandler, getRouterParam } from 'h3';

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');
  // TODO: fetch user by id
  return `User profile of ${id}!`;
});
```

### POST

```ts
// /server/routes/v1/users.post.ts
import { defineEventHandler, readBody } from 'h3';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  // TODO: Handle body and add user
  return { updated: true };
});
```

[h3 JSDocs](https://www.jsdocs.io/package/h3#package-index-functions) proporciona más información y utilidades, incluida `readBody`.

## Solicitudes con parámetros de consulta

Solicitud de ejemplo `/api/v1/query?param1=Analog&param2=Angular`

```ts
// routes/v1/query.ts
import { defineEventHandler, getQuery } from 'h3';

export default defineEventHandler((event) => {
  const { param1, param2 } = getQuery(event);
  return `Hello, ${param1} and ${param2}!`;
});
```

## Rutas Atrapa-todo (Catch-all)

Las rutas Atrapa-todo (Catch-all) son útiles para el manejo de rutas de fallback.

```ts
// routes/[...].ts
export default defineEventHandler((event) => `Default page`);
```

## Manejo de Errores

Si ningun error es lanzado, un código de estado 200 OK será retornado. Cualquier error no capturado retornará un error HTTP 500 Internal Server Error.
Para retornar otros códigos de error, lance una excepción con `createError`

```ts
// routes/v1/[id].ts
import { defineEventHandler, getRouterParam, createError } from 'h3';

export default defineEventHandler((event) => {
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

## Más información

Las rutas API están alimentadas por [Nitro](https://nitro.unjs.io). Consulte la documentación de Nitro para obtener más ejemplos sobre cómo crear rutas API.

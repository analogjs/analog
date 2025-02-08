# API-Routen

Analog unterstützt die Definition von API-Routen, die für die Bereitstellung von Daten an die Anwendung verwendet werden können.

## Definieren einer API-Route

API-Routen werden im Ordner `src/server/routes` definiert. API-Routen sind ebenfalls dateisystembasiert,
und werden in der Entwicklung unter dem Standard-Präfix `/api` bereitgestellt.

```ts
import { defineEventHandler } from 'h3';

export default defineEventHandler(() => ({ message: 'Hello World' }));
```

## Definieren von XML-Inhalten

Um einen RSS-Feed für Ihre Website zu erstellen, setzen Sie den `content-type` auf `text/xml`, und Analog liefert den richtigen Inhaltstyp für die Route.

```ts
//server/routes/rss.xml.ts

import { defineEventHandler, setHeader } from 'h3';
export default defineEventHandler((event) => {
  const feedString = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
</rss>
  `;
  setHeader(event, 'content-type', 'text/xml');
  return feedString;
});
```

**Hinweis:** Legen Sie für SSG-Inhalte fest, dass Analog eine API-Route vorberechnen soll, damit sie als statischer Inhalt verfügbar ist:

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

Die XML-Datei ist als statisches XML-Dokument unter `/dist/analog/public/api/rss.xml` verfügbar.

## Benutzerdefinierter API-Präfix

Der Präfix, unter dem API-Routen offengelegt werden, kann mit dem Parameter `apiPrefix` konfiguriert werden, der an das Vite-Plugin `analog` übergeben wird.

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

Mit dieser Konfiguration stellt Analog die API-Routen unter dem Präfix `/services` zur Verfügung.

Eine in `src/server/routes/v1/hello.ts` definierte Route kann nun unter `/services/v1/hello` aufgerufen werden.

## Dynamische API-Routen

Dynamische API-Routen werden durch die Verwendung des Dateinamens als Routenpfad in eckigen Klammern definiert. Auf die Parameter kann über `event.context.params` zugegriffen werden.

```ts
// /server/routes/v1/hello/[name].ts
import { defineEventHandler } from 'h3';

export default defineEventHandler(
  (event) => `Hello ${event.context.params?.['name']}!`,
);
```

Eine weitere Möglichkeit, auf Routenparameter zuzugreifen, besteht in der Verwendung der Funktion `getRouterParam`.

```ts
// /server/routes/v1/hello/[name].ts
import { defineEventHandler, getRouterParam } from 'h3';

export default defineEventHandler((event) => {
  const name = getRouterParam(event, 'name');
  return `Hello, ${name}!`;
});
```

## Spezifische HTTP-Anforderungsmethode

Dateinamen können mit dem Suffix `.get`, `.post`, `.put`, `.delete` usw. versehen werden, um der jeweiligen HTTP-Anforderungsmethode zu entsprechen.

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

Die [h3 JSDocs](https://www.jsdocs.io/package/h3#package-index-functions) bieten weitere Informationen und Hilfsprogramme, einschließlich `readBody`.

## Abfragen mit Abfrageparametern

Beispielabfrage `/api/v1/query?param1=Analog&param2=Angular`

```ts
// routes/v1/query.ts
import { defineEventHandler, getQuery } from 'h3';

export default defineEventHandler((event) => {
  const { param1, param2 } = getQuery(event);
  return `Hello, ${param1} and ${param2}!`;
});
```

## Sammelrouten

Sammelrouten sind hilfreich für die Handhabung von Ausweichrouten.

```ts
// routes/[...].ts
export default defineEventHandler((event) => `Default page`);
```

## Handhabung von Fehlern

Wenn keine Fehler auftreten, wird ein Statuscode von 200 OK zurückgegeben. Alle nicht abgefangenen Fehler geben den HTTP-Fehler 500 Internal Server Error zurück.
Um andere Fehlercodes zurückzugeben, lösen Sie mit `createError` eine Ausnahme aus

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

## Zugriff auf Cookies

Analog ermöglicht das Setzen und Lesen von Cookies in serverseitigen Aufrufen.

### Cookies setzen

```ts
//(home).server.ts
import { setCookie } from 'h3';
import { PageServerLoad } from '@analogjs/router';

import { Product } from '../products';

export const load = async ({ fetch, event }: PageServerLoad) => {
  setCookie(event, 'products', 'loaded'); // setting the cookie
  const products = await fetch<Product[]>('/api/v1/products');

  return {
    products: products,
  };
};
```

### Cookies lesen

```ts
//index.server.ts
import { parseCookies } from 'h3';
import { PageServerLoad } from '@analogjs/router';

export const load = async ({ event }: PageServerLoad) => {
  const cookies = parseCookies(event);

  console.log('products cookie', cookies['products']);

  return {
    shipping: true,
  };
};
```

## Mehr Informationen

API-Routen werden von [Nitro](https://nitro.unjs.io/guide/routing) und [h3](https://h3.unjs.io/) bereitgestellt. Weitere Beispiele für die Erstellung von API-Routen findest du in den Dokumentationen zu Nitro und h3.

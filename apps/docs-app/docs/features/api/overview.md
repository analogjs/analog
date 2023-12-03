# API Routes

Analog supports defining API routes that can be used to serve data to the application.

## Defining an API Route

API routes are defined in the `src/server/routes` folder. API routes are also filesystem based,
and are exposed under the default `/api` prefix in development.

```ts
import { defineEventHandler } from 'h3';

export default defineEventHandler(() => ({ message: 'Hello World' }));
```

## Defining XML Content

To create an RSS feed for your site, set the `content-type` to be `text/xml` and Analog serves up the correct content type for the route.

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

**Note:** For SSG content, set Analog to prerender an API route to make it available as prerendered content:

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

The XML is available as a static XML document at `/dist/analog/public/api/rss.xml`

## Custom API prefix

The prefix under which API routes are exposed can be configured with the
`apiPrefix` parameter passed to the `analog` vite plugin.

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

With this configuration, Analog exposes the API routes under the `/services` prefix.

A route defined in `src/server/routes/v1/hello.ts` can now be accessed at `/services/v1/hello`.

## Dynamic API Routes

Dynamic API routes are defined by using the filename as the route path enclosed in square brackets. Parameters can be accessed via `event.context.params`.

```ts
// /server/routes/v1/hello/[name].ts
import { defineEventHandler } from 'h3';

export default defineEventHandler(
  (event: H3Event) => `Hello ${event.context.params?.['name']}!`
);
```

Another way to access route parameters is by using the `getRouterParam` function.

```ts
// /server/routes/v1/hello/[name].ts
import { defineEventHandler, getRouterParam } from 'h3';

export default defineEventHandler((event) => {
  const name = getRouterParam(event, 'name');
  return `Hello, ${name}!`;
});
```

## Specific HTTP request method

File names can be suffixed with `.get`, `.post`, `.put`, `.delete`, etc. to match the specific HTTP request method.

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

The [h3 JSDocs](https://www.jsdocs.io/package/h3#package-index-functions) provide more info and utilities, including readBody.

## Requests with Query Parameters

Sample query `/api/v1/query?param1=Analog&param2=Angular`

```ts
// routes/v1/query.ts
import { defineEventHandler, getQuery } from 'h3';

export default defineEventHandler((event) => {
  const { param1, param2 } = getQuery(event);
  return `Hello, ${param1} and ${param2}!`;
});
```

## Catch-all Routes

Catch-all routes are helpful for fallback route handling.

```ts
// routes/[...].ts
export default defineEventHandler((event) => `Default page`);
```

## Error Handling

If no errors are thrown, a status code of 200 OK will be returned. Any uncaught errors will return a 500 Internal Server Error HTTP Error.
To return other error codes, throw an exception with createError

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

## Accessing Cookies

Analog allows setting cookies reading them in your server side calls.

### Setting cookies

```ts
//(home).server.ts
import { setCookie } from 'h3';
import { PageServerLoad } from '@analogjs/router';

import { Product } from '../products';

export const load = async ({ fetch, event }: PageServerLoad) => {
  setCookie(event, 'test', 'test'); // setting the cookie
  const products = await fetch<Product[]>('/api/v1/products');

  return {
    products: products,
  };
};
```

### Reading cookies

```ts
//index.server.ts
import { parseCookies } from 'h3';
import { PageServerLoad } from '@analogjs/router';

export const load = async ({ event }: PageServerLoad) => {
  console.log('shipping');
  const cookies = parseCookies(event);

  console.log('test cookie', cookies['test']);

  return {
    shipping: true,
  };
};
```

## More Info

API routes are powered by [Nitro](https://nitro.unjs.io). See the Nitro docs for more examples around building API routes.

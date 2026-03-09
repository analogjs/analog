# API Routes

Analog supports defining API routes that can be used to serve data to the application.

## Defining an API Route

API routes are defined in the `src/server/routes/api` folder. API routes are also filesystem based, and are exposed under the default `/api` prefix.

```ts
import { defineHandler } from 'h3';

export default defineHandler(() => ({ message: 'Hello World' }));
```

## Defining XML Content

To create an RSS feed for your site, set the `content-type` to be `text/xml` and Analog serves up the correct content type for the route.

```ts
//server/routes/api/rss.xml.ts

import { defineHandler } from 'h3';

export default defineHandler((event) => {
  const feedString = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
</rss>
  `;
  event.res.headers.set('content-type', 'text/xml');
  return feedString;
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

## Dynamic API Routes

Dynamic API routes are defined by using the filename as the route path enclosed in square brackets. Parameters can be accessed via `event.context.params`.

```ts
// /server/routes/api/v1/hello/[name].ts
import { defineHandler } from 'h3';

export default defineHandler(
  (event) => `Hello ${event.context.params?.['name']}!`,
);
```

Another way to access route parameters is by reading them from `event.context.params` inside the handler.

```ts
// /server/routes/api/v1/hello/[name].ts
import { defineHandler } from 'h3';

export default defineHandler((event) => {
  const name = event.context.params?.['name'] ?? 'friend';
  return `Hello, ${name}!`;
});
```

## Specific HTTP request method

File names can be suffixed with `.get`, `.post`, `.put`, `.delete`, etc. to match the specific HTTP request method.

### GET

```ts
// /server/routes/api/v1/users/[id].get.ts
import { defineHandler } from 'h3';

export default defineHandler(async (event) => {
  const id = event.context.params?.['id'];
  // TODO: fetch user by id
  return `User profile of ${id}!`;
});
```

### POST

```ts
// /server/routes/api/v1/users.post.ts
import { defineHandler } from 'h3';

export default defineHandler(async (event) => {
  const body = await event.req.json();
  // TODO: Handle body and add user
  return { updated: true };
});
```

The [h3 JSDocs](https://www.jsdocs.io/package/h3#package-index-functions) provide more info and utilities for headers, cookies, redirects, and more.

## Requests with Query Parameters

Sample query `/api/v1/query?param1=Analog&param2=Angular`

```ts
// routes/api/v1/query.ts
import { defineHandler } from 'h3';

export default defineHandler((event) => {
  const param1 = event.url.searchParams.get('param1');
  const param2 = event.url.searchParams.get('param2');

  return `Hello, ${param1} and ${param2}!`;
});
```

## Catch-all Routes

Catch-all routes are helpful for fallback route handling.

```ts
// routes/api/[...].ts
import { defineHandler } from 'h3';

export default defineHandler(() => `Default page`);
```

## Error Handling

If no errors are thrown, a status code of 200 OK will be returned. Any uncaught errors will return a 500 Internal Server Error HTTP Error.
To return other error codes, throw an exception with `createError`.

```ts
// routes/api/v1/[id].ts
import { createError, defineHandler } from 'h3';

export default defineHandler((event) => {
  const param = event.context.params?.['id'];
  const id = Number.parseInt(param ?? '', 10);

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

Analog allows setting and reading cookies in your server-side calls.

### Setting cookies

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

### Reading cookies

```ts
//index.server.ts
import { PageServerLoad } from '@analogjs/router';

export const load = async ({ event }: PageServerLoad) => {
  const cookies = Object.fromEntries(
    (event.req.headers.get('cookie') ?? '')
      .split(';')
      .map((cookie) => cookie.trim())
      .filter(Boolean)
      .map((cookie) => {
        const [name, ...value] = cookie.split('=');
        return [name, value.join('=')];
      }),
  );

  console.log('products cookie', cookies['products']);

  return {
    shipping: true,
  };
};
```

## More Info

API routes are powered by [Nitro](https://nitro.unjs.io/guide/routing) and [h3](https://h3.unjs.io/). See the Nitro and h3 docs for more examples around building API routes.

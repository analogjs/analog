# API Routes

Analog supports defining API routes that can be used to serve data to the application.

## Defining an API Route

API routes are defined in the `src/server/routes/api` folder. API routes are also filesystem based, and are exposed under the default `/api` prefix.

```ts
export default defineEventHandler(() => ({ message: 'Hello World' }));
```

## Validating an API Route with a Schema

`defineApiRoute` adds Standard Schema validation to an API handler. For example,
with Zod 3.24+:

```ts
// src/server/routes/api/users.post.ts
import { defineApiRoute } from '@analogjs/router/server/actions';
import { z } from 'zod';

export default defineApiRoute({
  body: z.object({ name: z.string().min(1) }),
  handler: ({ body }) => ({ name: body.name }),
});
```

- `params`, `query`, and `body` validate their respective request values and infer
  the corresponding handler argument types. Body validation runs for methods
  other than GET and HEAD.
- `input` validates query parameters for GET/HEAD, or the body for other methods,
  and provides its result as `data`. If separate schemas are also configured,
  they are validated too. Without `input`, `data` uses the validated query for
  GET/HEAD, or the validated body (falling back to query) for other methods.
- Repeated query and form fields remain arrays. JSON, URL-encoded forms, and
  multipart forms are supported. Empty or unparseable bodies fall back to `{}`.
- Invalid input returns HTTP 422 with a Standard Schema issues array and the
  `X-Analog-Errors` header, without calling the handler.
- Plain return values become JSON responses. A returned `Response`, including
  one from `json`, `redirect`, or `fail`, passes through unchanged.
- An optional `output` schema checks plain return values in development and tests.
  Failures produce a warning; they do not change the response. Output validation
  does not run in production.

Schemas may validate asynchronously. The handler also receives the original h3
`event` for cookies, headers, and other request operations.

## Defining XML Content

To create an RSS feed for your site, set the `content-type` to be `text/xml` and Analog serves up the correct content type for the route.

```ts
//server/routes/api/rss.xml.ts
export default defineEventHandler((event) => {
  const feedString = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
</rss>
  `;
  setHeader(event, 'content-type', 'text/xml');
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
export default defineEventHandler(
  (event) => `Hello ${event.context.params?.['name']}!`,
);
```

Another way to access route parameters is by using the `getRouterParam` function.

```ts
// /server/routes/api/v1/hello/[name].ts
export default defineEventHandler((event) => {
  const name = getRouterParam(event, 'name');
  return `Hello, ${name}!`;
});
```

## Specific HTTP request method

File names can be suffixed with `.get`, `.post`, `.put`, `.delete`, etc. to match the specific HTTP request method.

### GET

```ts
// /server/routes/api/v1/users/[id].get.ts
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');
  // TODO: fetch user by id
  return `User profile of ${id}!`;
});
```

### POST

```ts
// /server/routes/api/v1/users.post.ts
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
// routes/api/v1/query.ts
export default defineEventHandler((event) => {
  const { param1, param2 } = getQuery(event);
  return `Hello, ${param1} and ${param2}!`;
});
```

## Catch-all Routes

Catch-all routes are helpful for fallback route handling.

```ts
// routes/api/[...].ts
export default defineEventHandler((event) => `Default page`);
```

## Error Handling

If no errors are thrown, a status code of 200 OK will be returned. Any uncaught errors will return a 500 Internal Server Error HTTP Error.
To return other error codes, throw an exception with createError

```ts
// routes/api/v1/[id].ts
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

Analog allows setting and reading cookies in your server-side calls.

### Setting cookies

```ts
//(home).server.ts
  return {
    products: products,
  };
};
```

### Reading cookies

```ts
//index.server.ts
  console.log('products cookie', cookies['products']);

  return {
    shipping: true,
  };
};
```

## More Info

API routes are powered by [Nitro](https://nitro.unjs.io/guide/routing) and [h3](https://h3.unjs.io/). See the Nitro and h3 docs for more examples around building API routes.

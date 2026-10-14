# Middleware

Analog supports server-side middleware that can be used to modify requests, check for authentication, send redirects, and more.

## Setting up Middleware

Middleware is automatically registered when placed in the `src/server/middleware` folder.

```treeview
src/
└── server/
    └── middleware/
        └── auth.ts
```

Also, if not present, add the middleware files to `include` array in the `tsconfig.app.json`.

```json
{
  // other config ...
  "include": [
    "src/**/*.d.ts",
    "src/app/pages/**/*.page.ts",
    "src/server/middleware/**/*.ts" <----
  ],
}
```

Middleware is defined using the `defineEventHandler` function.

```ts
import { defineEventHandler, sendRedirect, setResponseHeader } from 'h3';

export default defineEventHandler((event) => {
  if (event.path === '/checkout') {
    setResponseHeader(event, 'x-analog-checkout', 'true');
    return sendRedirect(event, '/cart', 302);
  }

  return undefined;
});
```

- Middleware can mutate the request/response context or return a response to stop request handling early.
- Middleware is run in order of the defined filenames. Prefix filenames with numbers to enforce a particular order.

## Filtering in Middleware

Middleware can only be applied to specific routes using filtering.

```ts
import { defineEventHandler, getCookie, sendRedirect } from 'h3';

export default defineEventHandler(async (event) => {
  // Only execute for /admin routes
  if (event.path.startsWith('/admin')) {
    const isLoggedIn = getCookie(event, 'authToken');

    // check auth and redirect
    if (!isLoggedIn) {
      return sendRedirect(event, '/login', 302);
    }
  }
});
```

## Accessing Environment Variables

Use the `process.env` global to access environment variables inside the middleware functions. Both server-only and publicly accessible environment variables defined in `.env` files can be read from the middleware.

```ts
import { defineEventHandler } from 'h3';

export default defineEventHandler((event) => {
  console.log('Path:', event.path);
  console.log(
    'Server Only Environment Variable:',
    process.env['SERVER_ONLY_VARIABLE'],
  );
  console.log(
    'Public Environment Variable:',
    process.env['VITE_EXAMPLE_VARIABLE'],
  );
});
```

Learn more about [environment variables](https://vite.dev/guide/env-and-mode.html#env-variables) in the Vite documentation.

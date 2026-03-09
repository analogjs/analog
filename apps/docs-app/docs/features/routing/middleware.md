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

Middleware is defined using the `defineHandler` function.

```ts
import { defineHandler, redirect } from 'h3';

export default defineHandler((event) => {
  if (event.path === '/checkout') {
    event.res.headers.set('x-analog-checkout', 'true');
    return redirect('/cart', 302);
  }

  return undefined;
});
```

- Middleware can mutate the request/response context or return a response to stop request handling early.
- Middleware is run in order of the defined filenames. Prefix filenames with numbers to enforce a particular order.

## Filtering in Middleware

Middleware can only be applied to specific routes using filtering.

```ts
import { defineHandler, redirect } from 'h3';

export default defineHandler(async (event) => {
  // Only execute for /admin routes
  if (event.path.startsWith('/admin')) {
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
    const isLoggedIn = cookies['authToken'];

    // check auth and redirect
    if (!isLoggedIn) {
      return redirect('/login', 302);
    }
  }
});
```

## Accessing Environment Variables

Use the `process.env` global to access environment variables inside the middleware functions. Both server-only and publicly accessible environment variables defined in `.env` files can be read from the middleware.

```ts
import { defineHandler } from 'h3';

export default defineHandler((event) => {
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

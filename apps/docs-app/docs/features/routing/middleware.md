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

Middleware is defined using the `defineEventHandler` function.

```ts
import { defineEventHandler, sendRedirect, setHeaders } from 'h3';

export default defineEventHandler((event) => {
  if (event.node.req.originalUrl === '/checkout') {
    console.log('event url', event.node.req.originalUrl);

    setHeaders(event, {
      'x-analog-checkout': 'true',
    });
  }
});
```

- Middleware should only modify requests and should not return anything!
- Middleware is run in order of the defined filenames. Prefix filenames with numbers to enforce a particular order.

## Filtering in Middleware

Middleware can only be applied to specific routes using filtering.

```ts
export default defineEventHandler(async (event) => {
  // Only execute for /admin routes
  if (getRequestURL(event).pathname.startsWith('/admin')) {
    const cookies = parseCookies(event);
    const isLoggedIn = cookies['authToken'];

    // check auth and redirect
    if (!isLoggedIn) {
      sendRedirect(event, '/login', 401);
    }
  }
});
```

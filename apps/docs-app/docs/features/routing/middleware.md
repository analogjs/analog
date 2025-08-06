---
title: Middleware in Analog - Server-Side Request Processing
description: Learn how to use middleware in Analog for authentication, request modification, redirects, and server-side processing. Understand middleware setup, filtering, and environment variable access.
keywords:
  [
    'middleware',
    'server-side',
    'authentication',
    'request processing',
    'redirects',
    'h3',
    'defineEventHandler',
  ]
image: https://analogjs.org/img/analog-banner.png
url: https://analogjs.org/docs/features/routing/middleware
type: documentation
author: Analog Team
publishedTime: '2022-01-01T00:00:00.000Z'
modifiedTime: '2024-01-01T00:00:00.000Z'
section: Routing
tags: ['middleware', 'server', 'authentication']
---

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

## Accessing Environment Variables

Use the `process.env` global to access environment variables inside the middleware functions. Both server-only and publicly accessible environment variables defined in `.env` files can be read from the middleware.

```ts
import { defineEventHandler, getRequestURL } from 'h3';

export default defineEventHandler((event) => {
  console.log('Path:', getRequestURL(event).pathname);
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

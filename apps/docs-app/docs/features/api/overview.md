# API Routes

Analog supports defining API routes that can be used to serve data to the application.

## Defining an API Route

API routes are defined in the `src/server/routes` folder. API routes are also filesystem based,
and are exposed under the default `/api` prefix in development.

```ts
import { defineEventHandler } from 'h3';

export default defineEventHandler(() => ({ message: 'Hello World' }));
```

API routes are powered by [Nitro](https://nitro.unjs.io). See the Nitro docs for more examples around building API routes.

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

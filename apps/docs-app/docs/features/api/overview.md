# API Routes

Analog supports defining API routes that can be used to serve data to the application.

## Defining an API Route

API routes are defined in the `src/server/routes` folder. API routes are also filesystem based, and are exposed under the `/api` prefix in development.

To define a `/api/v1/hello` route, create a server route in `src/server/routes/v1/hello.ts` and export an event handler.

```ts
import { defineEventHandler } from 'h3';

export default defineEventHandler(() => ({ message: 'Hello World' }));
```

API routes are powered by [Nitro](https://nitro.unjs.io). See the Nitro docs for more examples around definining API routes.

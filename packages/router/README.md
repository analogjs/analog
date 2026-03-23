# Analog Router

Filesystem-based routing for Angular with server-aware page loads, form actions,
and API route helpers.

## Data Fetching

Use route `load` functions when data should block navigation or be resolved as
part of the page request.

Use `defineServerRoute` and `defineAction` when you need typed HTTP endpoints or
server-side form handling.

## TanStack Query

Analog also exposes a first-class TanStack Query integration through
`@analogjs/router/query`.

```ts
import { QueryClient, provideAnalogQuery } from '@analogjs/router/query';

export const appConfig = {
  providers: [provideAnalogQuery(new QueryClient())],
};
```

For SSR, add `provideServerAnalogQuery()` to the server application config so
prefetched query state is transferred to the client during hydration.

```ts
import { provideServerAnalogQuery } from '@analogjs/router/query';

export const serverConfig = {
  providers: [provideServerAnalogQuery()],
};
```

This keeps Analog's router primitives focused on routing and server transport,
while TanStack Query handles client-side caching, invalidation, retries, and
background refetching.

Learn more at [analogjs.org](https://analogjs.org).

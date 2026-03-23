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
`@analogjs/router/tanstack-query`.

```ts
import { ENVIRONMENT_INITIALIZER, TransferState, inject } from '@angular/core';
import { ANALOG_QUERY_STATE_KEY } from '@analogjs/router/tanstack-query';
import {
  QueryClient,
  provideTanStackQuery,
  hydrate,
} from '@tanstack/angular-query-experimental';
import type { DehydratedState } from '@tanstack/angular-query-experimental';

export const appConfig = {
  providers: [
    provideTanStackQuery(new QueryClient()),
    {
      provide: ENVIRONMENT_INITIALIZER,
      multi: true,
      useValue() {
        if (import.meta.env.SSR) return;
        const transferState = inject(TransferState);
        const client = inject(QueryClient);
        const state = transferState.get<DehydratedState | null>(
          ANALOG_QUERY_STATE_KEY,
          null,
        );
        if (state) {
          hydrate(client, state);
          transferState.remove(ANALOG_QUERY_STATE_KEY);
        }
      },
    },
  ],
};
```

For SSR, add `provideServerAnalogQuery()` to the server application config so
prefetched query state is transferred to the client during hydration.

```ts
import { provideServerAnalogQuery } from '@analogjs/router/tanstack-query/server';

export const serverConfig = {
  providers: [provideServerAnalogQuery()],
};
```

This keeps Analog's router primitives focused on routing and server transport,
while TanStack Query handles client-side caching, invalidation, retries, and
background refetching.

Learn more at [analogjs.org](https://analogjs.org).

# TanStack Query Integration with Analog

Analog provides a first-class [TanStack Query](https://tanstack.com/query/latest/docs/framework/angular/overview) integration for managing server state with SSR hydration support.

Use route `load` functions when data should be resolved before the page component is created and the result is tied to navigation. Use TanStack Query when you need client-managed server state with query-key caching, invalidation, retries, or background refetching.

## Step 1: Install TanStack Query

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm install @tanstack/angular-query-experimental
```

  </TabItem>

  <TabItem label="yarn" value="yarn">

```shell
yarn add @tanstack/angular-query-experimental
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm add @tanstack/angular-query-experimental
```

  </TabItem>
</Tabs>

## Step 2: Configure the Client Provider

Add TanStack Query and the Analog hydration provider to your application config.

```ts
import {
  provideHttpClient,
  withFetch,
  withInterceptors,
} from '@angular/common/http';
import { InjectionToken } from '@angular/core';
import type { ApplicationConfig } from '@angular/core';
import { requestContextInterceptor } from '@analogjs/router';
import { provideAnalogQuery } from '@analogjs/router/tanstack-query';
import {
  QueryClient,
  provideTanStackQuery,
} from '@tanstack/angular-query-experimental';

// Per-injector `QueryClient` factory. `bootstrapApplication` creates a
// fresh root injector per SSR request, so each request gets its own
// `QueryClient` and request state can't leak across responses. On the
// browser this still resolves to a single instance for the app.
const QUERY_CLIENT = new InjectionToken<QueryClient>('QueryClient', {
  factory: () => new QueryClient(),
});

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(
      withFetch(),
      withInterceptors([requestContextInterceptor]),
    ),
    provideTanStackQuery(QUERY_CLIENT),
    provideAnalogQuery(),
  ],
};
```

`provideAnalogQuery()` rehydrates the TanStack Query cache from `TransferState` on the client, preventing duplicate fetches after SSR navigation.

The native SSR host supplies a request-scoped fetch. Local subrequests inherit
the original cookies, authorization and custom headers; explicit request headers
take precedence. Hop-by-hop and inherited body-framing headers are excluded.
External URLs use standard fetch with only explicitly supplied credentials.
Request bodies, runtime context for local calls, and cancellation remain attached
to their request. Do not store the injected fetch in a module-level variable.

The SSR cookie interceptor preserves existing headers and explicit cookies. It
adds incoming cookies only for same-origin Analog page endpoints, including when
an absolute URL is used; a matching path on another origin receives no automatic
cookie forwarding.

:::warning Pass a factory, not a `new QueryClient()` instance.
`provideTanStackQuery(new QueryClient())` evaluates the constructor once at module-load time, so every SSR request on the same Node process shares the same cache and leaks query state between responses. Wrapping the client in an `InjectionToken` with `factory: () => new QueryClient()` gives each `bootstrapApplication` call its own client.
:::

## Step 3: Configure the Server Provider

Add `provideServerAnalogQuery()` to the server application config so prefetched query state is transferred during hydration.

```ts
import type { ApplicationConfig } from '@angular/core';
import { mergeApplicationConfig } from '@angular/core';
import { provideServerRendering } from '@angular/platform-server';
import { provideServerAnalogQuery } from '@analogjs/router/tanstack-query/server';

import { appConfig } from './app.config';

const serverConfig: ApplicationConfig = {
  providers: [provideServerRendering(), provideServerAnalogQuery()],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
```

## Step 4: Query Server Routes

Use `injectQuery` and `injectMutation` from TanStack Query against Analog server routes in your components.

```ts
import { HttpClient } from '@angular/common/http';
import { Component, inject } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { injectQuery } from '@tanstack/angular-query-experimental';

@Component({
  template: `
    @if (query.isPending()) {
      Loading...
    } @else if (query.data(); as data) {
      <p>{{ data.message }}</p>
    }
  `,
})
export default class QueryPageComponent {
  private readonly http = inject(HttpClient);

  readonly query = injectQuery(() => ({
    queryKey: ['echo'],
    queryFn: () =>
      lastValueFrom(this.http.get<{ message: string }>('/api/v1/echo')),
  }));
}
```

## Typed Server Routes

Use `serverQueryOptions` and `serverMutationOptions` from `@analogjs/router/tanstack-query` to get end-to-end type safety between server routes and client queries.

```ts
import { HttpClient } from '@angular/common/http';
import { Component, inject } from '@angular/core';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { serverQueryOptions } from '@analogjs/router/tanstack-query';
import type { route } from '../../server/routes/api/v1/todos.get';

@Component({
  template: `
    @if (todosQuery.data(); as todos) {
      @for (todo of todos; track todo.id) {
        <p>{{ todo.title }}</p>
      }
    }
  `,
})
export default class TodosComponent {
  private readonly http = inject(HttpClient);

  readonly todosQuery = injectQuery(() =>
    serverQueryOptions<typeof route>(this.http, '/api/v1/todos', {
      queryKey: ['todos'],
    }),
  );
}
```

Query params, mutation bodies, and response shapes are all inferred from the server route definition with no manual type duplication.

`serverQueryOptions` and `serverInfiniteQueryOptions` forward TanStack Query
cancellation to Angular's HTTP subscription. Cancelling a query or removing its
last observer aborts an in-flight request. HTTP errors retain their status and
body; configure retries through the query or mutation options as usual.

The Query helpers disable HTTP transfer caching for their requests. Both Angular
and Analog's request-context interceptor honor this setting, leaving TanStack's
dehydrated state as the cache owner. Other HTTP requests retain their existing
transfer-cache behavior unless they also set `transferCache: false`.

## Prefetching Queries in `load()`

Use `definePageLoadQueries` in a `.server.ts` file to prefetch TanStack Query queries during the Nitro `load()` handler. The dehydrated cache rides along on the route's load result and is merged into the active `QueryClient` on `ResolveEnd`, so components reading the same query options find a warm cache on first render — no SSR-to-client refetch, no in-component request waterfall.

When nested loads prefetch the same key, TanStack's cache timestamps determine
which value is retained. The server transfers that resolved cache to the browser;
an older child payload does not replace newer parent or application-prefetched data.

Unhandled navigation or page-load errors reject buffered SSR instead of producing
an empty successful page. The native production wrapper preserves error statuses
from 400 through 599 and returns a generic, non-cacheable, non-indexable error
document without server details. A navigation error recovered by a router redirect
can still render normally. If progressive rendering has already sent its shell,
the HTTP host emits a generic failure trailer and disposes the application; its HTTP status can no
longer change. The host opts into this framing through `ServerContext.renderErrorsAsHtml`;
direct renderer calls retain their stream-error behavior by default.
Use buffered rendering when the page requires its final load status
before response headers are sent.
Some HTTP adapters expose an errored stream as ordinary EOF. The progressive
browser runtime therefore requires the authoritative completion tail; if the
document ends without it, the preview becomes a generic, non-indexable error view.
Progressive responses use identity encoding and `Cache-Control: no-store, no-transform`
so compression cannot hold back the shell or cache an incomplete document.
Explicitly buffered routes and static assets retain their normal encoding policy.

For Worker builds, Analog respects Nitro's non-Node or `noExternals: true` target
policy. Dependencies used by generated page-load endpoints, including RxJS, are
bundled instead of requiring a runtime `node_modules` directory. Native-only
dependencies still need a compatible target or a separate adapter.

```ts
// src/app/pages/posts.server.ts
import { definePageLoadQueries } from '@analogjs/router/tanstack-query/server';
import { queryOptions } from '@tanstack/angular-query-experimental';

export const postsQuery = queryOptions({
  queryKey: ['posts'],
  queryFn: async ({ signal }) =>
    fetch('https://api.example.com/posts', { signal }).then((r) => r.json()),
});

export const load = definePageLoadQueries({
  handler: async ({ client }) => {
    await client.prefetchQuery(postsQuery);
  },
});
```

```ts
// src/app/pages/posts.page.ts
import { Component } from '@angular/core';
import { injectQuery } from '@tanstack/angular-query-experimental';

import { postsQuery } from './posts.server';

@Component({
  template: `
    @if (posts.data(); as items) {
      @for (post of items; track post.id) {
        <p>{{ post.title }}</p>
      }
    }
  `,
})
export default class PostsPage {
  readonly posts = injectQuery(() => postsQuery);
}
```

`definePageLoadQueries` inherits `params` and `query` validation from `definePageLoad`; pass a Standard Schema and the handler is only invoked after validation succeeds. Any value you return from the handler is available as `data` on the load result for use with `injectLoad()`:

```ts
export const load = definePageLoadQueries({
  handler: async ({ client, params }) => {
    await client.prefetchQuery(postBySlugQuery(params['slug']));
    return { renderedAt: Date.now() };
  },
});

// in the component:
readonly loadResult = toSignal(injectLoad<typeof load>());
// loadResult()?.data.renderedAt
```

A fresh `QueryClient` is constructed per request. Pass `client: () => new QueryClient({ defaultOptions: ... })` if you need to override the defaults used for prefetching.

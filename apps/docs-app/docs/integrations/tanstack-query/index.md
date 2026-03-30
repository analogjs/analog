---
sidebar_position: 5
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

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
import type { ApplicationConfig } from '@angular/core';
import { requestContextInterceptor } from '@analogjs/router';
import { provideAnalogQuery } from '@analogjs/router/tanstack-query';
import {
  QueryClient,
  provideTanStackQuery,
} from '@tanstack/angular-query-experimental';

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(
      withFetch(),
      withInterceptors([requestContextInterceptor]),
    ),
    provideTanStackQuery(new QueryClient()),
    provideAnalogQuery(),
  ],
};
```

`provideAnalogQuery()` rehydrates the TanStack Query cache from `TransferState` on the client, preventing duplicate fetches after SSR navigation.

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

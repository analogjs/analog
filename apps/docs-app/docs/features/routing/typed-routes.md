# Typed Routes (Experimental)

Analog supports experimental type-safe routing features that provide autocomplete, typed params, and typed query params across your entire application. These features are inspired by [TanStack Router's](https://tanstack.com/router) type-safe navigation system.

:::warning

These APIs are experimental and subject to change. Enable them explicitly via feature flags.

:::

## Setup

Typed routes require two opt-ins: a **build-time** flag that generates the route type declarations, and a **runtime** feature that activates the typed navigation APIs.

### 1. Enable Route Type Generation

In your `vite.config.ts`, enable the `experimental.typedRouter` flag:

```ts
// vite.config.ts
import analog from '@analogjs/platform';
import { defineConfig } from 'vite';

export default defineConfig(() => ({
  plugins: [
    analog({
      // ...other options
      experimental: {
        typedRouter: true,
      },
    }),
  ],
}));
```

When enabled, the build generates a `.analog/routes.gen.ts` file that augments `AnalogRouteTable` with typed params and query for each file-based route. This is similar to TanStack Router's `routeTree.gen.ts` codegen.

### 2. Enable Typed Router Features

In your `app.config.ts`, add `withTypedRouter()` to `provideFileRouter()`:

```ts
// src/app/app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideFileRouter, withTypedRouter } from '@analogjs/router';

export const appConfig: ApplicationConfig = {
  providers: [provideFileRouter(withTypedRouter())],
};
```

### Strict Mode

Enable strict mode to log warnings in development when navigating to routes with params that don't match the generated route table:

```ts
provideFileRouter(withTypedRouter({ strictRouteParams: true }));
```

## Type-Safe Navigation

### `routePath()` — Build Typed URLs

The `routePath()` function builds URL strings with full type checking on route params:

```ts
import { routePath } from '@analogjs/router';

// Static route — no params required
routePath('/about');
// → '/about'

// Dynamic route — params are required and typed
routePath('/users/[id]', { params: { id: '42' } });
// → '/users/42'

// Catch-all route
routePath('/docs/[...slug]', { params: { slug: ['api', 'auth'] } });
// → '/docs/api/auth'

// Optional catch-all
routePath('/shop/[[...category]]');
// → '/shop'

// With query params and hash
routePath('/users/[id]', {
  params: { id: '42' },
  query: { tab: 'settings' },
  hash: 'top',
});
// → '/users/42?tab=settings#top'
```

When the route table is generated, `routePath()` autocompletes valid route paths and enforces that required params are provided.

### `injectTypedRouter()` — Navigate with Type Safety

`injectTypedRouter()` wraps Angular's `Router` with type-safe navigation methods:

```ts
import { Component } from '@angular/core';
import { injectTypedRouter } from '@analogjs/router';

@Component({
  template: `<button (click)="goToUser()">View User</button>`,
})
export default class UserListComponent {
  private router = injectTypedRouter();

  goToUser() {
    // Autocomplete on paths, type-checked params
    this.router.navigate('/users/[id]', { params: { id: '42' } });
  }
}
```

Available methods:

| Method                          | Description                            |
| ------------------------------- | -------------------------------------- |
| `navigate(path, options?)`      | Navigate to a typed route path         |
| `createUrlTree(path, options?)` | Build a `UrlTree` for `[routerLink]`   |
| `url(path, options?)`           | Build a URL string                     |
| `angularRouter`                 | Access the underlying Angular `Router` |

### `RouteLinkPipe` — Type-Safe Links in Templates

Use the `routeLink` pipe with Angular's `[routerLink]` for typed route building in templates:

```ts
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RouteLinkPipe } from '@analogjs/router';

@Component({
  imports: [RouterLink, RouteLinkPipe],
  template: `
    <!-- Static route -->
    <a [routerLink]="'/about' | routeLink">About</a>

    <!-- Dynamic route with params -->
    <a [routerLink]="'/users/[id]' | routeLink: { params: { id: userId } }">
      User Profile
    </a>

    <!-- With query params -->
    <a
      [routerLink]="
        '/users/[id]'
          | routeLink
            : {
                params: { id: userId },
                query: { tab: 'settings' },
              }
      "
      >Settings</a
    >
  `,
})
export default class NavComponent {
  userId = '42';
}
```

## Typed Params and Query Injection

### `injectTypedParams()` — Typed Route Params as a Signal

Inspired by TanStack Router's `useParams({ from: '/path' })`, this function returns route params as a typed Angular signal:

```ts
import { Component } from '@angular/core';
import { injectTypedParams } from '@analogjs/router';

@Component({
  template: `<h1>User {{ params().id }}</h1>`,
})
export default class UserPageComponent {
  // The `from` string constrains the return type
  readonly params = injectTypedParams('/users/[id]');
  // params() → { id: string }
}
```

The `from` parameter is used purely for TypeScript type inference. At runtime, params are read from the current `ActivatedRoute`. Use this inside a component rendered by the specified route.

### `injectTypedQuery()` — Typed Query Params as a Signal

Similar to TanStack Router's `useSearch({ from: '/path' })`, this reads validated query params:

```ts
import { Component, computed } from '@angular/core';
import { injectTypedQuery } from '@analogjs/router';

@Component({
  template: `
    <div>Page {{ page() }}</div>
    <div>Status: {{ query().status }}</div>
  `,
})
export default class IssuesPageComponent {
  readonly query = injectTypedQuery('/issues');
  readonly page = computed(() => this.query().page);
}
```

When a route exports a `routeQuerySchema`, the return type reflects the validated output shape instead of raw string values.

## Route Context

### `withRouteContext()` — Shared Context for All Routes

Inspired by TanStack Router's `createRootRouteWithContext<T>()`, you can provide a typed context object available to all routes via dependency injection:

```ts
// src/app/app.config.ts
import { ApplicationConfig, inject } from '@angular/core';
import {
  provideFileRouter,
  withTypedRouter,
  withRouteContext,
} from '@analogjs/router';
import { AuthService } from './auth.service';
import { AnalyticsService } from './analytics.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideFileRouter(
      withTypedRouter(),
      withRouteContext({
        auth: inject(AuthService),
        analytics: inject(AnalyticsService),
      }),
    ),
  ],
};
```

### `injectRouteContext()` — Access the Context

Retrieve the context in any component or service:

```ts
import { Component } from '@angular/core';
import { injectRouteContext } from '@analogjs/router';
import { AuthService } from '../auth.service';
import { AnalyticsService } from '../analytics.service';

@Component({
  template: `<h1>Dashboard</h1>`,
})
export default class DashboardComponent {
  private ctx = injectRouteContext<{
    auth: AuthService;
    analytics: AnalyticsService;
  }>();

  constructor() {
    this.ctx.analytics.trackPageView();
  }
}
```

In TanStack Router, context accumulates through the route tree via `beforeLoad`. In Analog, the context is provided at the root level and is available everywhere via Angular's dependency injection.

## Loader Caching

### `withLoaderCaching()` — Cache Server-Loaded Data

Inspired by TanStack Router's `defaultStaleTime` and `defaultGcTime` options, you can configure how server-loaded route data is cached:

```ts
// src/app/app.config.ts
import { ApplicationConfig } from '@angular/core';
import {
  provideFileRouter,
  withTypedRouter,
  withLoaderCaching,
} from '@analogjs/router';

export const appConfig: ApplicationConfig = {
  providers: [
    provideFileRouter(
      withTypedRouter(),
      withLoaderCaching({
        defaultStaleTime: 30_000, // 30s before data is considered stale
        defaultGcTime: 300_000, // 5min cache retention after leaving route
        defaultPendingMs: 200, // 200ms delay before showing loading UI
      }),
    ),
  ],
};
```

| Option             | Default   | Description                                                                                             |
| ------------------ | --------- | ------------------------------------------------------------------------------------------------------- |
| `defaultStaleTime` | `0`       | Time (ms) before loader data is considered stale. While fresh, returning to a route uses cached data.   |
| `defaultGcTime`    | `300_000` | Time (ms) to retain unused loader data after leaving a route.                                           |
| `defaultPendingMs` | `0`       | Delay (ms) before showing loading indicators during route transitions. Prevents flash of loading state. |

## How Types Flow

The type safety pipeline works as follows:

```
1. File: src/app/pages/users/[id].page.ts
   └── Export: routeParamsSchema = v.object({ id: v.pipe(v.string(), ...) })

2. Build (experimental.typedRouter: true):
   └── Generates .analog/routes.gen.ts
       └── Augments AnalogRouteTable with:
           '/users/[id]': {
             params: { id: string }
             paramsOutput: { id: string }
           }

3. Runtime:
   ├── routePath('/users/[id]', { params: { id: '42' } })  ✅ typed
   ├── router.navigate('/users/[id]', { params: { id: 42 } })  ❌ type error
   ├── injectTypedParams('/users/[id]')  → Signal<{ id: string }>
   └── '/users/[id]' | routeLink:{ params: { id: userId } }  ✅ typed
```

When no route table is generated (i.e., `experimental.typedRouter` is not enabled), all path types fall back to `string` and params are untyped — existing code continues to work without changes.

## Comparison with TanStack Router

| Concept            | TanStack Router                      | Analog (Experimental)                                                    |
| ------------------ | ------------------------------------ | ------------------------------------------------------------------------ |
| Type registration  | `Register` interface augmentation    | `AnalogRouteTable` augmentation                                          |
| Route codegen      | `routeTree.gen.ts`                   | `.analog/routes.gen.ts`                                                  |
| Type-safe navigate | `<Link to="/path" params={...}>`     | `router.navigate('/path', { params })`                                   |
| Typed params       | `useParams({ from: '/path' })`       | `injectTypedParams('/path')`                                             |
| Typed search       | `useSearch({ from: '/path' })`       | `injectTypedQuery('/path')`                                              |
| Root context       | `createRootRouteWithContext<T>()`    | `withRouteContext(ctx)`                                                  |
| Loader caching     | `defaultStaleTime` / `defaultGcTime` | `withLoaderCaching(options)`                                             |
| Strict mode        | `useParams({ strict: true })`        | `withTypedRouter({ strictRouteParams: true })`                           |
| Schema validation  | Validator adapters (Zod, Valibot)    | [Standard Schema](/docs/features/data-fetching/validation) (any library) |

## Full Example

```ts
// vite.config.ts
import analog from '@analogjs/platform';
import { defineConfig } from 'vite';

export default defineConfig(() => ({
  plugins: [
    analog({
      experimental: {
        typedRouter: true,
      },
    }),
  ],
}));
```

```ts
// src/app/app.config.ts
import { ApplicationConfig } from '@angular/core';
import {
  provideFileRouter,
  withTypedRouter,
  withLoaderCaching,
} from '@analogjs/router';

export const appConfig: ApplicationConfig = {
  providers: [
    provideFileRouter(
      withTypedRouter({ strictRouteParams: true }),
      withLoaderCaching({
        defaultStaleTime: 30_000,
        defaultPendingMs: 200,
      }),
    ),
  ],
};
```

```ts
// src/app/pages/users/[id].page.ts
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  injectTypedParams,
  injectTypedRouter,
  RouteLinkPipe,
} from '@analogjs/router';

@Component({
  imports: [RouterLink, RouteLinkPipe],
  template: `
    <h1>User {{ params().id }}</h1>

    <a
      [routerLink]="
        '/users/[id]'
          | routeLink
            : {
                params: { id: nextUserId },
              }
      "
      >Next User</a
    >
  `,
})
export default class UserPageComponent {
  readonly params = injectTypedParams('/users/[id]');
  readonly router = injectTypedRouter();

  get nextUserId() {
    return String(Number(this.params().id) + 1);
  }
}
```

```ts
// src/app/pages/users/[id].server.ts
import { definePageLoad } from '@analogjs/router/server/actions';
import * as v from 'valibot';

export const routeParamsSchema = v.object({
  id: v.pipe(v.string(), v.regex(/^\d+$/)),
});

export const load = definePageLoad({
  params: routeParamsSchema,
  handler: async ({ params, fetch }) => {
    return fetch(`/api/users/${params.id}`);
  },
});
```

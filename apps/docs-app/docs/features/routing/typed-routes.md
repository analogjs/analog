# Typed Routes (Experimental)

Analog supports experimental type-safe routing features that provide autocomplete, typed params, and typed query params across your entire application. These features are inspired by [TanStack Router's](https://tanstack.com/router) type-safe navigation system.

:::warning

These APIs are experimental and subject to change. Enable them explicitly via feature flags.

:::

## Setup

Typed routes require a **runtime** feature that activates the typed navigation APIs. The **build-time** route type generation is enabled by default.

### 1. Route Type Generation (enabled by default)

Typed route generation ships as part of `@analogjs/platform` and is **enabled by
default**. When `experimental.typedRouter` is omitted or set to `true`, the
build generates a `src/routeTree.gen.ts` file with typed params and query params
for each file-based route.

:::caution Breaking Change

In previous versions, typed route generation was opt-in and required explicitly
setting `experimental.typedRouter: true`. It is now enabled by default.

If you do not want typed route generation, opt out explicitly:

```ts
// vite.config.ts
import analog from '@analogjs/platform';
import { defineConfig } from 'vite';

export default defineConfig(() => ({
  plugins: [
    analog({
      experimental: {
        typedRouter: false,
      },
    }),
  ],
}));
```

If you previously had no `typedRouter` configuration, the first build will
generate `src/routeTree.gen.ts` and inject imports into `src/main.ts` /
`src/main.server.ts`. Subsequent production builds verify the generated file is
still fresh — if your routes changed, the build will fail so you can review
the update and rerun. To avoid this, either opt out or commit the generated
`routeTree.gen.ts` to your repository.

:::

The previous build-time imports from `@analogjs/vite-plugin-routes` and
`@analogjs/router/manifest` are no longer supported. Typed route generation now
ships as part of the `@analogjs/platform` integration only.

You can also enable it explicitly or pass configuration options:

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

When enabled, the first build generates a `src/routeTree.gen.ts` file that augments `AnalogRouteTable` with typed params and query for each file-based route. This is similar to TanStack Router's `routeTree.gen.ts` codegen.

Subsequent production builds verify that an existing checked-in `routeTree.gen.ts` is still fresh. If the route sources changed, Analog rewrites the file and fails the build so you can review the generated update and rerun the build with the fresh output in place.

This is the only generated route artifact. Optional features such as
`jsonLdManifest` change the contents of `routeTree.gen.ts` instead of creating
additional files like `routes.gen.ts` or `route-jsonld.gen.ts`.

You can customize the output path by passing an options object instead of `true`:

```ts
experimental: {
  typedRouter: {
    outFile: 'src/generated/routeTree.gen.ts',
  },
},
```

If you need the previous "always rewrite during build" behavior, disable the
freshness guard explicitly:

```ts
experimental: {
  typedRouter: {
    verifyOnBuild: false,
  },
},
```

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

## Supported Route Patterns

The typed route system supports all Analog file-based route conventions:

| Pattern            | Example file                         | Generated path          |
| ------------------ | ------------------------------------ | ----------------------- |
| Static             | `pages/about.page.ts`                | `/about`                |
| Index              | `pages/index.page.ts`                | `/`                     |
| Dynamic            | `pages/users/[id].page.ts`           | `/users/[id]`           |
| Dot-notation       | `pages/blog.[slug].page.ts`          | `/blog/[slug]`          |
| Catch-all          | `pages/docs/[...slug].page.ts`       | `/docs/[...slug]`       |
| Optional catch-all | `pages/shop/[[...category]].page.ts` | `/shop/[[...category]]` |
| Route group        | `pages/(auth)/login.page.ts`         | `/login`                |
| Content            | `content/guides/intro.md`            | `/guides/intro`         |

Route groups are stripped from the URL path but preserved in the
structural route id. Content routes (`.md` files) are included in
the route table alongside page routes.

## Type-Safe Navigation

### `routePath()` — Build Typed Route Links

The `routePath()` function builds a route link object with full type checking on route params.
The returned object separates path, query params, and fragment for direct use with Angular's
`[routerLink]`, `[queryParams]`, and `[fragment]` directives:

```ts
import { routePath } from '@analogjs/router';

// Static route
routePath('/about');
// → { path: '/about', queryParams: null, fragment: undefined }

// Dynamic route — params are required and typed
routePath('/users/[id]', { params: { id: '42' } });
// → { path: '/users/42', queryParams: null, fragment: undefined }

// With query params and hash
routePath('/users/[id]', {
  params: { id: '42' },
  query: { tab: 'settings' },
  hash: 'top',
});
// → { path: '/users/42', queryParams: { tab: 'settings' }, fragment: 'top' }
```

Use in templates with `@let`:

```html
@let link = routePath('/users/[id]', { params: { id: userId }, query: { tab:
'settings' } });
<a
  [routerLink]="link.path"
  [queryParams]="link.queryParams"
  [fragment]="link.fragment"
>
  User Profile
</a>
```

When the route table is generated, `routePath()` autocompletes valid route paths and enforces that required params are provided.

### `injectNavigate()` — Type-Safe Navigation

`injectNavigate()` returns a typed navigate function:

```ts
import { Component } from '@angular/core';
import { injectNavigate } from '@analogjs/router';

@Component({
  template: `<button (click)="goToUser()">View User</button>`,
})
export default class UserListComponent {
  private navigate = injectNavigate();

  goToUser() {
    // Autocomplete on paths, type-checked params
    this.navigate('/users/[id]', { params: { id: '42' } });
  }

  replaceCurrentRoute() {
    // Pass Angular NavigationBehaviorOptions as a third argument
    this.navigate(
      '/users/[id]',
      { params: { id: '42' } },
      { replaceUrl: true },
    );
  }
}
```

## Typed Params and Query Injection

### `injectParams()` — Typed Route Params as a Signal

Inspired by TanStack Router's `useParams({ from: '/path' })`, this function returns route params as a typed Angular signal:

```ts
import { Component } from '@angular/core';
import { injectParams } from '@analogjs/router';

@Component({
  template: `<h1>User {{ params().id }}</h1>`,
})
export default class UserPageComponent {
  // The `from` string constrains the return type
  readonly params = injectParams('/users/[id]');
  // params() → { id: string }
}
```

The `from` parameter is used purely for TypeScript type inference. At runtime, params are read from the current `ActivatedRoute`. Use this inside a component rendered by the specified route.

### `injectQuery()` — Typed Query Params as a Signal

Similar to TanStack Router's `useSearch({ from: '/path' })`, this reads validated query params:

```ts
import { Component, computed } from '@angular/core';
import { injectQuery } from '@analogjs/router';

@Component({
  template: `
    <div>Page {{ page() }}</div>
    <div>Status: {{ query().status }}</div>
  `,
})
export default class IssuesPageComponent {
  readonly query = injectQuery('/issues');
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

## Multi-Library Route Composition

Routes can be composed from multiple directories using
`additionalPagesDirs` and `additionalContentDirs`:

```ts
analog({
  additionalPagesDirs: ['/libs/shared/feature/src/pages'],
  additionalContentDirs: ['/libs/shared/content'],
  experimental: {
    typedRouter: true,
  },
});
```

Routes from additional directories are included in the generated
route table alongside app-local routes. When two files resolve to
the same URL path, app-local routes take precedence and a warning
is logged:

```text
[Analog] Route collision: '/blog/[slug]' is defined by both
'/src/app/pages/blog/[slug].page.ts' and
'/libs/shared/feature/src/pages/blog/[slug].page.ts'.
Keeping '/src/app/pages/blog/[slug].page.ts' based on
route source precedence and skipping duplicate.
```

## Route Import Auto-Injection

The generated `routeTree.gen.ts` uses `declare module` augmentation
to extend `AnalogRouteTable`. For the augmentation to take effect,
the file must be part of the TypeScript program.

The plugin automatically adds a side-effect import to your entry
file (`src/main.ts` or `src/main.server.ts`) during the first
build:

```ts
import './routeTree.gen';
```

If neither entry file exists, a warning is printed with manual
instructions. When using a custom `outFile`, the import path is
computed automatically.

## CI Staleness Verification

The `verify` option provides a strict CI mode that fails without
writing when the generated file would change:

```ts
typedRoutes({ verify: true });
```

This is useful in CI pipelines where you want to ensure checked-in
route files are always fresh:

```bash
# Build (regenerates), then verify no git changes
pnpm build
node tools/scripts/verify-route-freshness.mts
```

The default `verifyOnBuild: true` behavior writes the fresh file
during production builds and then fails so you can review and
commit the update. Set `verifyOnBuild: false` if you prefer silent
regeneration.

## Generated Route Tree Metadata

In addition to the `AnalogRouteTable` navigation surface, `routeTree.gen.ts` also exports a richer metadata-oriented route tree for tooling and plugins.

### Interfaces and Types

The generated file includes:

| Export                       | Description                                          |
| ---------------------------- | ---------------------------------------------------- |
| `AnalogGeneratedRouteRecord` | Generic interface for route metadata records         |
| `AnalogFileRoutesById`       | Routes indexed by structural id                      |
| `AnalogFileRoutesByFullPath` | Type map from resolved navigation path to route data |
| `AnalogRouteTreeId`          | Union type of all route ids                          |
| `AnalogRouteTreeFullPath`    | Union type of all full paths                         |
| `analogRouteTree`            | Runtime object with `byId` and `byFullPath`          |

### Route Record Shape

Each route record in `analogRouteTree.byId` contains:

```ts
{
  id: string;          // Structural route id (preserves groups/index)
  path: string;        // Local path relative to parent
  fullPath: string;    // Resolved navigation path
  parentId: string | null;
  children: readonly string[];
  sourceFile: string;
  kind: 'page' | 'content';
  hasParamsSchema: boolean;
  hasQuerySchema: boolean;
  hasJsonLd: boolean;
  isIndex: boolean;
  isGroup: boolean;
  isCatchAll: boolean;
  isOptionalCatchAll: boolean;
}
```

### Usage

The route tree is useful for structure-aware tooling such as breadcrumb generation, sidebar navigation, route analysis, or build-time manifests. At runtime, `analogRouteTree.byFullPath[path]` returns the corresponding route id, which you can use to access the full record in `analogRouteTree.byId`:

```ts
import { analogRouteTree } from '../routeTree.gen';

// Look up a route by its full path
const routeId = analogRouteTree.byFullPath['/users/[id]'];
const route = analogRouteTree.byId[routeId];

// Walk children
for (const childId of route.children) {
  const child = analogRouteTree.byId[childId];
  console.log(child.fullPath);
}
```

This metadata surface is additive — projects that only use `routePath()` and `injectNavigate()` can ignore it.

## Typed JSON-LD with `schema-dts`

Route JSON-LD authoring supports fully typed structured data using [`schema-dts`](https://github.com/google/schema-dts):

```ts
import type { WebPage, WithContext } from 'schema-dts';

export const routeMeta = {
  jsonLd: {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Products',
  } satisfies WithContext<WebPage>,
};
```

The `AnalogJsonLdDocument` type exported from `@analogjs/router` accepts:

- `WithContext<Thing>` — single Schema.org node
- `Graph` — `@graph`-based document
- `Array<WithContext<Thing>>` — multiple nodes

When `jsonLdManifest` is enabled, the generated `routeTree.gen.ts` file includes typed manifest entries using `schema-dts` types instead of generic `Record<string, unknown>`.

Install `schema-dts` as a dev dependency to enable typed JSON-LD:

```bash
npm install -D schema-dts
```

Existing plain-object JSON-LD continues to work at runtime. The typed surface provides stronger author-time checking for new code.

## How Types Flow

The type safety pipeline works as follows:

```text
1. File: src/app/pages/users/[id].page.ts
   └── Export: routeParamsSchema = v.object({ id: v.pipe(v.string(), ...) })

2. Build (experimental.typedRouter: true):
   └── Generates src/routeTree.gen.ts
       └── Augments AnalogRouteTable with:
           '/users/[id]': {
             params: { id: string }
             paramsOutput: { id: string }
           }

3. Runtime:
   ├── routePath('/users/[id]', { params: { id: '42' } })
   │     → { path: '/users/42', queryParams, fragment, ... }    ✅ typed route object
   ├── navigate('/users/[id]', { params: { id: 42 } })          ❌ type error
   ├── navigate('/users/[id]', { params: { id: '42' } })        ✅ typed (via injectNavigate())
   ├── injectParams('/users/[id]')  → Signal<{ id: string }>
   └── template: [routerLink]="link.path"
```

When no route table is generated (i.e., `experimental.typedRouter` is not enabled), all path types fall back to `string` and params are untyped — existing code continues to work without changes.

## Comparison with TanStack Router

| Concept            | TanStack Router                      | Analog (Experimental)                                                    |
| ------------------ | ------------------------------------ | ------------------------------------------------------------------------ |
| Type registration  | `Register` interface augmentation    | `AnalogRouteTable` augmentation                                          |
| Route codegen      | `routeTree.gen.ts`                   | `src/routeTree.gen.ts`                                                   |
| Type-safe navigate | `<Link to="/path" params={...}>`     | `injectNavigate()` / `routePath()`                                       |
| Typed params       | `useParams({ from: '/path' })`       | `injectParams('/path')`                                                  |
| Typed search       | `useSearch({ from: '/path' })`       | `injectQuery('/path')`                                                   |
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
import { injectParams, routePath } from '@analogjs/router';

@Component({
  imports: [RouterLink],
  template: `
    <h1>User {{ params().id }}</h1>

    @let nextLink = routePath('/users/[id]', { params: { id: nextUserId } });
    <a [routerLink]="nextLink.path">Next User</a>
  `,
})
export default class UserPageComponent {
  readonly params = injectParams('/users/[id]');

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

# Type-safe Routing

Typed routing is an opt-in experimental feature that adds checked route paths and parameters to Analog's file router. It is disabled by default. Its APIs and generated types may change while the feature is experimental.

Enable it explicitly with `experimental.typedRouting` in your existing Vite configuration:

```ts
import analog from '@analogjs/platform';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [analog({ experimental: { typedRouting: true } })],
});
```

Analog generates `src/routeTree.gen.d.ts`. Include it in each tsconfig that checks your application, including separate browser, server, and test configurations. Add it to your existing `files` list, or ensure an `include` pattern covers it:

```json
{
  "include": ["src/**/*.d.ts"]
}
```

Preserve your other `files` and `include` entries. Paths are relative to the tsconfig declaring them. Inherited lists apply unless a child tsconfig overrides them.

Analog checks inclusion in the tsconfig selected by its Angular compiler plugin and reports an error with the path to add when it is missing. Application entry files are not modified, and components do not need to import the declaration.

Keep the generated file in source control. Start the dev server to generate it before running standalone type checks. Page additions, renames, and removals regenerate the declaration during development. Production builds reject stale checked-in route tables; the first build can generate a missing table.

To customize the output or allow regeneration during builds:

```ts
analog({
  experimental: {
    typedRouting: {
      outFile: 'src/routeTree.gen.d.ts',
      verifyOnBuild: false,
    },
  },
});
```

Custom output paths must end in `.d.ts` and be included in the relevant tsconfigs.

## Build links

Import `LinkTo` from `@analogjs/router` into your component's `imports` and bind a destination to `[linkTo]`:

```html
<a linkTo="/shipping">Shipping</a>
<a
  [linkTo]="{
    path: '/products/[id]',
    params: { id: product.id },
    query: { tab: 'details' },
    hash: 'reviews'
  }"
  routerLinkActive="active"
>
  Details
</a>
```

The generated route table checks the path, required named parameters, and their value types together. Static routes accept string shorthand, such as `linkTo="/shipping"` or `[linkTo]="'/shipping'"`. Only generated routes with no parameters allow this shorthand; dynamic and catch-all routes require a destination object. Unknown paths, unrestricted `string` values, positional command arrays, and `UrlTree` values are rejected with `strictTemplates` enabled. Use the destination object with `query` and `hash` to add query parameters and fragments, including for static routes. Binding `null` or `undefined` disables the link.

`LinkTo` composes Angular's `RouterLink`, preserving href generation, navigation, modifier clicks, and target behavior. It exposes `target`, `queryParamsHandling`, `preserveFragment`, `skipLocationChange`, `replaceUrl`, and `state`. Import Angular's `RouterLinkActive` separately to use active classes on the link or an ancestor. Use `[linkTo]` on its own; do not also apply `[routerLink]` to the same element.

Dynamic parameters accept strings or numbers. Numbers are converted to strings when building links and navigating. Required catch-all parameters accept non-empty arrays of string or number segments; optional catch-all parameters may be omitted or empty. For required catch-all arrays stored in variables, use the tuple type `[string | number, ...(string | number)[]]` to preserve the non-empty guarantee. Query values are strings, numbers, booleans, or arrays of them. Like parameters, they are converted to strings, so they read back as strings. A `null` or `undefined` value omits the key, or removes it when `queryParamsHandling` is `'merge'`. `hash` supplies the fragment. URL path segments are encoded automatically.

## Navigate programmatically

Use `injectNavigate` inside an Angular injection context:

```ts
import { injectNavigate } from '@analogjs/router';

const navigate = injectNavigate();
navigate('/products/[id]', { params: { id: 42 } }, { replaceUrl: true });
navigate('/search', { query: { page: 2 } }, { queryParamsHandling: 'merge' });
```

The last argument accepts Angular's navigation options, such as `replaceUrl` and `state`, plus `queryParamsHandling` and `preserveFragment`. Use `query` and `hash` in place of `queryParams` and `fragment`.

## Build link data in TypeScript

Use `toRoute` when you need link data in TypeScript. It does not require an injection context:

```ts
import { toRoute } from '@analogjs/router';

const link = toRoute('/products/[id]', { params: { id: 42 } });
// link.path is ['/', 'products', '42']
```

The result contains Angular router commands in `path`, plus `queryParams` and `fragment`. These properties can be passed to Angular's router APIs. For template links, use `[linkTo]` as shown above.

## Read parameters as signals

```ts
import { injectParams, injectQuery } from '@analogjs/router';

const params = injectParams('/products/[id]');
const query = injectQuery('/products/[id]');
// params().id is a string; query()['page'] is a raw query value.
```

Use these helpers in a component rendered by the specified route. The path narrows TypeScript types; it does not select another active route. Parameters include ancestor parameters, and catch-all values are normalized to arrays. The helpers accept `{ injector }` when called outside an injection context.

Values remain raw Angular router values. Exporting a schema does not validate or coerce these signals. For example, `"42"` stays a string.

Without a path, `injectParams()`, `injectQuery()`, `injectRouteData()`, and `injectResources()` return untyped values for the current route, for example in a component shared by several routes. Catch-all segments need a path: a catch-all route has no parameter name at runtime, so `injectParams()` omits required catch-alls and does not split optional ones into arrays.

Type checking comes from the generated table. The `experimental.typedRouting` option enables generation for the feature as a whole; no additional router provider or per-helper experimental flag is required.

## Read route data and load results

`injectRouteData` reads the page's route data as a signal. Its type comes from the page module and its [layout routes](/docs/features/routing/overview#layout-routes): static `routeMeta.data`, resolved `routeMeta.resolve` values, and the page's server `load` result under `load`.

```ts
// src/app/pages/products.page.ts (layout)
import type { RouteMeta } from '@analogjs/router';

export const routeMeta = { data: { section: 'catalog' } } satisfies RouteMeta;
```

```ts
// src/app/pages/products/[id].page.ts
import { Component, inject } from '@angular/core';
import { injectRouteData, type RouteMeta } from '@analogjs/router';

export const routeMeta = {
  resolve: { related: () => inject(ProductsService).related() },
} satisfies RouteMeta;

@Component({ template: `{{ data().section }}` })
export default class ProductPage {
  readonly data = injectRouteData('/products/[id]');
  // data().related and data().load are typed as well.
}
```

Use `satisfies RouteMeta` instead of a `RouteMeta` annotation. An annotation widens the object, so data values are typed as `unknown`.

`injectLoad` also accepts a route path. The result is typed from the page's `.server.ts` `load` function, so the page does not need to import it:

```ts
readonly product = toSignal(injectLoad('/products/[id]'), { requireSync: true });
```

Paths without a server `load` function are rejected. The generated declaration references page and `.server.ts` modules with `typeof import()`, so they must type-check under each application tsconfig. Adding or removing a `routeMeta` or `load` export regenerates the declaration during development.

As with Angular's route data inheritance, a page's keys override the same keys from its layouts. `load` is always the page's own result. When several files define the same URL, such as a layout and its index page (`products.page.ts` and `products/index.page.ts`), `injectRouteData` has no typed keys for that path and `injectLoad` rejects it. Use `injectRouteData()` without a path or `injectLoad<typeof load>()` there.

## Access route resources

When using Angular's `withRouterResources()`, `injectResources` returns the reactive resources defined on the route via `routeMeta.resources`:

```ts
import { injectResources } from '@analogjs/router';

const resources = injectResources('/products/[id]');
// resources.user is a typed Resource instance
const user = resources.user.value();
```

Calling `injectResources()` without a route path returns untyped route resources.

## Navigate relative to the current route

Pass the current page's path to `injectNavigate`, or bind it to `from` on `LinkTo`, to navigate relative to it:

```ts
// src/app/pages/users/[id].page.ts
const navigate = injectNavigate('/users/[id]');
navigate('./posts/[postId]', { params: { postId: 7 } }); // /users/42/posts/7
navigate('.', { query: { tab: 'bio' } }); // /users/42?tab=bio
navigate('../../about');
```

```html
<a from="/users/[id]" linkTo=".">Profile</a>
<a from="/users/[id]" [linkTo]="{ path: '.', params: { id: nextId } }">Next</a>
```

Relative targets resolve against the `from` path pattern: `.` is the route itself, `./child` is below it, and `..` or `../sibling` go through its ancestors. Each target has one relative form, through the nearest shared ancestor, and must be a generated route. Absolute paths remain available.

Parameters in the leading segments shared by `from` and the target default to their current values, so they become optional. Parameters after the paths diverge are required, and explicit values override inherited ones. As with `injectParams`, use `from` in a component rendered by that route.

With `injectNavigate(from)`, `params` and `query` can also be functions. They receive the current route's typed params or query and return the target's values:

```ts
navigate('.', { params: (prev) => ({ id: Number(prev.id) + 1 }) }); // /users/43
navigate('.', { query: ({ tab, ...rest }) => rest }); // drops tab, keeps the rest
```

## Compatibility

Existing file routing, Markdown routes, Nitro configuration, and Angular compiler options remain unchanged. Additional page and content directories participate in generation. Without the generated declaration in the TypeScript program, typed helper calls fail to compile. Use Angular's existing router APIs for navigation without generated route types.

## Type checking

Use Angular's compiler with your application tsconfig to check TypeScript and templates:

```sh
pnpm exec ngc -p tsconfig.app.json --noEmit
```

Template checking requires `angularCompilerOptions.strictTemplates: true`. If you use `fastCompile` or disable type checking in Vite, run this check separately; enabling typed routing does not override those compiler settings.

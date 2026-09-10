# Typed Routes

Typed routing is an opt-in experiment that adds checked route paths and parameters to Analog's file router. Enable it in your existing Vite configuration:

```ts
import analog from '@analogjs/platform';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [analog({ experimental: { typedRouter: true } })],
});
```

Analog generates `src/routeTree.gen.ts` and adds a type-only import to your application entry. Keep the generated file in source control. Run the dev server after adding or removing pages; production builds reject stale checked-in route tables. The first build can generate a missing table.

To customize the output or allow regeneration during builds:

```ts
analog({
  experimental: {
    typedRouter: {
      outFile: 'src/routeTree.gen.ts',
      verifyOnBuild: false,
    },
  },
});
```

## Build links and navigate

```ts
import { injectNavigate, routePath } from '@analogjs/router';

const link = routePath('/products/[id]', { params: { id: '42' } });
// link.path === '/products/42'

// Inside an Angular injection context:
const navigate = injectNavigate();
navigate('/products/[id]', { params: { id: '42' } }, { replaceUrl: true });
```

Bind the returned link properties separately:

```html
<a
  [routerLink]="link.path"
  [queryParams]="link.queryParams"
  [fragment]="link.fragment"
>
  Product
</a>
```

Dynamic parameters are required strings. Catch-all parameters use arrays of path segments; optional catch-all parameters may be omitted. Query values are strings or string arrays, and `hash` supplies the fragment. URL path segments are encoded automatically.

## Read parameters as signals

```ts
import { injectParams, injectQuery } from '@analogjs/router';

const params = injectParams('/products/[id]');
const query = injectQuery('/products/[id]');
// params().id is a string; query()['page'] is a raw query value.
```

Use these helpers in a component rendered by the specified route. The path narrows TypeScript types; it does not select another active route. Parameters include ancestor parameters, and catch-all values are normalized to arrays. The helpers accept `{ injector }` when called outside an injection context.

Values remain raw Angular router values. Exporting a schema does not validate or coerce these signals. For example, `"42"` stays a string.

Type checking comes from the generated table. No additional router provider is required.

## Compatibility

Existing file routing, Markdown routes, Nitro configuration, and Angular compiler options remain unchanged. Additional page and content directories participate in generation. Without a generated table in the TypeScript program, the navigation helpers accept arbitrary string paths.

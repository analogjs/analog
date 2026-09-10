# Typed Routes

Typed routing is an opt-in experimental feature that adds checked route paths and parameters to Analog's file router. It is disabled by default. Its APIs and generated types may change while the feature is experimental.

Enable it explicitly with `experimental.typedRouter` in your existing Vite configuration:

```ts
import analog from '@analogjs/platform';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [analog({ experimental: { typedRouter: true } })],
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
    typedRouter: {
      outFile: 'src/routeTree.gen.d.ts',
      verifyOnBuild: false,
    },
  },
});
```

Custom output paths must end in `.d.ts` and be included in the relevant tsconfigs.

## Build links and navigate

```ts
import { injectNavigate, toRoute } from '@analogjs/router';

const link = toRoute('/products/[id]', { params: { id: '42' } });
// link.path is ['/', 'products', '42']

// Inside an Angular injection context:
const navigate = injectNavigate();
navigate('/products/[id]', { params: { id: '42' } }, { replaceUrl: true });
```

The path contains Angular router commands with unencoded segments. Bind the returned link properties separately:

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

Type checking comes from the generated table. The `experimental.typedRouter` option enables generation for the feature as a whole; no additional router provider or per-helper experimental flag is required.

## Compatibility

Existing file routing, Markdown routes, Nitro configuration, and Angular compiler options remain unchanged. Additional page and content directories participate in generation. Without the generated declaration in the TypeScript program, typed helper calls fail to compile. Use Angular's existing router APIs for navigation without generated route types.

## Type checking

Use Angular's compiler with your application tsconfig to check TypeScript and templates:

```sh
pnpm exec ngc -p tsconfig.app.json --noEmit
```

Template checking requires `angularCompilerOptions.strictTemplates: true`. If you use `fastCompile` or disable type checking in Vite, run this check separately; enabling typed routing does not override those compiler settings.

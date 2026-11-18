# @analogjs/tsrx-angular

Experimental: compile [TSRX](https://tsrx.dev) modules as Angular components
with Analog's fast compile path. Not published; build it from this repository.

```ts
// vite.config.ts
import angular from '@analogjs/vite-plugin-angular';
import { tsrxAngular } from '@analogjs/tsrx-angular';

export default defineConfig({
  plugins: [tsrxAngular(), angular({ fastCompile: true })],
});
```

```tsrx
import { Component, input, signal } from '@angular/core';

export const CounterMeta = { selector: 'app-counter' } satisfies Component;

export function Counter() @{
  const step = input(1);
  const count = signal(0);
  <button onClick={() => count.update((c) => c + step())}>{count()}</button>
}
```

- Components are `function Name() @{ … }`. Declare inputs, outputs, models and
  queries with `input()`, `output()`, `model()` and `viewChild()` at the top of
  the body.
- `XMeta` exports carry `@Component` metadata for component `X`. Without one,
  the selector is the component name; names of native elements (`Button`, `A`,
  …) need an `XMeta` selector.
- `@if`, `@for` (`key` → `track`), `@switch` and `@try`/`@catch` (→
  `@boundary`/`@error`) map to Angular's control flow.
- Components project children with Angular's `<ng-content>` (`select`,
  fallback content, `ngProjectAs`), and `contentChild()` queries them.
- `.page.tsrx` files work as `@analogjs/router` pages.
- Angular's `@defer` and `@boundary` syntax works as-is:
  `@defer (on viewport) { <Chart /> } @placeholder { <p>…</p> }`,
  `@boundary { <Widget /> } @error (let err = $error, reset = $reset) { … }`.
  `@error` `let` variables, `$error`, `$reset` and `when` conditions are
  usable in the block. Like `@if`, each block renders a single node; wrap
  several in `<>…</>`.

## Types

TypeScript can't read `.tsrx` files, so the plugin writes a declaration file
for each one, with types inferred from its lowered code. They go in
`node_modules/.analog/tsrx-types`, mirroring your sources
(`src/app/counter.tsrx` → `src/app/counter.d.tsrx.ts`), so nothing is
generated next to your sources or committed.

Point TypeScript at them in the tsconfig that type-checks your app:

```json
{
  "compilerOptions": {
    "allowArbitraryExtensions": true,
    "rootDirs": [".", "node_modules/.analog/tsrx-types"]
  }
}
```

`vite build` writes them, and the dev server writes them at startup and keeps
them up to date as you edit. In CI, build before type-checking.

Options: `tsrxAngular({ types: { tsconfig, outDir } })` changes where they're read
from and written to, and `tsrxAngular({ types: false })` turns them off.

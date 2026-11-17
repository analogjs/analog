# @analogjs/vite-plugin-tsrx

Experimental: compile [TSRX](https://tsrx.dev) modules as Angular components
with Analog's fast compile path. Not published; build it from this repository.

```ts
// vite.config.ts
import angular from '@analogjs/vite-plugin-angular';
import { tsrx } from '@analogjs/vite-plugin-tsrx';

export default defineConfig({
  plugins: [tsrx(), angular({ fastCompile: true })],
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
- `.page.tsrx` files work as `@analogjs/router` pages.

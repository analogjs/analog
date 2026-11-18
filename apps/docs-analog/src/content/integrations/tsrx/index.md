# TSRX Components

[TSRX](https://tsrx.dev) (TypeScript Render Extensions) lets you write a component as a function. Its body holds the setup code and ends in markup. `@analogjs/tsrx-angular` compiles each `.tsrx` component to an ordinary Angular `@Component` class, so signals, dependency injection, control flow, `@defer`, hydration and SSR behave as they do in `.ts` components. The two kinds of component can import each other.

```tsx
import { Component, input, signal } from '@angular/core';

export const CounterMeta = { selector: 'app-counter' } satisfies Component;

export function Counter() @{
  const step = input(1);
  const count = signal(0);

  <button onClick={() => count.update((c) => c + step())}>{count()}</button>
}
```

:::caution
TSRX support is experimental. `@analogjs/tsrx-angular` isn't published to npm yet, and it only works with [fast compile](/docs/guides/angular-compilation) or [NGP compilation](/docs/guides/angular-compilation#ngp-compilation-experimental).
:::

## Step 1: Add the plugin

Add `tsrxAngular()` before `angular()`, and turn on fast compile:

```ts
// vite.config.ts
import analog from '@analogjs/platform';
import angular from '@analogjs/vite-plugin-angular';
import { tsrxAngular } from '@analogjs/tsrx-angular';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [analog(), tsrxAngular(), angular({ fastCompile: true })],
});
```

The plugin throws at startup if `angular()` isn't running with `fastCompile: true` or `compilation: 'ngp'`.

### With NGP compilation

TSRX components also compile with [NGP](/docs/guides/angular-compilation#ngp-compilation-experimental), which type-checks their setup code and template expressions, along with the inputs that `.ts` templates bind on them:

```ts
export default defineConfig({
  plugins: [analog(), tsrxAngular(), angular({ compilation: 'ngp' })],
});
```

Type errors point at the `.tsrx` file:

```
src/app/components/price.tsrx:9:22 - error TS2339: Property 'toFixd' does not exist on type 'number'.
```

NGP compiles the `.tsrx` modules under the directory of your app's tsconfig, and the tsconfig's `include` must cover their names with `.ts` added, as `src/**/*.ts` covers `src/app/components/price.tsrx.ts`. NGP reads them through its default WebAssembly analyzer, so TSRX can't be compiled with a native analyzer build (`ANALOG_NGP_NATIVE_BINDING`).

## Step 2: Configure TypeScript

TypeScript can't read `.tsrx` files. To let `tsc` and your editor type-check imports of them, the plugin writes a declaration file for each `.tsrx` module to `node_modules/.analog/tsrx-types`. The folder mirrors your sources, so nothing is generated next to them or committed:

```
src/app/components/price.tsrx  →  node_modules/.analog/tsrx-types/src/app/components/price.d.tsrx.ts
```

Point TypeScript at that folder in the tsconfig that type-checks your app:

```json
{
  "compilerOptions": {
    "allowArbitraryExtensions": true,
    "rootDirs": [".", "node_modules/.analog/tsrx-types"]
  }
}
```

The types are inferred from the compiled component, so `input(1)` is an `InputSignal<number>`. `vite build` writes the declarations, and the dev server writes them at startup and keeps them up to date while you edit. In CI, build before type-checking.

To change where they're read from and written to, use `tsrxAngular({ types: { tsconfig, outDir } })`. To turn them off, use `tsrxAngular({ types: false })`.

## Writing components

A component is a function whose body ends in markup. The setup code runs once per instance, and template expressions can use its locals, helper functions and imports directly:

```tsx
// src/app/components/price.tsrx
import { computed, input } from '@angular/core';

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

export function Price() @{
  const amount = input.required<number>();
  const formatted = computed(() => currency.format(amount()));

  <span class="price">{formatted()}</span>
}
```

Components are `OnPush`. Declare inputs, outputs, models and queries at the top of the body with `input()`, `output()`, `model()`, `viewChild()`, `viewChildren()`, `contentChild()` and `contentChildren()`. They become class fields, so their initial values can't read names that the body declares. Move such values to module scope.

Use other components by importing them and writing them as tags. Bind inputs with `name={value}`, outputs with `onName={handler}`, and models with `bind:name={signal}`:

```tsx
import { signal } from '@angular/core';

import { Counter } from './counter.tsrx';
import { Price } from './price.tsrx';
import { Stepper } from './stepper.tsrx';

export function Shop() @{
  const step = signal(2);
  const last = signal<number | null>(null);

  <section>
    <Price amount={18} />
    <Stepper bind:step={step} />
    <Counter step={step()} onChanged={(value: number) => last.set(value)} />
  </section>
}
```

`.ts` components and directives are imported the same way. Directives that don't match by element name, such as `RouterLink`, are applied with `use`:

```tsx
<a use={[RouterLink]} routerLink="/products">
  {'All products'}
</a>
```

### Template syntax

| TSRX                                   | Angular                                 |
| -------------------------------------- | --------------------------------------- |
| `{expr}`                               | `{{ expr }}`                            |
| `attr={expr}`                          | `[attr]="expr"`                         |
| `onClick={fn}` on elements             | `(click)="fn($event)"`                  |
| `onValueChange={fn}` on components     | `(valueChange)="fn($event)"`            |
| `on:name={fn}`                         | `(name)="fn($event)"`, name as written  |
| `bind:prop={signal}`                   | `[(prop)]="signal"`                     |
| `attr:x=`, `class:x=`, `style:x=`      | `[attr.x]`, `[class.x]`, `[style.x]`    |
| `ref="name"`                           | `#name`                                 |
| `use={[RouterLink]}`                   | adds the directives to `imports`        |
| `<style>` (with `:global(x)`)          | component `styles` (with `::ng-deep x`) |
| `@if` / `@else if` / `@else`           | the same                                |
| `@for (const x of xs; key x.id)`       | `@for (x of xs; track x.id)`            |
| `@switch` / `@case` / `@default`       | the same                                |
| `@try` / `@catch (err, reset)`         | `@boundary` / `@error`                  |
| `@defer`, `@boundary` and their blocks | written in Angular's own syntax         |

A `<style>` element inside the markup becomes the component's scoped styles:

```tsx
<div class="card">
  <p>{'Styled'}</p>
  <style>
    .card { border: 1px solid #ccc; border-radius: 8px; }
  </style>
</div>
```

### Control flow

Lists use `@for`, not `.map()`. Each `@if`, `@for` and `@defer` block renders one node, so wrap several in a fragment, `<>…</>`:

```tsx
<ul>
  @for (const product of products(); key product.id) {
    <li>{product.name}</li>
  } @empty {
    <li>{'No products yet.'}</li>
  }
</ul>

@if (product()) {
  <>
    <h2>{product()!.name}</h2>
    <Price amount={product()!.price} />
  </>
} @else {
  <p>{'Product not found.'}</p>
}
```

`@defer` and `@boundary` are written in Angular's syntax, including triggers, `hydrate` triggers for incremental hydration, and `when` conditions:

```tsx
<button ref="loadDetails">{'Load details'}</button>
@defer (on interaction(loadDetails)) {
  <LazyDetails />
} @placeholder {
  <p>{'Details load when you click the button.'}</p>
}

@defer (hydrate on interaction) {
  <LikeButton />
}

@boundary {
  <Widget />
} @error (let err = $error, reset = $reset) {
  <button onClick={() => reset()}>{'Retry'}</button>
}
```

### Content projection

Components take no parameters, so there is no `children` prop. Project content with Angular's `<ng-content>`, including `select`, fallback content and `ngProjectAs`:

```tsx
import { contentChild, ElementRef } from '@angular/core';

export function Card() @{
  const title = contentChild<ElementRef>('title');

  <article>
    <header><ng-content select="[card-title]" /></header>
    <ng-content />
    <footer><ng-content select="[card-footer]">{'No footer given.'}</ng-content></footer>
  </article>
}
```

```tsx
<Card>
  <h2 card-title ref="title">
    {'Title'}
  </h2>
  <p>
    {'Clicked '}
    {clicks()}
    {' times.'}
  </p>
</Card>
```

Projected children bind to the parent's state, and `contentChild()` sees refs set in the parent.

## Component metadata and selectors

`export const XMeta = { … }` holds the `@Component` metadata for component `X` in the same file, such as `selector`, `providers`, `host` and `encapsulation`. It must be a static object literal:

```tsx
import { Component, signal } from '@angular/core';

import { CounterHistory } from './counter-history';

export const CounterMeta = {
  selector: 'demo-counter',
  providers: [CounterHistory],
  host: { '[attr.data-count]': 'count()' },
} satisfies Component;

export function Counter() @{
  const count = signal(0);
  // ...
}
```

The plugin derives `template`, `imports`, `styles` and `changeDetection`, so setting them in `XMeta` is an error.

Without an `XMeta` selector, a component's selector is its name: `<Price />` renders a `<Price>` element. Components named after native elements, such as `Button`, `A` or `Input`, need an `XMeta` selector.

## Pages and routing

`.page.tsrx` files are route files everywhere `.page.ts` files are: file-based routing, layouts, `additionalPagesDirs`, and typed routes. The default export is the page component, and `routeMeta` works as usual:

```tsx
// src/app/pages/products/index.page.tsrx
import { injectLoadData, type RouteMeta } from '@analogjs/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

import { Price } from '../../components/price.tsrx';
import type { load } from './index.server';

export const routeMeta: RouteMeta = { title: 'Products' };

export default function ProductListPage() @{
  const data = toSignal(injectLoadData<typeof load>(), { requireSync: true });

  <ul>
    @for (const product of data().products; key product.id) {
      <li>
        <a use={[RouterLink]} routerLink={`/products/${product.id}`}>{product.name}</a>
        <Price amount={product.price} />
      </li>
    }
  </ul>
}
```

[Server-side data fetching](/docs/features/data-fetching/server-side-data-fetching) and [form actions](/docs/guides/forms) work with a `.server.ts` file beside the page, as they do for `.page.ts` pages. Apply `FormAction` from `@analogjs/router` with `use`, and listen to its outputs with `on:`:

```tsx
<form
  method="post"
  use={[FormAction]}
  on:onSuccess={onSuccess}
  on:onError={onError}
>
  <input name="email" type="email" />
  <button type="submit">{'Send'}</button>
</form>
```

## Limitations

- TSRX only works with fast compile or NGP compilation.
- Components can't take parameters or be `async`. Declare inputs with `input()` and `model()`.
- Lists use `@for`, not `.map()`.
- Each `@if`, `@for` and `@defer` block renders one node. Wrap several in a fragment.
- Template expressions aren't type-checked by `tsc` yet; only imports of `.tsrx` modules are. NGP compilation type-checks them while it compiles.
- Editors report `.tsrx` imports as missing until a build or the dev server has written the declarations once.
- Typed routes don't pick up `routeMeta` from `.page.tsrx` files. Runtime routing isn't affected.

## Example app

The [`tsrx-app`](https://github.com/analogjs/analog/tree/beta/apps/tsrx-app) in the Analog repository is written entirely in TSRX. It covers server loads, an API route, form actions, markdown content, `@boundary`, deferred views, incremental hydration and content projection. It compiles with NGP; set `ANALOG_FAST_COMPILE=true` to build or serve it with fast compile instead.

# Server Functions

Server functions are typed, validated operations that run on the server and are called from anywhere in your app — a component, an effect, a route resolver — with full type inference on both ends. They are defined in a `.server.ts` file, so their code and dependencies never reach the browser bundle.

Where `load` fetches data for one page and `action` handles one form post, a server function is an arbitrary operation you can call by name.

:::info
Server functions require Angular v19 or higher, as the client half is built on `resource()`.
:::

## Defining a Server Function

Server functions are defined with `serverFn` from `@analogjs/router/server` in any `.server.ts` file under `src`. They can live alongside an existing `load` or `action`.

```ts
// src/app/server-fns/products.server.ts
import { serverFn } from '@analogjs/router/server';
import { inject } from '@angular/core';
import * as v from 'valibot';

import { CatalogService } from './catalog.service';

// A handler alone is an input-less read, served over GET.
export const getProducts = serverFn(async () => {
  return inject(CatalogService).list();
});

// A validation schema in front of the handler declares validated input, served over POST.
export const getProduct = serverFn(
  v.object({ id: v.string() }),
  async (input) => {
    return inject(CatalogService).find(input.id);
  },
);
```

Pass a config object as the first argument when you need to override a default:

```ts
export const search = serverFn(
  { method: 'POST', input: v.object({ term: v.string() }) },
  async (input) => inject(CatalogService).search(input.term),
);
```

The `input` schema is any [Standard Schema](https://standardschema.dev) validator — valibot, zod, and arktype all conform. It runs on the server before the handler, and invalid input is rejected without the handler ever running.

Input travels in the request body, so any server function that takes input uses `POST`. `GET` is reserved for input-less reads, where it buys HTTP and CDN cacheability.

## Calling a Server Function

Import the same exported function in a component and read it with `injectServerFn`, which returns an Angular [`resource`](https://angular.dev/guide/signals/resource):

```ts
// src/app/pages/products.page.ts
import { Component, input } from '@angular/core';
import { injectServerFn } from '@analogjs/router';

import { getProduct } from '../server-fns/products.server';

@Component({
  selector: 'app-product-card',
  template: `
    @if (product.value(); as p) {
      <h2>{{ p.name }}</h2>
    } @else if (product.error()) {
      <p>Could not load this product.</p>
    } @else {
      <p>Loading…</p>
    }
  `,
})
export default class ProductCard {
  id = input.required<string>();

  protected product = injectServerFn(getProduct, () => ({ id: this.id() }));
}
```

The args factory is reactive: the resource refetches whenever a signal it reads changes. Return `undefined` from it to leave the resource idle, which is how you express a read that is waiting on an input that isn't available yet.

For writes, use `injectServerFnMutation`, which returns a callable bound to the current injector:

```ts
import { injectServerFnMutation } from '@analogjs/router';

export default class Checkout {
  private placeOrder = injectServerFnMutation(placeOrderFn);

  async submit(sku: string, qty: number) {
    const { orderId } = await this.placeOrder({ sku, qty });
  }
}
```

Both helpers must be called in an injection context, and both dispatch through `HttpClient`, so client `HttpInterceptorFn`s apply and `HttpTestingController` works in tests.

### Hydration

A read resolved while rendering on the server is transferred to the client and used as the resource's first value, so the browser does not refetch it on hydration. This works for `GET` and `POST` reads alike and needs no transfer cache configuration.

During server-side rendering, calls skip HTTP entirely and run in-process in the same request injector as the render.

## Using Dependency Injection

A server function handler runs inside the request injector Analog builds for server-side rendering, so `inject()` works at the top of the handler body — for your own services and for Analog's request tokens.

```ts
import { serverFn } from '@analogjs/router/server';
import { REQUEST } from '@analogjs/router/tokens';
import { inject } from '@angular/core';

export const getGreeting = serverFn(async () => {
  const req = inject(REQUEST);
  return `Hello from ${req.headers['user-agent']}`;
});
```

`REQUEST`, `RESPONSE`, and `BASE_URL` are always available. `LOCALE` is provided only when a locale can be detected from the URL prefix or the `Accept-Language` header, so read it with `inject(LOCALE, { optional: true })`. The raw h3 event is deliberately not exposed, which keeps handlers testable by overriding those tokens.

Services and interceptors used by handlers are provided from `src/app/server-fns/index.ts` (or `src/app/server-fns.ts`), which exports a `serverFnAppProviders` array:

```ts
// src/app/server-fns/index.ts
import type { StaticProvider } from '@angular/core';

export const serverFnAppProviders: StaticProvider[] = [
  // Only providers that are not otherwise discoverable go here — e.g. a token
  // bound to a value, or a class you want to override.
];
```

A `providedIn: 'root'` service does not need to be listed. The dispatch endpoint runs handlers against a bootstrapped application injector, so a root-provided service resolves the same way it would inside a component — whether the function is called during server-side rendering or over HTTP from the browser. Use `serverFnAppProviders` for providers that are not `providedIn: 'root'`: a token bound to a value, or an override.

## Adding Interceptors

Interceptors are functional, provided through DI, and apply to every server function in registration order — the same model as `HttpInterceptorFn`. Use them for authentication, tenancy, and logging.

```ts
// src/app/server-fns/auth.interceptor.ts
import type { ServerFnInterceptorFn } from '@analogjs/router/server';
import { fail } from '@analogjs/router/server/actions';
import { inject } from '@angular/core';

export const authInterceptor: ServerFnInterceptorFn = (ctx, next) => {
  const session = inject(SessionService);

  if (!session.user()) {
    return fail(401, { message: 'unauthenticated' });
  }

  return next(ctx.with({ user: session.user() }));
};
```

Register them with `provideServerFns`:

```ts
// src/app/server-fns/index.ts
import {
  provideServerFns,
  withServerFnInterceptors,
} from '@analogjs/router/server';

export const serverFnAppProviders: StaticProvider[] = [
  ...(provideServerFns(
    withServerFnInterceptors([authInterceptor]),
  ) as StaticProvider[]),
];
```

`ctx.with({ ... })` accumulates a context object down the chain and delivers it to the handler as its second argument. Extend the `ServerFnContext` interface by declaration merging to type what your interceptors add.

## Handling Errors

Return `fail(status, errors)` from a handler or an interceptor to stop the call and respond with an error, and `redirect(url)` to redirect. Both come from `@analogjs/router/server/actions` and are the same helpers used by form actions.

```ts
export const placeOrder = serverFn(orderSchema, async (input) => {
  const result = await inject(OrderService).place(input);

  if (!result.ok) {
    return fail(409, { reason: result.reason });
  }

  return { orderId: result.id };
});
```

On the client, failures surface as an `HttpErrorResponse` on `resource.error()`, or as a rejected promise from a mutation.

## Security

Server functions are HTTP endpoints, and validation checks the shape of the input, not the caller's authority. Authorization belongs in an interceptor or in the handler itself.

Two protections are built in:

- **Route ids are derived at build time** from the file and export name, not chosen by you. Each function is served from an opaque `/_analog/fn/<hash>` route, so two functions sharing a name cannot collide, and the endpoint surface cannot be enumerated by guessing export names. Treat the id as an opaque address rather than a secret — it is reproducible from the source and present in the client bundle, so it is not an authorization boundary.
- **Calls are same-origin by default.** Because server functions are often cookie-authenticated, cross-origin browser calls are rejected with a `403` before the function is even looked up, and input-bearing calls must send a JSON body.

If an app genuinely needs to be called from another origin, opt in explicitly:

```ts
import { provideServerFns, withAllowedOrigins } from '@analogjs/router/server';

export const serverFnAppProviders: StaticProvider[] = [
  ...(provideServerFns(
    withAllowedOrigins(['https://admin.example.com']),
  ) as StaticProvider[]),
];
```

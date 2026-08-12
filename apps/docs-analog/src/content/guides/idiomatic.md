---
title: Idiomatic Analog
---

# Idiomatic Analog

Analog works best when route files clearly express whether they are pages, layouts, or redirects. The easiest way to stay in the happy path is to make each `src/app/pages/**/*.page.ts` file do one job well.

## Prefer the canonical route shape

- Default-export the page component from each `.page.ts` file.
- Keep route metadata in `export const routeMeta = { ... }` or `defineRouteMeta({ ... })`.
- Treat `routeMeta.redirectTo` pages as redirect-only modules.
- Keep JSON-LD in `routeMeta.jsonLd` instead of exporting legacy top-level `routeJsonLd` values.
- When a page file is acting as a layout shell, import `RouterOutlet` and render a `<router-outlet>`.

```ts
import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

export const routeMeta = {
  title: 'Products',
};

@Component({
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
export default class ProductsPage {}
```

## Redirects should be explicit

Redirect route files are clearer when they only export `routeMeta`.

```ts
export const routeMeta = {
  redirectTo: '/home',
  pathMatch: 'full',
};
```

Avoid exporting a default component from the same file. Analog ignores that component when `redirectTo` is present, which makes the module misleading during maintenance.

Use absolute redirect targets. This is especially important for nested redirects such as `src/app/pages/cities/index.page.ts`.

## Layouts should look like layouts

If a file has child routes beneath a matching folder, treat it as a parent shell.

```treeview
src/
└── app/
    └── pages/
        ├── products.page.ts
        └── products/
            ├── (list).page.ts
            └── [id].page.ts
```

In this shape, `products.page.ts` should usually render a router outlet. If it does not, child routes exist structurally but have nowhere idiomatic to mount.

## Selectors should be explicit outside route files

Non-page Angular components should declare an explicit, unique selector.

```ts
@Component({
  selector: 'app-product-card',
  template: `<article>...</article>`,
})
export class ProductCardComponent {}
```

Selectorless components render as `ng-component`, which makes SSR output, diagnostics, and collision debugging harder to interpret. Analog therefore treats selectorless non-page components as invalid during Vite builds, and the workspace lint rules enforce the same standard.

Page and layout route files are the exception. Components in `src/app/pages/**` or `*.page.ts` files may omit `selector` when they are only used as route entry points.

## New dev-time route diagnostics

Analog now parses page route modules with `oxc-parser` during development and emits focused warnings when a route file drifts away from the documented shape.

Current diagnostics:

- `oxc-parse`: the route module cannot be parsed cleanly.
- `missing-default-export`: a `.page.ts` file is neither a redirect route nor a default-exported page component.
- `redirect-with-component`: a redirect route also exports a component.
- `relative-redirect`: `routeMeta.redirectTo` is relative instead of absolute.
- `legacy-route-jsonld-export`: the module exports top-level `routeJsonLd` instead of using `routeMeta.jsonLd`.
- `layout-without-router-outlet`: a likely layout shell does not reference `RouterOutlet` or `<router-outlet>`.

These checks are intentionally narrow. They are meant to reinforce Analog semantics during `serve`, not turn the framework into a style-policing linter.

## Why Oxc

The diagnostics use `oxc-parser` because it is fast enough to run during dev-time route discovery and precise enough to detect route-export patterns without booting a full TypeScript program. That keeps feedback fast while still being structural instead of regex-only.

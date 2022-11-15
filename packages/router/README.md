# @analogjs/router

A filesystem-based router for Angular that allows you to configure routing using Angular component files.

## Preqrequisites

This package:

- Only supports using standalone Angular components as routes.
- Requires usage inside of an **Analog** project, and is not compatible with Webpack-based setups.

## Install

The Analog Router is included when generating a new Analog project. To install the router manually, use your package manager of choice:

```sh
npm install @analogjs/router
```

or

```sh
yarn add @analogjs/router
```

## Setup

Import the `provideFileRouter` function from the `@analogjs/router` package and add it to the `providers` array of the `bootstrapApplication` function in an Angular application bootstrapping a standalone component.

```ts
import { bootstrapApplication } from '@angular/platform-browser';
import { provideFileRouter } from '@analogjs/router';

import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, {
  providers: [provideFileRouter()],
});
```

This registers the Angular Router, along with the routes generated from the file structure.

Next, update the `tsconfig.app.json` to include the dynamically generated routes.

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "../../dist/out-tsc",
    "types": []
  },
  "files": ["src/main.ts", "src/polyfills.ts"],
  "include": ["src/**/*.d.ts", "src/app/routes/**/*.ts"],
  "exclude": ["**/*.test.ts", "**/*.spec.ts"]
}
```

Last, add the router outlet to the root component.

```ts
import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: ` <router-outlet></router-outlet> `,
})
export class AppComponent {}
```

## Defining Routes

Routes are defined using folders and files in the `src/app/routes` folder.

> Route components **must** be defined as the default export.

There are 4 primary types of routes:

- [Static Routes](#static-routes)
- [Dynamic Routes](#dynamic-routes)
- [Nested Routes](#nested-routes)
- [Catch-all Routes](#catch-all-routes)

These routes can be combined in different ways to build to URLs for navigation.

### Static Routes

Static routes are defined by using the filename as the route path.

The example route below in `src/app/routes/about.ts` defines an `/about` route.

```ts
import { Component } from '@angular/core';

@Component({
  selector: 'app-about',
  standalone: true,
  template: `
    <h2>Hello Analog</h2>

    Analog is a meta-framework on top of Angular.
  `,
})
export default class AboutPageComponent {}
```

### Dynamic Routes

Dynamic routes are defined by using the filename as the route path enclosed in square brackets. Dynamic routes must be placed inside a parent folder, or prefixed with a parent path and a period.

The parameter for the route is extracted from the route path.

The example route below in `src/app/routes/products.[productId].ts` defines a `/products/:productId` route.

```ts
import { Component } from '@angular/core';
import { AsyncPipe, JsonPipe } from '@angular/common';
import { injectActivatedRoute } from '@analogjs/router';
import { map } from 'rxjs';

@Component({
  selector: 'app-product-details',
  standalone: true,
  imports: [AsyncPipe, JsonPipe],
  template: `
    <h2>Product Details</h2>

    ID: {{ productId$ | async }}
  `,
})
export default class ProductDetailsPageComponent {
  private readonly route = injectActivatedRoute();

  readonly productId$ = this.route.paramMap.pipe(
    map((params) => params.get('productId'))
  );
}
```

### Nested Routes

Nested routes are defined by using a parent file and child folder with routes.

The following structure below represents a nested route.

```treeview
src/
└── app/
    └── routes/
        │   └── products/
        │      ├──[productId].ts
        │      └──index.ts
        └── products.ts
```

This defines two routes with a shared layout:

- `/products`
- `/products/:productId`

The parent `src/app/routes/products.ts` file contains the parent page with a router outlet.

```ts
import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-products',
  standalone: true,
  imports: [RouterOutlet],
  template: `
    <h2>Products</h2>

    <router-outlet></router-outlet>
  `,
})
export default class ProductsComponent {}
```

The nested `src/app/routes/products/index.ts` file contains the `/products` list page.

```ts
import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-products-list',
  standalone: true,
  imports: [RouterOutlet],
  template: ` <h2>Products List</h2> `,
})
export default class ProductsListComponent {}
```

The nested `src/app/routes/products/[productId].ts` file contains the `/products/:productId` details page.

```ts
import { Component } from '@angular/core';
import { AsyncPipe, JsonPipe } from '@angular/common';
import { injectActivatedRoute } from '@analogjs/router';
import { map } from 'rxjs';

@Component({
  selector: 'app-product-details',
  standalone: true,
  imports: [AsyncPipe, JsonPipe],
  template: `
    <h2>Product Details</h2>

    ID: {{ productId$ | async }}
  `,
})
export default class ProductDetailsPageComponent {
  private readonly route = injectActivatedRoute();

  readonly productId$ = this.route.paramMap.pipe(
    map((params) => params.get('productId'))
  );
}
```

### Catch-all routes

Catch-all routes are defined by using the filename as the route path prefixed with 3 periods enclosed in square brackets.

The example route below in `src/app/routes/[...page-not-found].ts` defines a wildcard `**` route. This route is usually for 404 pages.

```ts
import { Component } from '@angular/core';
import { RouterLinkWithHref } from '@angular/router';

@Component({
  selector: 'app-page-not-found',
  standalone: true,
  imports: [RouterLinkWithHref],
  template: `
    <h2>Page Not Found</h2>

    <a routerLink="/">Go Back Home</a>
  `,
})
export default class PageNotFoundComponent {}
```

## Route Metadata

Additional metadata to add to the generated route config for each route can be done using the `defineRouteMeta` function. This is where you can define the page title, any necessary guards, resolvers, providers, and more.

```ts
import { Component } from '@angular/core';
import { defineRouteMeta } from '@analogjs/router';

import { AboutService } from './about.service';

export const routeMeta = defineRouteMeta({
  title: 'About Analog',
  canActivate: [() => true],
  providers: [AboutService],
});

@Component({
  selector: 'app-about',
  standalone: true,
  template: `
    <h2>Hello Analog</h2>

    Analog is a meta-framework on top of Angular.
  `,
})
export default class AboutPageComponent {
  private readonly service = inject(AboutService);
}
```

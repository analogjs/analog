# Routing

Analog supports filesystem-based routing on top of the Angular Router.

## Defining Routes

Routes are defined using folders and files in the `src/app/pages` folder. Only files ending with `.page.ts` are collected and used to build the set of routes.

> Route components **must** be defined as the default export and all route components are **lazy-loaded**.

There are 5 primary types of routes:

- [Index Routes](#index-routes)
- [Static Routes](#static-routes)
- [Dynamic Routes](#dynamic-routes)
- [Nested Routes](#nested-routes)
- [Catch-all Routes](#catch-all-routes)

These routes can be combined in different ways to build to URLs for navigation.

## Index Routes

Index routes are defined by using the filename as the route path enclosed in parenthesis.

The example route below in `src/app/pages/(home).page.ts` defines an `/` route.

```ts
import { Component } from '@angular/core';

@Component({
  selector: 'app-home',
  standalone: true,
  template: ` <h2>Welcome</h2> `,
})
export default class HomePageComponent {}
```

> Index routes can also be defined by using _index.page.ts_ as the route filename.

## Static Routes

Static routes are defined by using the filename as the route path.

The example route below in `src/app/pages/about.page.ts` defines an `/about` route.

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

## Dynamic Routes

Dynamic routes are defined by using the filename as the route path enclosed in square brackets.

The parameter for the route is extracted from the route path.

The example route below in `src/app/pages/products/[productId].page.ts` defines a `/products/:productId` route.

```ts
import { Component, inject } from '@angular/core';
import { AsyncPipe, JsonPipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';

@Component({
  selector: 'app-product-details',
  standalone: true,
  imports: [AsyncPipe],
  template: `
    <h2>Product Details</h2>

    ID: {{ productId$ | async }}
  `,
})
export default class ProductDetailsPageComponent {
  private readonly route = inject(ActivatedRoute);

  readonly productId$ = this.route.paramMap.pipe(
    map((params) => params.get('productId'))
  );
}
```

### Using Route Component Input Bindings

If you are using the `withComponentInputBinding()` feature with the Angular Router, you can use the **Input** decorator, along with the same **parameter name** to get the route parameter.

First, add the `withComponentInputBinding()` to the arguments for the `provideFileRouter()` function.

```ts
// src/app/app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideFileRouter } from '@analogjs/router';

export const appConfig: ApplicationConfig = {
  providers: [
    provideFileRouter(withComponentInputBinding()),
    // other providers
  ],
};
```

Next, use the route parameter as an input.

```ts
// src/app/pages/products/[productId].page.ts
import { Component, inject } from '@angular/core';
import { AsyncPipe, JsonPipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';

@Component({
  selector: 'app-product-details',
  standalone: true,
  template: `
    <h2>Product Details</h2>

    ID: {{ productId }}
  `,
})
export default class ProductDetailsPageComponent {
  @Input() productId: string;
}
```

## Nested Routes

Nested routes are defined by using a parent file and child folder with routes.

The following structure below represents a nested route.

```treeview
src/
└── app/
    └── pages/
        │   └── products/
        │      ├──[productId].page.ts
        │      └──(products-list).page.ts
        └── products.page.ts
```

This defines two routes with a shared layout:

- `/products`
- `/products/:productId`

The parent `src/app/pages/products.page.ts` file contains the parent page with a router outlet.

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

The nested `src/app/pages/products/(products-list).page.ts` file contains the `/products` list page.

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

The nested `src/app/pages/products/[productId].page.ts` file contains the `/products/:productId` details page.

```ts
import { Component, inject } from '@angular/core';
import { AsyncPipe, JsonPipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
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
  private readonly route = inject(ActivatedRoute);

  readonly productId$ = this.route.paramMap.pipe(
    map((params) => params.get('productId'))
  );
}
```

## Catch-all routes

Catch-all routes are defined by using the filename as the route path prefixed with 3 periods enclosed in square brackets.

The example route below in `src/app/pages/[...page-not-found].page.ts` defines a wildcard `**` route. This route is usually for 404 pages.

```ts
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-page-not-found',
  standalone: true,
  imports: [RouterLink],
  template: `
    <h2>Page Not Found</h2>

    <a routerLink="/">Go Back Home</a>
  `,
})
export default class PageNotFoundComponent {}
```

Catch-all routes can also be defined as nested child routes.

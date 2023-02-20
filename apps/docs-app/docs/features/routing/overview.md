# Routing

Analog supports filesystem-based routing on top of the Angular Router.

## Defining Routes

Routes are defined using folders and files in the `src/app/routes` folder.

> Route components **must** be defined as the default export.

There are 5 primary types of routes:

- [Index Routes](#index-routes)
- [Static Routes](#static-routes)
- [Dynamic Routes](#dynamic-routes)
- [Nested Routes](#nested-routes)
- [Catch-all Routes](#catch-all-routes)

These routes can be combined in different ways to build to URLs for navigation.

### Index Routes

Index routes are defined by using the filename as the route path enclosed in parenthesis.

The example route below in `src/app/routes/(home).ts` defines an `/` route.

```ts
import { Component } from '@angular/core';

@Component({
  selector: 'app-home',
  standalone: true,
  template: ` <h2>Welcome</h2> `,
})
export default class HomePageComponent {}
```

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
        │      └──(products-list).ts
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

The nested `src/app/routes/products/(products-list).ts` file contains the `/products` list page.

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

## Route Metadata

Additional metadata to add to the generated route config for each route can be done using the `RouteMeta` type. This is where you can define the page title, any necessary guards, resolvers, providers, and more.

```ts
import { Component } from '@angular/core';
import { RouteMeta } from '@analogjs/router';

import { AboutService } from './about.service';

export const routeMeta: RouteMeta = {
  title: 'About Analog',
  canActivate: [() => true],
  providers: [AboutService],
};

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

### Redirect to a default route

To redirect to the route `/home` from `/`, define `redirectTo` and `pathMatch` inside `src/app/routes/index.ts`:

```ts
import { RouteMeta } from '@analogjs/router';

export const routeMeta: RouteMeta = {
  redirectTo: '/home',
  pathMatch: 'full',
};
```

### Route Meta Tags

The `RouteMeta` type has a property `meta` which can be used to define a list of meta tags for each route:

```ts
import { Component } from '@angular/core';
import { RouteMeta } from '@analogjs/router';

import { AboutService } from './about.service';

export const routeMeta: RouteMeta = {
  title: 'Refresh every 30 sec',
  meta: [
    {
      httpEquiv: 'refresh',
      content: '30',
    },
  ],
};

@Component({
  selector: 'app-refresh',
  standalone: true,
  template: `
    <h2>Hello Analog</h2>

    Analog is a meta-framework on top of Angular.
  `,
})
export default class RefreshComponent {}
```

The above example sets meta tag `<meta http-equiv="refresh" content="30">`, which forces the browser to refresh the page every 30 seconds.
To read more about possible standard meta tags, please visit official [docs](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/meta).

### Open Graph meta tags

The above property `meta` can also be used to define Open Graph meta tags for SEO and social apps optimizations:

```ts
export const routeMeta: RouteMeta = {
  meta: [
    {
      name: 'description',
      content: 'Description of the page',
    },
    {
      name: 'author',
      content: 'Analog Team',
    },
    {
      property: 'og:title',
      content: 'Title of the page',
    },
    {
      property: 'og:description',
      content: 'Some catchy description',
    },
    {
      property: 'og:image',
      content: 'https://somepage.com/someimage.png',
    },
  ],
};
```

This example will allow social apps like Facebook or Twitter to display titles, descriptions, and images optimally.

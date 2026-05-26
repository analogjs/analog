# Routing

Analog supports filesystem-based routing on top of the Angular Router.

## Defining Routes

Routes are defined using folders and files in the `src/app/pages` folder. Only files ending with `.page.ts` are collected and used to build the set of routes.

:::info

Route components **must** be defined as the default export and all route components are **lazy-loaded**.

:::

There are 5 primary types of routes:

- [Routing](#routing)
  - [Defining Routes](#defining-routes)
  - [Index Routes](#index-routes)
  - [Static Routes](#static-routes)
    - [Route Groups](#route-groups)
  - [Dynamic Routes](#dynamic-routes)
    - [Using Route Component Input Bindings](#using-route-component-input-bindings)
  - [Layout Routes](#layout-routes)
    - [Pathless Layout Routes](#pathless-layout-routes)
  - [Catch-all Routes](#catch-all-routes)
  - [Putting It All Together](#putting-it-all-together)

These routes can be combined in different ways to build URLs for navigation.

:::note

In addition to the 5 primary types of routes, Analog also supports [Redirect Routes](/docs/features/routing/metadata#redirect-routes) and [Content Routes](/docs/features/routing/content).

:::

## Index Routes

Index routes are defined by using the filename as the route path enclosed in parenthesis.

The example route below in `src/app/pages/(home).page.ts` defines an `/` route.

```ts
@Component({
  standalone: true,
  template: ` <h2>Welcome</h2> `,
})
export default class HomePageComponent {}
```

:::tip

Index routes can also be defined by using `index.page.ts` as the route filename.

:::

## Static Routes

Static routes are defined by using the filename as the route path.

The example route below in `src/app/pages/about.page.ts` defines an `/about` route.

```ts
@Component({
  standalone: true,
  template: `
    <h2>Hello Analog</h2>

    Analog is a meta-framework on top of Angular.
  `,
})
export default class AboutPageComponent {}
```

It's also possible to define nested static routes in two different ways:

1. By nesting the route files in folders - `src/app/pages/about/team.page.ts` defines an `/about/team` route.
2. By using the dot notation in the filename - `src/app/pages/about.team.page.ts` also defines an `/about/team` route.

### Route Groups

Routes can be grouped together in the same folder without adding a route path segment by wrapping a folder name in parenthesis.

```treeview
src/
└── app/
    └── pages/
        └── (auth)/
            ├── login.page.ts
            └── signup.page.ts
```

The above example defines `/login` and `/signup` routes.

## Dynamic Routes

Dynamic routes are defined by using the filename as the route path enclosed in square brackets. The parameter for the route is extracted from the route path.

The example route below in `src/app/pages/products/[productId].page.ts` defines a `/products/:productId` route.

```ts
@Component({
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
    map((params) => params.get('productId')),
  );
}
```

Dynamic routes can also be defined using the dot notation in the filename - `src/app/pages/products.[productId].page.ts` defines a `/products/:productId` route.

### Using Route Component Input Bindings

If you are using the `withComponentInputBinding()` feature with the Angular Router, you can use the **Input** decorator, along with the same **parameter name** to get the route parameter.

First, add the `withComponentInputBinding()` to the arguments for the `provideFileRouter()` function.

```ts
// src/app/app.config.ts
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
@Component({
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

## Layout Routes

Layout routes are defined by using a parent file and child folder with the same name.

The following structure below represents a layout route.

```treeview
src/
└── app/
    └── pages/
        ├── products/
        │   ├── [productId].page.ts
        │   └── (products-list).page.ts
        └── products.page.ts
```

This defines two routes with a shared layout:

- `/products`
- `/products/:productId`

The parent `src/app/pages/products.page.ts` file contains the parent page with a router outlet.

```ts
@Component({
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
@Component({
  standalone: true,
  template: ` <h2>Products List</h2> `,
})
export default class ProductsListComponent {}
```

The nested `src/app/pages/products/[productId].page.ts` file contains the `/products/:productId` details page.

```ts
@Component({
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
    map((params) => params.get('productId')),
  );
}
```

### Pathless Layout Routes

Layout routes can also be defined without adding a route path segment.

```treeview
src/
└── app/
    └── pages/
        ├── (auth)/
        │   ├── login.page.ts
        │   └── signup.page.ts
        └── (auth).page.ts
```

The above example defines `/login` and `/signup` routes with a shared layout. The parent `src/app/pages/(auth).page.ts` file contains the parent page with a router outlet.

## Catch-all Routes

Catch-all routes are defined by using the filename as the route path prefixed with 3 periods enclosed in square brackets.

The example route below in `src/app/pages/[...page-not-found].page.ts` defines a wildcard `**` route. This route is usually for 404 pages.

```ts
export const routeMeta: RouteMeta = {
  title: 'Page Not Found',
  canActivate: [
    () => {
      const response = injectResponse();
      if (import.meta.env.SSR && response) {
        response.statusCode = 404;
        response.end();
      }
      return true;
    },
  ],
};

@Component({
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

## Putting It All Together

For the following file structure:

```treeview
src/
└── app/
    └── pages/
        ├── (auth)/
        │   ├── login.page.ts
        │   └── signup.page.ts
        ├── (marketing)/
        │   ├── about.md
        │   └── contact.md
        ├── products/
        │   ├── (product-list).page.ts
        │   ├── [productId].edit.page.ts
        │   └── [productId].page.ts
        ├── (auth).page.ts
        ├── (home).page.ts
        ├── [...not-found].md
        └── products.page.ts
```

The filesystem-based router will generate the following routes:

| Path               | Page                                                             |
| ------------------ | ---------------------------------------------------------------- |
| `/`                | `(home).page.ts`                                                 |
| `/about`           | `(marketing)/about.md`                                           |
| `/contact`         | `(marketing)/contact.md`                                         |
| `/login`           | `(auth)/login.page.ts` (layout: `(auth).page.ts`)                |
| `/signup`          | `(auth)/signup.page.ts` (layout: `(auth).page.ts`)               |
| `/products`        | `products/(product-list).page.ts` (layout: `products.page.ts`)   |
| `/products/1`      | `products/[productId].page.ts` (layout: `products.page.ts`)      |
| `/products/1/edit` | `products/[productId].edit.page.ts` (layout: `products.page.ts`) |
| `/unknown-url`     | `[...not-found].md`                                              |

## Providing Extra Routes

Routes can be added manually in addition to the routes discovered through the filesystem. Use the `withExtraRoutes` with an array of routes to be prepended to the discovered routes array. All the routes are merged into a single array.

```ts
const customRoutes: Routes = [
  {
    path: 'custom',
    loadComponent: () =>
      import('./custom-component').then((m) => m.CustomComponent),
  },
];

export const appConfig: ApplicationConfig = {
  providers: [provideFileRouter(withExtraRoutes(customRoutes))],
};
```

## Visualizing and Debugging Routes

When you are building the pages for your application, it can help to visually see the routes based on the filesystem structure. You can use the `withDebugRoutes()` function to provide a debug route that displays the pages and layouts for your application.

Use the `withDebugRoutes` function in the `app.config.ts`:

```ts
export const appConfig: ApplicationConfig = {
  providers: [provideFileRouter(withDebugRoutes())],
};
```

Navigate the `__analog/routes` URL in the browser to see the routes table.

![debug routes page](/img/debug-routes.png)

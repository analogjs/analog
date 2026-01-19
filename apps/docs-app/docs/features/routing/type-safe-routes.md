# Type-Safe Routes

Analog can generate TypeScript types for your file-based routes, enabling compile-time type checking for route paths and parameters.

## Enabling Type-Safe Routes

Enable type generation in your `vite.config.ts`:

```ts
// vite.config.ts
import analog from '@analogjs/platform';

export default defineConfig({
  plugins: [
    analog({
      typedRoutes: true,
    }),
  ],
});
```

:::info

When enabled, Analog generates a `routes.d.ts` file at `src/app/pages/routes.d.ts`. This file should be committed to version control.

:::

## Building Route Paths

Use the `route()` function to build type-safe paths for `routerLink`:

```ts
import { route } from '@analogjs/router';

// Static routes
route('/about'); // Returns: '/about'

// Dynamic routes
route('/products/[productId]', { productId: '123' }); // Returns: '/products/123'
```

### Using with routerLink

```ts
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { route } from '@analogjs/router';

@Component({
  imports: [RouterLink],
  template: `
    <a [routerLink]="aboutRoute">About</a>
    <a [routerLink]="productRoute">{{ product.name }}</a>
  `,
})
export default class NavComponent {
  product = { id: '123', name: 'Widget' };

  aboutRoute = route('/about');
  productRoute = route('/products/[productId]', { productId: this.product.id });
}
```

### Iterating Over Routes

For navigation menus with multiple links, create an array of route objects:

```ts
import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { route } from '@analogjs/router';

@Component({
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav>
      @for (item of navItems; track item.label) {
        <a [routerLink]="item.route" routerLinkActive="active">
          {{ item.label }}
        </a>
      }
    </nav>
  `,
})
export default class NavComponent {
  navItems = [
    { label: 'Home', route: route('/') },
    { label: 'About', route: route('/about') },
    { label: 'Products', route: route('/products') },
  ];
}
```

For routes with parameters, include the params when building the route:

```ts
import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { route } from '@analogjs/router';

@Component({
  imports: [RouterLink],
  template: `
    <ul>
      @for (product of products(); track product.id) {
        <li>
          <a [routerLink]="getProductRoute(product.id)">
            {{ product.name }}
          </a>
        </li>
      }
    </ul>
  `,
})
export default class ProductListComponent {
  products = input<{ id: string; name: string }[]>([]);

  getProductRoute(productId: string) {
    return route('/products/[productId]', { productId });
  }
}
```

## navigate()

The `navigate()` function is a type-safe wrapper around Angular's `Router.navigate()`. It injects the router automatically, validates route paths at compile time, and substitutes parameters into dynamic segments before navigating:

```ts
import { Component } from '@angular/core';
import { navigate } from '@analogjs/router';

@Component({...})
export default class ProductComponent {
  goToProduct(productId: string) {
    navigate('/products/[productId]', { productId });
  }

  goToAbout() {
    navigate('/about');
  }

  goWithExtras() {
    navigate('/products/[productId]', { productId: '123' }, {
      queryParams: { ref: 'home' },
      replaceUrl: true,
    });
  }
}
```

The third argument accepts all standard Angular `NavigationExtras` options like `queryParams`, `fragment`, `replaceUrl`, and `state`.

## navigateByUrl()

The `navigateByUrl()` function is a type-safe wrapper around Angular's `Router.navigateByUrl()`. It builds a complete URL string from the route path and parameters, then navigates to it:

```ts
import { navigateByUrl } from '@analogjs/router';

// Navigate to static route
navigateByUrl('/about');

// Navigate to dynamic route
navigateByUrl('/products/[productId]', { productId: '123' });
```

Use `navigateByUrl()` when you need to navigate using an absolute URL string rather than a commands array. This is useful when working with URLs from external sources or when you need the full URL representation.

:::tip

Both `navigate()` and `navigateByUrl()` must be called in an injection context (component constructor, field initializer, or `inject()` callback).

:::

## Consuming Route Parameters

Use `injectParams<T>()` to consume route parameters as a typed Signal:

```ts
// src/app/pages/products/[productId].page.ts
import { Component } from '@angular/core';
import { injectParams } from '@analogjs/router';

@Component({
  template: `
    <h2>Product Details</h2>
    <p>ID: {{ params().productId }}</p>
  `,
})
export default class ProductDetailsPage {
  params = injectParams<'/products/[productId]'>();
}
```

The generic type parameter matches the route path, and TypeScript infers the correct parameter types.

## Generated Types

When you run `npm run dev` or `npm run build`, Analog generates types at `src/app/pages/routes.d.ts`:

```ts
declare module '@analogjs/router' {
  export type StaticRoutes = '/' | '/about' | '/products';

  export interface DynamicRouteParams {
    '/products/[productId]': { productId: string | number };
  }

  export type TypedRoutes = StaticRoutes | keyof DynamicRouteParams;

  // Function overloads for type safety...
}
```

:::note

The generated file is updated automatically when page files are added or deleted during development.

:::

## Supported Route Types

| File Path                      | Typed Path              | Parameters        |
| ------------------------------ | ----------------------- | ----------------- |
| `(home).page.ts`               | `/`                     | None              |
| `about.page.ts`                | `/about`                | None              |
| `products/[productId].page.ts` | `/products/[productId]` | `{ productId }`   |
| `[...not-found].page.ts`       | `/[...not-found]`       | `{ 'not-found' }` |

## Migrating an Existing Project

Adding type-safe routes to an existing Analog project is straightforward and can be done incrementally. The type-safe functions work alongside existing Angular Router usage, so you can migrate one component at a time without breaking existing functionality.

### Enable the Feature

Enable type generation by adding the `typedRoutes` option to your Analog plugin configuration:

```ts
import analog from '@analogjs/platform';

export default defineConfig({
  plugins: [
    analog({
      typedRoutes: true,
    }),
  ],
});
```

### Generate Types

Start the development server or run a build to trigger the initial type generation. The plugin scans your `src/app/pages` directory and creates TypeScript declarations for all discovered routes:

```shell
npm run dev
```

This creates `src/app/pages/routes.d.ts`. During development, the plugin watches for file changes and regenerates types automatically when pages are added or removed.

### Commit the Generated File

The generated types file should be committed to version control so that type checking works in CI environments and for other developers on your team:

```shell
git add src/app/pages/routes.d.ts
git commit -m "chore: add generated route types"
```

### Update Navigation Code

Replace hardcoded route strings with the type-safe `route()` function. This ensures that route paths are validated at compile time and parameters are correctly substituted:

**Before:**

```ts
// Template
<a routerLink="/products/123">Product</a>

// Component
this.router.navigate(['/products', productId]);
```

**After:**

```ts
// Component
productRoute = route('/products/[productId]', { productId: '123' });

// Template
<a [routerLink]="productRoute">Product</a>

// Programmatic navigation
navigate('/products/[productId]', { productId });
```

### Update Parameter Consumption

Replace `ActivatedRoute` and RxJS-based parameter access with the `injectParams()` function. This provides a typed Signal that automatically updates when route parameters change:

**Before:**

```ts
import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';

@Component({...})
export default class ProductPage {
  private route = inject(ActivatedRoute);
  productId$ = this.route.paramMap.pipe(
    map((params) => params.get('productId'))
  );
}
```

**After:**

```ts
import { Component } from '@angular/core';
import { injectParams } from '@analogjs/router';

@Component({...})
export default class ProductPage {
  params = injectParams<'/products/[productId]'>();
  // Access via: this.params().productId
}
```

:::tip

You can migrate incrementally. The type-safe functions work alongside existing Angular Router usage.

:::

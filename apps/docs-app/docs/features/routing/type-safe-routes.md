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
  standalone: true,
  imports: [RouterLink],
  template: `
    <a [routerLink]="route('/about')">About</a>
    <a [routerLink]="route('/products/[productId]', { productId: product.id })">
      {{ product.name }}
    </a>
  `,
})
export default class NavComponent {
  route = route;
  product = { id: '123', name: 'Widget' };
}
```

## Programmatic Navigation

### navigate()

Use `navigate()` for type-safe programmatic navigation:

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

### navigateByUrl()

Use `navigateByUrl()` for URL-based navigation:

```ts
import { navigateByUrl } from '@analogjs/router';

// Navigate to static route
navigateByUrl('/about');

// Navigate to dynamic route
navigateByUrl('/products/[productId]', { productId: '123' });
```

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
  standalone: true,
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

To add type-safe routes to an existing Analog project:

### 1. Enable the Feature

Update your `vite.config.ts`:

```ts
import analog from '@analogjs/platform';

export default defineConfig({
  plugins: [
    analog({
      typedRoutes: true, // Add this option
    }),
  ],
});
```

### 2. Generate Types

Run the development server or build to generate the types:

```shell
npm run dev
```

This creates `src/app/pages/routes.d.ts`.

### 3. Commit the Generated File

Add the generated types file to version control:

```shell
git add src/app/pages/routes.d.ts
git commit -m "chore: add generated route types"
```

### 4. Update Navigation Code

Replace string-based navigation with type-safe functions:

**Before:**

```ts
// Template
<a routerLink="/products/123">Product</a>

// Component
this.router.navigate(['/products', productId]);
```

**After:**

```ts
// Template
<a [routerLink]="route('/products/[productId]', { productId: '123' })">Product</a>

// Component
navigate('/products/[productId]', { productId });
```

### 5. Update Parameter Consumption

Replace `ActivatedRoute` usage with `injectParams()`:

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

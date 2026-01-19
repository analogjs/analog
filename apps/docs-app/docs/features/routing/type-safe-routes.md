# Type-Safe Routes

Analog automatically generates TypeScript types for your file-based routes, enabling compile-time type checking for route paths and parameters.

:::info

Analog generates a `routes.d.ts` file at `src/app/pages/routes.d.ts`. This file should be committed to version control.

:::

## Disabling Type-Safe Routes

Type-safe routing is enabled by default. To disable it, set `typedRoutes` to `false` in your `vite.config.ts`:

```ts
// vite.config.ts
import analog from '@analogjs/platform';

export default defineConfig({
  plugins: [
    analog({
      typedRoutes: false,
    }),
  ],
});
```

## Building Route Paths

The `route()` function builds type-safe path strings from route definitions. It validates paths at compile time and substitutes parameters into dynamic segments.

### Static Routes

For routes without parameters, pass only the path. The function validates that the path exists in your application:

```ts
import { route } from '@analogjs/router';

route('/'); // Returns: '/'
route('/about'); // Returns: '/about'
```

### Dynamic Routes

For routes with parameters, pass the path and a params object. TypeScript enforces that all required parameters are provided:

```ts
import { route } from '@analogjs/router';

route('/products/[productId]', { productId: '123' }); // Returns: '/products/123'
route('/blog/[...slug]', { slug: 'posts/my-article' }); // Returns: '/blog/posts/my-article'
```

### Using with routerLink

Pre-compute routes as class properties to use with Angular's `routerLink` directive:

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

For dynamic lists of links, use a computed signal to derive routes from your data. This avoids function calls in templates and ensures routes are recalculated when the data changes:

```ts
import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { route } from '@analogjs/router';

@Component({
  imports: [RouterLink],
  template: `
    <ul>
      @for (product of productLinks(); track product.id) {
        <li>
          <a [routerLink]="product.route">
            {{ product.name }}
          </a>
        </li>
      }
    </ul>
  `,
})
export default class ProductListComponent {
  products = input<{ id: string; name: string }[]>([]);

  productLinks = computed(() =>
    this.products().map((product) => ({
      ...product,
      route: route('/products/[productId]', { productId: product.id }),
    })),
  );
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

### Overriding Parameter Types

By default, all route parameters are typed as `string` since that's what Angular's router provides at runtime. You can override these types using a schema when you know a parameter represents a different type.

#### Using Type Constructors

Pass an object with type constructors to override parameter types:

```ts
import { Component, computed } from '@angular/core';
import { injectParams } from '@analogjs/router';

@Component({...})
export default class ProductPage {
  // Override productId to be typed as number
  params = injectParams<'/products/[productId]'>({ productId: Number });

  // TypeScript sees: Signal<{ productId: number }>
  // Runtime value is still a string - convert when needed:
  productId = computed(() => Number(this.params().productId));
}
```

#### Using Zod Schemas

For more complex validation and transformation, you can use [Zod](https://zod.dev/) schemas. The schema's output type is used for type inference:

```ts
import { Component } from '@angular/core';
import { injectParams } from '@analogjs/router';
import { z } from 'zod';

const paramsSchema = z.object({
  productId: z.coerce.number(),
});

@Component({...})
export default class ProductPage {
  params = injectParams<'/products/[productId]'>(paramsSchema);
  // TypeScript sees: Signal<{ productId: number }>
}
```

:::warning

Schema overrides only affect TypeScript types - no runtime validation or transformation occurs. The actual values from Angular's router are always strings. Use `z.coerce.number()` or `Number()` to convert values at runtime when needed.

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

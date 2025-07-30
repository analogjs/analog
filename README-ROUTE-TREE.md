# Analog Route Tree Generator (Experimental)

A TanStack Router-inspired route tree generator for AnalogJS that provides type-safe routing with automatic code generation.

> ⚠️ **Experimental Feature**: This feature is currently experimental and must be explicitly enabled in your configuration.
>
> 📝 **Current Status**: Route tree generation is working and generates type-safe routes successfully. JSON-LD SSR injection is temporarily disabled due to middleware conflicts but the route tree still exports the `routeJsonLdMap` for manual usage.

## Features

✨ **Type-Safe Routes**: Generate TypeScript interfaces for all your routes  
🔄 **Hot Reload**: Automatically regenerates when page files change  
📁 **File-Based**: Works with Analog's existing file-based routing conventions  
🎯 **TanStack-Style**: Similar API to TanStack Router's generated route trees  
⚡ **Fast**: Uses fast-glob for efficient file scanning  
🛠️ **Configurable**: Customizable output location and formatting options  
📝 **Route Metadata**: Support for exporting route metadata from page files  
🧩 **Component Types**: Direct access to component types for better type safety  
🔍 **JSON-LD Support**: Export structured data for SEO (SSR injection coming soon)

## How It Works

The plugin scans your `src/app/pages` directory for `.page.ts` files and generates a `routeTree.gen.ts` file with:

- Type-safe route interfaces
- Route parameter extraction
- Component imports and mappings
- Utility types for navigation

## Configuration

Add to your `vite.config.ts`:

```typescript
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';

export default defineConfig({
  plugins: [
    analog({
      vite: {
        experimental: {
          // Enable route tree generation (disabled by default)
          routeTree: true,

          // Or with custom options:
          routeTree: {
            pagesDirectory: 'src/app/pages', // Pages directory (default)
            generatedRouteTree: 'src/app/routeTree.gen.ts', // Output file (default)
            quoteStyle: 'single', // 'single' | 'double' (default: 'single')
            semicolons: false, // Add semicolons (default: false)
            disableLogging: false, // Disable logging (default: false)
            additionalPagesDirs: [], // Additional directories to scan
          },
        },
      },
    }),
  ],
});
```

## Generated Output

For a pages directory like:

```
src/app/pages/
├── (home).page.ts          # / route
├── about.page.ts           # /about route
├── products/
│   ├── [id].page.ts        # /products/:id route
│   └── index.page.ts       # /products route
└── [...slug].page.ts       # /** catch-all route
```

Generates:

```typescript
// routeTree.gen.ts
import RouteHome from '../pages/(home).page.ts'
import RouteAbout from '../pages/about.page.ts'
import RouteProductsId from '../pages/products/[id].page.ts'
import RouteProductsIndex from '../pages/products/index.page.ts'
import RouteSlug from '../pages/[...slug].page.ts'

export interface AnalogRoutesByPath {
  '/': typeof RouteHome
  '/about': typeof RouteAbout
  '/products/:id': typeof RouteProductsId
  '/products': typeof RouteProductsIndex
  '/**': typeof RouteSlug
}

export interface AnalogRoutesById {
  'home': typeof RouteHome
  'about': typeof RouteAbout
  'products_id': typeof RouteProductsId
  'products_index': typeof RouteProductsIndex
  'slug': typeof RouteSlug
}

// Utility types for type-safe navigation
export type AnalogRoute = keyof AnalogRoutesByPath
export type RouteParams<T extends AnalogRoute> =
  T extends '/' ? Record<string, never> :
  T extends \`\${string}:\${infer Param}/\${infer Rest}\` ? { [K in Param]: string } & RouteParams<\`/\${Rest}\`> :
  T extends \`\${string}:\${infer Param}\` ? { [K in Param]: string } :
  Record<string, never>
```

## Usage Examples

### Type-Safe Navigation Function

```typescript
import { AnalogRoute, RouteParams } from './app/routeTree.gen';

function navigateToRoute<T extends AnalogRoute>(
  route: T,
  params: RouteParams<T>,
) {
  // Type-safe navigation with required parameters
  router.navigate([route], { queryParams: params });
}

// Usage:
navigateToRoute('/', {}); // ✅ Valid
navigateToRoute('/products/:id', { id: '123' }); // ✅ Valid
navigateToRoute('/products/:id', {}); // ❌ Error - missing required 'id'
```

### Type-Safe Route Helpers

```typescript
import type { AnalogRoutesByPath } from './app/routeTree.gen';

// Get component types
type HomeComponent = AnalogRoutesByPath['/'];
type ProductComponent = AnalogRoutesByPath['/products/:id'];

// Create route constants
export const routes = {
  home: '/' as const,
  about: '/about' as const,
  product: (id: string) => \`/products/\${id}\` as const,
} satisfies Record<string, string | ((...args: any[]) => string)>;
```

### Angular Router Integration

```typescript
import { RouteParams } from './app/routeTree.gen';

@Injectable()
export class TypeSafeRouter {
  constructor(private router: Router) {}

  navigateToProduct(id: string) {
    // Type-safe parameters
    const params: RouteParams<'/products/:id'> = { id };
    this.router.navigate(['/products', id]);
  }
}
```

## Route Conventions

The plugin follows Analog's file-based routing conventions:

- `(home).page.ts` → `/` (index route)
- `about.page.ts` → `/about` (static route)
- `[id].page.ts` → `/:id` (dynamic route)
- `[...slug].page.ts` → `/**` (catch-all route)
- `product.details.page.ts` → `/product/details` (nested route)

## Route Metadata

You can export route metadata from your page files:

```typescript
// src/app/pages/admin.page.ts
import { Component } from '@angular/core';

export const routeMeta = {
  title: 'Admin Dashboard',
  description: 'Manage your application',
  requiresAuth: true,
  roles: ['admin', 'super-admin'],
  customData: {
    icon: 'dashboard',
    priority: 1,
  },
};

@Component({
  selector: 'app-admin',
  standalone: true,
  template: `<h1>Admin Dashboard</h1>`,
})
export default class AdminPageComponent {}
```

The generated route tree will include type-safe access to this metadata:

```typescript
import type { FileRoutesByPath } from './app/routeTree.gen';

// Access component and metadata types
type AdminRoute = FileRoutesByPath['/admin'];
// AdminRoute includes:
// - component: typeof AdminComponent
// - routeMeta: typeof routeMeta (with full type information)
```

## JSON-LD Structured Data

You can export JSON-LD structured data from your page files using `schema-dts` for type-safe SEO optimization:

```typescript
// src/app/pages/article.page.ts
import { Component } from '@angular/core';
import type { WithContext, Article } from 'schema-dts';

export const routeJsonLd: WithContext<Article> = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Your Article Title',
  description: 'Article description for search engines',
  author: {
    '@type': 'Person',
    name: 'Author Name',
  },
  datePublished: '2024-01-30',
  publisher: {
    '@type': 'Organization',
    name: 'Your Site Name',
    logo: {
      '@type': 'ImageObject',
      url: 'https://yoursite.com/logo.png',
    },
  },
};

@Component({
  selector: 'app-article',
  standalone: true,
  template: `<article>Your content</article>`,
})
export default class ArticlePageComponent {}
```

The generated route tree will include type-safe access to JSON-LD data:

```typescript
import type { FileRoutesByPath } from './app/routeTree.gen';

// Access component and JSON-LD types
type ArticleRoute = FileRoutesByPath['/article'];
// ArticleRoute includes:
// - component: typeof ArticleComponent
// - jsonLd: typeof routeJsonLd (fully typed as WithContext<Article>)
```

### Supported Schema Types

You can use any schema type from `schema-dts`, including:

- `Article` - For blog posts and articles
- `Product` - For e-commerce product pages
- `Organization` - For company/about pages
- `Person` - For profile/author pages
- `Event` - For event pages
- `Recipe` - For recipe pages
- And many more from schema.org

### SSR Integration (Currently Experimental)

> ⚠️ **Note**: JSON-LD SSR injection is currently experimental and temporarily disabled due to middleware conflicts. The route tree will still generate the `routeJsonLdMap` export, but automatic injection during SSR is not yet available.

The route tree plugin generates a map of routes to their JSON-LD data that can be used for server-side rendering:

1. **Generated Export**: When you export `routeJsonLd` from a page, it's included in the generated `routeJsonLdMap` in the route tree file.

2. **Manual Integration**: Until automatic SSR injection is re-enabled, you can manually inject JSON-LD in your components:

```typescript
import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { routeJsonLdMap } from './app/routeTree.gen';

@Component({
  selector: 'app-root',
  template: ` <router-outlet></router-outlet> `,
})
export class AppComponent {
  private route = inject(ActivatedRoute);

  ngOnInit() {
    // Get current route path
    const path = this.route.snapshot.url
      .map((segment) => segment.path)
      .join('/');
    const fullPath = '/' + path;

    // Get JSON-LD for this route
    const jsonLd = routeJsonLdMap.get(fullPath);

    if (jsonLd && typeof document !== 'undefined') {
      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.textContent = JSON.stringify(jsonLd);
      document.head.appendChild(script);
    }
  }
}
```

3. **Future Automatic SSR Support**: We're working on resolving the middleware conflicts to enable automatic JSON-LD injection during server-side rendering. This will ensure that JSON-LD is present in the initial HTML response for optimal SEO.

## Benefits

1. **Type Safety**: Catch routing errors at compile time
2. **IntelliSense**: Auto-completion for routes and parameters
3. **Refactoring**: Rename routes safely across your app
4. **Documentation**: Generated types serve as route documentation
5. **Performance**: No runtime overhead, all types are compile-time only

## Similar to TanStack Router

This plugin provides a similar developer experience to TanStack Router's route tree generation, but adapted for Angular and AnalogJS conventions. If you're familiar with TanStack Router, you'll feel right at home!

## Standalone Usage

You can also use the route tree plugin independently:

```typescript
import { routeTreePlugin } from '@analogjs/vite-plugin-angular';

export default defineConfig({
  plugins: [
    routeTreePlugin({
      workspaceRoot: process.cwd(),
      pagesDirectory: 'src/app/pages',
      generatedRouteTree: 'src/app/routeTree.gen.ts',
    }),
  ],
});
```

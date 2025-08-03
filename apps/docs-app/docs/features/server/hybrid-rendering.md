---
sidebar_position: 3
title: Hybrid Rendering in Analog - Optimize Performance with Mixed Strategies
description: Learn how to implement hybrid rendering strategies in Analog combining SSR, SSG, and CSR. Optimize performance and user experience with route-specific rendering strategies.
keywords:
  [
    'hybrid rendering',
    'SSR',
    'SSG',
    'CSR',
    'performance optimization',
    'route rules',
    'rendering strategies',
  ]
image: https://analogjs.org/img/analog-banner.png
url: https://analogjs.org/docs/features/server/hybrid-rendering
type: documentation
author: Analog Team
publishedTime: '2022-01-01T00:00:00.000Z'
modifiedTime: '2024-01-01T00:00:00.000Z'
section: Rendering
tags: ['hybrid', 'rendering', 'performance', 'optimization']
---

# Hybrid Rendering

Analog supports hybrid rendering strategies that combine server-side rendering (SSR), static site generation (SSG), and client-side rendering (CSR) to optimize performance and user experience.

## Overview

Hybrid rendering allows you to choose the best rendering strategy for each route based on:

- **Content Type**: Static vs dynamic content
- **Performance Requirements**: SEO needs vs interactivity
- **User Experience**: Initial load speed vs real-time updates
- **Resource Constraints**: Server costs vs client capabilities

## Rendering Strategies

### 1. Server-Side Rendering (SSR)

Best for:

- SEO-critical pages
- Content-heavy pages
- Pages requiring server-side data

```ts
// vite.config.ts
export default defineConfig({
  plugins: [
    analog({
      nitro: {
        routeRules: {
          // Blog posts need SEO
          '/blog/**': { ssr: true },

          // Product pages for search engines
          '/products/**': { ssr: true },

          // About page for SEO
          '/about': { ssr: true },
        },
      },
    }),
  ],
});
```

### 2. Static Site Generation (SSG)

Best for:

- Marketing pages
- Documentation
- Landing pages
- Content that rarely changes

```ts
// vite.config.ts
export default defineConfig({
  plugins: [
    analog({
      prerender: {
        routes: ['/', '/about', '/contact', '/pricing', '/docs/**'],
      },
    }),
  ],
});
```

### 3. Client-Side Rendering (CSR)

Best for:

- Interactive dashboards
- Real-time applications
- User-specific content
- Admin panels

```ts
// vite.config.ts
export default defineConfig({
  plugins: [
    analog({
      nitro: {
        routeRules: {
          // Admin dashboard (client-side for security)
          '/admin/**': { ssr: false },

          // User dashboard with real-time data
          '/dashboard/**': { ssr: false },

          // Interactive tools
          '/tools/**': { ssr: false },
        },
      },
    }),
  ],
});
```

## Implementation Examples

### E-commerce Application

```ts
// vite.config.ts
export default defineConfig({
  plugins: [
    analog({
      prerender: {
        routes: ['/', '/about', '/contact', '/products', '/categories'],
      },
      nitro: {
        routeRules: {
          // Static pages (SSG)
          '/': { prerender: true },
          '/about': { prerender: true },
          '/contact': { prerender: true },

          // Product listings (SSR for SEO)
          '/products': { ssr: true },
          '/categories/**': { ssr: true },

          // Product details (SSR for SEO)
          '/products/**': { ssr: true },

          // User account (CSR for privacy)
          '/account/**': { ssr: false },
          '/cart': { ssr: false },
          '/checkout/**': { ssr: false },

          // Admin panel (CSR)
          '/admin/**': { ssr: false },
        },
      },
    }),
  ],
});
```

### Blog Platform

```ts
// vite.config.ts
export default defineConfig({
  plugins: [
    analog({
      prerender: {
        routes: async () => {
          // Fetch blog posts for static generation
          const posts = await fetch('https://api.example.com/posts').then((r) =>
            r.json(),
          );

          return [
            '/',
            '/about',
            '/contact',
            ...posts.map((post: any) => `/blog/${post.slug}`),
          ];
        },
      },
      nitro: {
        routeRules: {
          // Static pages
          '/': { prerender: true },
          '/about': { prerender: true },
          '/contact': { prerender: true },

          // Blog posts (SSG for performance)
          '/blog/**': { prerender: true },

          // Author pages (SSR for dynamic content)
          '/authors/**': { ssr: true },

          // User dashboard (CSR)
          '/dashboard/**': { ssr: false },
          '/profile/**': { ssr: false },

          // Admin (CSR)
          '/admin/**': { ssr: false },
        },
      },
    }),
  ],
});
```

### SaaS Application

```ts
// vite.config.ts
export default defineConfig({
  plugins: [
    analog({
      prerender: {
        routes: ['/', '/pricing', '/features', '/docs/**'],
      },
      nitro: {
        routeRules: {
          // Marketing pages (SSG)
          '/': { prerender: true },
          '/pricing': { prerender: true },
          '/features': { prerender: true },
          '/docs/**': { prerender: true },

          // Public API docs (SSR)
          '/api/docs/**': { ssr: true },

          // Application (CSR)
          '/app/**': { ssr: false },
          '/dashboard/**': { ssr: false },
          '/settings/**': { ssr: false },

          // Authentication (CSR)
          '/login': { ssr: false },
          '/register': { ssr: false },
          '/forgot-password': { ssr: false },
        },
      },
    }),
  ],
});
```

## Dynamic Route Generation

### API-Driven Routes

Generate routes dynamically based on API data:

```ts
// vite.config.ts
export default defineConfig({
  plugins: [
    analog({
      prerender: {
        routes: async () => {
          try {
            // Fetch routes from API
            const [products, categories, posts] = await Promise.all([
              fetch('https://api.example.com/products').then((r) => r.json()),
              fetch('https://api.example.com/categories').then((r) => r.json()),
              fetch('https://api.example.com/posts').then((r) => r.json()),
            ]);

            return [
              // Static routes
              '/',
              '/about',
              '/contact',

              // Dynamic product routes
              ...products.map((product: any) => `/products/${product.slug}`),

              // Dynamic category routes
              ...categories.map(
                (category: any) => `/categories/${category.slug}`,
              ),

              // Dynamic blog routes
              ...posts.map((post: any) => `/blog/${post.slug}`),
            ];
          } catch (error) {
            console.error('Failed to fetch routes:', error);
            return ['/', '/about', '/contact'];
          }
        },
      },
    }),
  ],
});
```

### Content-Based Routes

Generate routes from content files:

```ts
// vite.config.ts
import { readdirSync } from 'fs';
import { join } from 'path';

export default defineConfig({
  plugins: [
    analog({
      prerender: {
        routes: async () => {
          const contentDir = join(process.cwd(), 'src/content');
          const routes = ['/', '/about'];

          try {
            // Generate routes from markdown files
            const blogFiles = readdirSync(join(contentDir, 'blog'));
            const productFiles = readdirSync(join(contentDir, 'products'));

            routes.push(
              ...blogFiles
                .filter((file) => file.endsWith('.md'))
                .map((file) => `/blog/${file.replace('.md', '')}`),
              ...productFiles
                .filter((file) => file.endsWith('.md'))
                .map((file) => `/products/${file.replace('.md', '')}`),
            );
          } catch (error) {
            console.error('Failed to read content directory:', error);
          }

          return routes;
        },
      },
    }),
  ],
});
```

## Conditional Rendering

### Environment-Based Configuration

```ts
// vite.config.ts
export default defineConfig(({ mode }) => ({
  plugins: [
    analog({
      // Only prerender in production
      prerender:
        mode === 'production'
          ? {
              routes: ['/', '/about', '/contact'],
            }
          : undefined,

      nitro: {
        routeRules: {
          // Different strategies per environment
          '/admin/**':
            mode === 'development'
              ? { ssr: true } // SSR in dev for debugging
              : { ssr: false }, // CSR in production for security
        },
      },
    }),
  ],
}));
```

### Feature-Based Configuration

```ts
// vite.config.ts
export default defineConfig({
  plugins: [
    analog({
      nitro: {
        routeRules: {
          // Enable SSR for premium features
          '/premium/**':
            process.env.ENABLE_PREMIUM_SSR === 'true'
              ? { ssr: true }
              : { ssr: false },
        },
      },
    }),
  ],
});
```

## Performance Optimization

### Bundle Splitting

```ts
// vite.config.ts
export default defineConfig({
  plugins: [
    analog({
      nitro: {
        routeRules: {
          // Split admin bundle
          '/admin/**': {
            ssr: false,
            headers: {
              'Cache-Control': 'no-cache',
            },
          },

          // Cache static content
          '/docs/**': {
            prerender: true,
            headers: {
              'Cache-Control': 'public, max-age=3600',
            },
          },
        },
      },
    }),
  ],
});
```

### Caching Strategies

```ts
// vite.config.ts
export default defineConfig({
  plugins: [
    analog({
      nitro: {
        routeRules: {
          // Long-term cache for static content
          '/': {
            prerender: true,
            headers: {
              'Cache-Control': 'public, max-age=86400',
            },
          },

          // Short-term cache for dynamic content
          '/blog/**': {
            ssr: true,
            headers: {
              'Cache-Control': 'public, max-age=3600',
            },
          },

          // No cache for user-specific content
          '/dashboard/**': {
            ssr: false,
            headers: {
              'Cache-Control': 'no-cache, no-store, must-revalidate',
            },
          },
        },
      },
    }),
  ],
});
```

## Monitoring and Analytics

### Performance Tracking

```ts
// src/app/services/rendering-analytics.service.ts
import { Injectable, inject } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class RenderingAnalyticsService {
  private router = inject(Router);

  constructor() {
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        this.trackRenderingStrategy(event.url);
      });
  }

  private trackRenderingStrategy(url: string) {
    const strategy = this.getRenderingStrategy(url);

    // Send to analytics
    if (typeof gtag !== 'undefined') {
      gtag('event', 'rendering_strategy', {
        strategy,
        url,
        timestamp: Date.now(),
      });
    }
  }

  private getRenderingStrategy(url: string): string {
    if (url.startsWith('/admin') || url.startsWith('/dashboard')) {
      return 'csr';
    } else if (url.startsWith('/blog') || url.startsWith('/products')) {
      return 'ssr';
    } else {
      return 'ssg';
    }
  }
}
```

## Best Practices

### 1. Route Classification

- **Static Routes**: Use SSG for marketing pages, documentation
- **Dynamic Routes**: Use SSR for content that changes but needs SEO
- **Interactive Routes**: Use CSR for user-specific, real-time content

### 2. Performance Considerations

- **Bundle Size**: Keep client-side bundles small for CSR routes
- **Caching**: Implement appropriate caching headers
- **Loading States**: Show loading indicators during hydration

### 3. SEO Strategy

- **Critical Pages**: Ensure important pages are SSR or SSG
- **Meta Tags**: Set proper meta tags for all rendering strategies
- **Structured Data**: Include structured data for search engines

### 4. User Experience

- **Progressive Enhancement**: Start with static content, enhance with JavaScript
- **Loading Performance**: Optimize initial page loads
- **Interactivity**: Ensure smooth transitions between rendering strategies

### 5. Development Workflow

- **Testing**: Test all rendering strategies in development
- **Monitoring**: Track performance metrics for each strategy
- **Iteration**: Continuously optimize based on user feedback

## Troubleshooting

### Common Issues

#### 1. Hydration Mismatches

**Problem**: Different content rendered on server vs client

**Solution**: Ensure consistent data and timing:

```ts
@Component({
  template: `
    <div>
      @if (isHydrated()) {
        <p>{{ dynamicContent() }}</p>
      } @else {
        <p>Loading...</p>
      }
    </div>
  `,
})
export class MyComponent {
  isHydrated = signal(false);
  dynamicContent = signal('');

  ngOnInit() {
    // Wait for hydration to complete
    setTimeout(() => {
      this.isHydrated.set(true);
      this.dynamicContent.set('Dynamic content loaded');
    }, 0);
  }
}
```

#### 2. Route Conflicts

**Problem**: Multiple route rules conflicting

**Solution**: Order rules from specific to general:

```ts
// vite.config.ts
export default defineConfig({
  plugins: [
    analog({
      nitro: {
        routeRules: {
          // Specific routes first
          '/admin/dashboard': { ssr: false },
          '/admin/users': { ssr: false },

          // General patterns last
          '/admin/**': { ssr: false },
          '/**': { ssr: true },
        },
      },
    }),
  ],
});
```

#### 3. Performance Issues

**Problem**: Slow rendering or large bundles

**Solution**: Optimize based on usage patterns:

```ts
// vite.config.ts
export default defineConfig({
  plugins: [
    analog({
      prerender: {
        routes: ['/', '/about'], // Minimal prerendering
      },
      nitro: {
        routeRules: {
          // Use SSR for most routes
          '/**': { ssr: true },

          // Only disable SSR for truly interactive routes
          '/admin/**': { ssr: false },
          '/dashboard/**': { ssr: false },
        },
      },
    }),
  ],
});
```

## Related Documentation

- [Server-Side Rendering](/docs/features/server/server-side-rendering)
- [Static Site Generation](/docs/features/server/static-site-generation)
- [Performance Optimization](/docs/guides/performance)
- [Deployment](/docs/features/deployment/overview)

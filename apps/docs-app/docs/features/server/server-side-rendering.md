---
title: Server-Side Rendering (SSR) in Analog - Complete Guide
description: Learn how to implement server-side rendering in Analog for improved SEO, performance, and user experience. Understand SSR configuration, hydration, and best practices.
keywords:
  [
    'SSR',
    'server-side rendering',
    'SEO',
    'performance',
    'hydration',
    'Angular SSR',
    'Nitro',
    'Core Web Vitals',
  ]
image: https://analogjs.org/img/analog-banner.png
url: https://analogjs.org/docs/features/server/server-side-rendering
type: documentation
author: Analog Team
publishedTime: '2022-01-01T00:00:00.000Z'
modifiedTime: '2024-01-01T00:00:00.000Z'
section: Rendering
tags: ['ssr', 'server-side', 'seo', 'performance']
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Server-Side Rendering (SSR)

Analog provides powerful server-side rendering capabilities that enable you to build fast, SEO-friendly applications with excellent user experience.

## Overview

Server-side rendering (SSR) in Analog allows you to:

- **Improve SEO**: Search engines can crawl fully rendered HTML
- **Enhance Performance**: Faster initial page loads and better Core Web Vitals
- **Better UX**: Users see content immediately without waiting for JavaScript
- **Social Sharing**: Proper meta tags and Open Graph data for social platforms

## How SSR Works

Analog uses Angular's server-side rendering capabilities powered by Nitro:

1. **Request Handling**: Server receives HTTP request
2. **Route Resolution**: Analog resolves the route to the appropriate component
3. **Data Fetching**: Server-side data loading (if configured)
4. **HTML Generation**: Angular renders the component to HTML
5. **Response**: Fully rendered HTML is sent to the client
6. **Hydration**: Client-side JavaScript takes over for interactivity

## Basic Configuration

SSR is enabled by default in Analog. Your `main.server.ts` file handles the server-side rendering:

```ts title="main.server.ts - SSR configuration"
// src/main.server.ts
import 'zone.js/node';
import { enableProdMode } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { renderApplication } from '@angular/platform-server';

import { provideServerContext } from '@analogjs/router/server';
import { ServerContext } from '@analogjs/router/tokens';

import { config } from './app/app.config.server';
import { AppComponent } from './app/app.component';

if (import.meta.env.PROD) {
  enableProdMode();
}

export function bootstrap() {
  return bootstrapApplication(AppComponent, config);
}

export default async function render(
  url: string,
  document: string,
  serverContext: ServerContext,
) {
  const html = await renderApplication(bootstrap, {
    document,
    url,
    platformProviders: [provideServerContext(serverContext)],
  });

  return html;
}
```

## Server Configuration

Configure your server-specific providers in `app.config.server.ts`:

```ts title="app.config.server.ts - Server configuration"
// src/app/app.config.server.ts
import { ApplicationConfig } from '@angular/core';
import { provideServerRendering } from '@angular/platform-server';
import { provideFileRouter } from '@analogjs/router';
import { provideHttpClient, withFetch } from '@angular/common/http';

export const config: ApplicationConfig = {
  providers: [
    provideFileRouter(),
    provideHttpClient(withFetch()),
    provideServerRendering(),
  ],
};
```

## SSR-Compatible Components

### Handling Browser-Only APIs

Components that use browser-specific APIs need special handling:

```ts title="analytics.component.ts - SSR-compatible component"
// src/app/components/analytics.component.ts
import { Component, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Component({
  selector: 'app-analytics',
  template: `
    <div class="analytics">
      <!-- Analytics content -->
    </div>
  `,
})
export class AnalyticsComponent {
  private platformId = inject(PLATFORM_ID);

  ngOnInit() {
    // Only run in browser
    if (isPlatformBrowser(this.platformId)) {
      this.initializeAnalytics();
    }
  }

  private initializeAnalytics() {
    // Browser-specific code
    window.gtag('config', 'GA_MEASUREMENT_ID');
  }
}
```

### Using TransferState

Transfer data from server to client to avoid duplicate requests:

```ts
// src/app/services/data.service.ts
import { Injectable, inject, makeStateKey, TransferState } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';

const DATA_KEY = makeStateKey<any[]>('api-data');

@Injectable({
  providedIn: 'root',
})
export class DataService {
  private http = inject(HttpClient);
  private transferState = inject(TransferState);

  getData(): Observable<any[]> {
    // Check if we have cached data from SSR
    const cached = this.transferState.get(DATA_KEY, []);

    if (cached.length > 0) {
      // Use cached data and remove it from transfer state
      this.transferState.remove(DATA_KEY);
      return of(cached);
    }

    // Fetch fresh data and cache it for SSR
    return this.http.get<any[]>('/api/data').pipe(
      tap((data) => {
        this.transferState.set(DATA_KEY, data);
      }),
    );
  }
}
```

## Package Compatibility

### Transforming Packages for SSR

Some dependencies may need additional transforms to work for server-side rendering. If you receive an error during SSR in development, add the package(s) to the `ssr.noExternal` array in the Vite config.

<Tabs groupId="package-manager">
  <TabItem value="common">

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';

export default defineConfig(({ mode }) => ({
  ssr: {
    noExternal: [
      'apollo-angular', // npm package import
      'apollo-angular/**', // npm package import along with sub-packages
      '@spartan-ng/**', // libs under the npmScope inside an Nx workspace
      'chart.js', // Chart.js for data visualization
      'date-fns', // Date utility library
      'lodash-es', // Lodash ES modules
    ],
  },
  plugins: [analog()],
}));
```

  </TabItem>

  <TabItem value="ui-libraries">

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';

export default defineConfig(({ mode }) => ({
  ssr: {
    noExternal: [
      '@angular/material', // Angular Material
      '@angular/cdk', // Angular CDK
      'ngx-toastr', // Toast notifications
      'ngx-skeleton-loader', // Skeleton loaders
      'angular-calendar', // Calendar component
      'ngx-charts', // Chart components
    ],
  },
  plugins: [analog()],
}));
```

  </TabItem>

  <TabItem value="state-management">

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';

export default defineConfig(({ mode }) => ({
  ssr: {
    noExternal: [
      '@ngrx/store', // NgRx store
      '@ngrx/effects', // NgRx effects
      '@ngrx/entity', // NgRx entity
      '@ngrx/component-store', // NgRx component store
      'ngxs', // NGXS state management
      'akita', // Akita state management
    ],
  },
  plugins: [analog()],
}));
```

  </TabItem>
</Tabs>

For more information about externals with SSR, check out the [Vite documentation](https://vitejs.dev/guide/ssr.html#ssr-externals).

## Hybrid Rendering

### Client-Only Routes

For a hybrid approach, you can specify some routes to only be rendered client-side:

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';

export default defineConfig(({ mode }) => ({
  plugins: [
    analog({
      prerender: {
        routes: ['/', '/about', '/404.html'],
      },
      nitro: {
        routeRules: {
          // All admin URLs are only rendered on the client
          '/admin/**': { ssr: false },

          // Dashboard with real-time data
          '/dashboard/**': { ssr: false },

          // User profile pages (client-side for privacy)
          '/profile/**': { ssr: false },

          // Render a 404 page as a fallback page
          '/404.html': { ssr: false },

          // API routes (no SSR needed)
          '/api/**': { ssr: false },
        },
      },
    }),
  ],
}));
```

### Conditional SSR

You can also conditionally enable SSR based on environment or other factors:

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';

export default defineConfig(({ mode }) => ({
  plugins: [
    analog({
      ssr: mode === 'production', // Only SSR in production
      nitro: {
        routeRules: {
          // Disable SSR for development
          '/**': mode === 'development' ? { ssr: false } : undefined,
        },
      },
    }),
  ],
}));
```

## Disabling SSR

You can opt-out of SSR and generate a client-only build:

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';

export default defineConfig(({ mode }) => ({
  plugins: [analog({ ssr: false })],
}));
```

## Prerendering Routes

### Basic Prerendering

With SSR, the `"/"` route is prerendered by default. Customize prerendered routes:

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';

export default defineConfig(({ mode }) => ({
  plugins: [
    analog({
      prerender: {
        routes: ['/', '/about', '/contact', '/blog'],
      },
    }),
  ],
}));
```

### Dynamic Route Prerendering

Prerender dynamic routes by providing a function:

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';

export default defineConfig(({ mode }) => ({
  plugins: [
    analog({
      prerender: {
        routes: async () => {
          // Fetch dynamic routes from API
          const response = await fetch('https://api.example.com/routes');
          const routes = await response.json();

          return [
            '/',
            '/about',
            ...routes.map((route: any) => `/blog/${route.slug}`),
            ...routes.map((route: any) => `/products/${route.id}`),
          ];
        },
      },
    }),
  ],
}));
```

### Disabling Prerendering

Opt-out of prerendering altogether:

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';

export default defineConfig(({ mode }) => ({
  plugins: [
    analog({
      ssr: true,
      prerender: {
        routes: async () => {
          return []; // No prerendered routes
        },
      },
    }),
  ],
}));
```

## Performance Optimization

### Bundle Size Optimization

Optimize your SSR bundle size:

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';

export default defineConfig(({ mode }) => ({
  ssr: {
    noExternal: ['@angular/material'],
    target: 'node',
    format: 'esm',
  },
  build: {
    rollupOptions: {
      external: mode === 'ssr' ? ['@angular/platform-server'] : [],
    },
  },
  plugins: [analog()],
}));
```

### Memory Management

Handle memory efficiently in SSR:

```ts
// src/app/app.config.server.ts
import { ApplicationConfig } from '@angular/core';
import { provideServerRendering } from '@angular/platform-server';
import { provideFileRouter } from '@analogjs/router';

export const config: ApplicationConfig = {
  providers: [
    provideFileRouter(),
    provideServerRendering({
      // Optimize memory usage
      maxConcurrency: 10,
    }),
  ],
};
```

## Troubleshooting

### Common SSR Issues

#### 1. Browser APIs in SSR

**Problem**: Using `window`, `document`, or other browser APIs in SSR

**Solution**: Use `isPlatformBrowser()` check:

```ts
import { isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID } from '@angular/core';

@Component({})
export class MyComponent {
  private platformId = inject(PLATFORM_ID);

  ngOnInit() {
    if (isPlatformBrowser(this.platformId)) {
      // Browser-only code
      window.localStorage.setItem('key', 'value');
    }
  }
}
```

#### 2. Third-party Library Issues

**Problem**: Third-party libraries not working in SSR

**Solution**: Add to `ssr.noExternal`:

```ts
// vite.config.ts
export default defineConfig({
  ssr: {
    noExternal: ['problematic-library'],
  },
});
```

#### 3. Hydration Mismatches

**Problem**: Server and client render different content

**Solution**: Ensure consistent rendering:

```ts
@Component({
  template: `
    <div>
      @if (isLoaded()) {
        <p>Content loaded</p>
      } @else {
        <p>Loading...</p>
      }
    </div>
  `,
})
export class MyComponent {
  isLoaded = signal(false);

  ngOnInit() {
    // Use setTimeout to ensure consistent timing
    setTimeout(() => {
      this.isLoaded.set(true);
    }, 0);
  }
}
```

### Debugging SSR

Enable SSR debugging:

```ts
// vite.config.ts
export default defineConfig({
  plugins: [
    analog({
      nitro: {
        debug: true,
      },
    }),
  ],
});
```

## Best Practices

### 1. Performance

- Use `TransferState` to avoid duplicate requests
- Implement proper caching strategies
- Optimize bundle sizes for SSR
- Use lazy loading for non-critical components

### 2. SEO

- Set proper meta tags for each route
- Implement structured data
- Use semantic HTML
- Optimize for Core Web Vitals

### 3. User Experience

- Show loading states during hydration
- Implement progressive enhancement
- Handle offline scenarios
- Provide fallbacks for failed SSR

### 4. Development

- Test SSR in development mode
- Use different configurations for dev/prod
- Monitor SSR performance
- Implement proper error boundaries

## Related Documentation

- [Static Site Generation](/docs/features/server/static-site-generation)
- [Hybrid Rendering](/docs/features/server/hybrid-rendering)
- [Performance Optimization](/docs/guides/performance)
- [Deployment](/docs/features/deployment/overview)

---
sidebar_position: 6
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Performance Optimization Guide

This comprehensive guide covers performance optimization techniques for Analog applications, from build-time optimizations to runtime performance improvements.

## Build Performance

### Vite Optimization

#### Pre-bundling Dependencies

Configure Vite to pre-bundle heavy dependencies:

```ts title="vite.config.ts - Pre-bundling dependencies"
// vite.config.ts
export default defineConfig({
  optimizeDeps: {
    include: [
      '@angular/core',
      '@angular/common',
      '@angular/router',
      '@angular/forms',
      'rxjs',
      'rxjs/operators',
    ],
    exclude: ['@angular/localize'],
    esbuildOptions: {
      target: 'es2020',
    },
  },
});
```

#### Build Caching

Enable persistent caching for faster rebuilds:

```ts title="vite.config.ts - Build caching configuration"
export default defineConfig({
  cacheDir: 'node_modules/.vite',
  build: {
    cache: {
      // Enable build caching
      buildDependencies: {
        // Define when to invalidate cache
        config: ['vite.config.ts', 'package.json'],
      },
    },
  },
});
```

### TypeScript Performance

#### Incremental Compilation

```json title="tsconfig.json - Incremental compilation"
// tsconfig.json
{
  "compilerOptions": {
    "incremental": true,
    "tsBuildInfoFile": ".tsbuildinfo",
    "skipLibCheck": true,
    "skipDefaultLibCheck": true
  }
}
```

#### Faster Type Checking

Use separate processes for type checking:

```ts title="vite.config.ts - Type checking with separate process"
// vite.config.ts
import checker from 'vite-plugin-checker';

export default defineConfig({
  plugins: [
    angular(),
    checker({
      typescript: {
        tsconfigPath: './tsconfig.app.json',
        buildMode: true,
      },
    }),
  ],
});
```

## Bundle Size Optimization

### Code Splitting

#### Route-Based Splitting

Analog automatically code-splits routes, but you can optimize further:

```ts title="Advanced lazy loading with named chunks"
// Advanced lazy loading with named chunks
const routes = [
  {
    path: 'admin',
    loadChildren: () =>
      import(/* webpackChunkName: "admin" */ './admin/routes').then(
        (m) => m.routes,
      ),
  },
  {
    path: 'shop',
    loadChildren: () =>
      import(/* webpackChunkName: "shop" */ './shop/routes').then(
        (m) => m.routes,
      ),
  },
];
```

#### Component-Level Splitting

```ts
// Lazy load heavy components
@Component({
  template: `
    <ng-container *ngIf="showChart">
      <ng-container *ngComponentOutlet="chartComponent" />
    </ng-container>
  `,
})
export class DashboardComponent {
  chartComponent?: Type<any>;

  async loadChart() {
    const { ChartComponent } = await import('./chart/chart.component');
    this.chartComponent = ChartComponent;
  }
}
```

### Tree Shaking

#### Remove Unused Code

```ts
// vite.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      treeshake: {
        preset: 'recommended',
        moduleSideEffects: false,
        propertyReadSideEffects: false,
        unknownGlobalSideEffects: false,
      },
    },
  },
});
```

#### Optimize Imports

```ts
// ❌ Bad - imports entire library
import * as _ from 'lodash';

// ✅ Good - imports specific functions
import debounce from 'lodash/debounce';
import throttle from 'lodash/throttle';

// ✅ Better - use ES modules
import { debounce, throttle } from 'lodash-es';
```

### Bundle Analysis

#### Visualize Bundle Size

Install the bundle analyzer with your preferred package manager:

<Tabs groupId="package-manager">
  <TabItem value="npm">

```bash title="Install bundle analyzer with npm"
npm i -D rollup-plugin-visualizer
```

  </TabItem>

  <TabItem label="Yarn" value="yarn">

```bash title="Install bundle analyzer with Yarn"
yarn add -D rollup-plugin-visualizer
```

  </TabItem>

  <TabItem value="pnpm">

```bash title="Install bundle analyzer with pnpm"
pnpm add -D rollup-plugin-visualizer
```

  </TabItem>

  <TabItem value="bun">

```bash title="Install bundle analyzer with Bun"
bun add -D rollup-plugin-visualizer
```

  </TabItem>
</Tabs>

Configure in `vite.config.ts`:

```ts title="vite.config.ts - Bundle analyzer configuration"
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig({
  plugins: [
    angular(),
    visualizer({
      open: true,
      gzipSize: true,
      brotliSize: true,
    }),
  ],
});
```

#### Manual Chunk Splitting

```ts title="vite.config.ts - Manual chunk splitting"
// vite.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'angular-core': ['@angular/core', '@angular/common'],
          'angular-router': ['@angular/router'],
          'angular-forms': ['@angular/forms'],
          vendor: ['rxjs', 'tslib'],
          'ui-components': ['./src/app/shared/ui'],
        },
      },
    },
  },
});
```

## Runtime Performance

### Change Detection Optimization

#### OnPush Strategy

```ts title="Component with OnPush change detection strategy"
@Component({
  selector: 'app-product-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div *ngFor="let product of products; trackBy: trackById">
      {{ product.name }}
    </div>
  `,
})
export class ProductListComponent {
  @Input() products: Product[] = [];

  trackById(index: number, product: Product): number {
    return product.id;
  }
}
```

#### Signals for Fine-Grained Reactivity

```ts
@Component({
  template: `
    <div>Count: {{ count() }}</div>
    <div>Doubled: {{ doubled() }}</div>
    <button (click)="increment()">+</button>
  `,
})
export class CounterComponent {
  count = signal(0);
  doubled = computed(() => this.count() * 2);

  increment() {
    this.count.update((v) => v + 1);
  }
}
```

### Memory Management

#### Unsubscribe from Observables

```ts
// Using takeUntilDestroyed
@Component({})
export class DataComponent implements OnInit {
  private destroy$ = inject(DestroyRef);

  ngOnInit() {
    this.dataService
      .getData()
      .pipe(takeUntilDestroyed(this.destroy$))
      .subscribe((data) => {
        // Handle data
      });
  }
}

// Using async pipe (auto-unsubscribes)
@Component({
  template: `
    <div *ngFor="let item of items$ | async">
      {{ item.name }}
    </div>
  `,
})
export class ListComponent {
  items$ = this.dataService.getItems();
}
```

#### Avoid Memory Leaks

```ts
@Component({})
export class SafeComponent implements OnDestroy {
  private intervalId?: number;
  private resizeListener?: () => void;

  ngOnInit() {
    // Clear intervals
    this.intervalId = window.setInterval(() => {
      // Update logic
    }, 1000);

    // Remove event listeners
    this.resizeListener = this.onResize.bind(this);
    window.addEventListener('resize', this.resizeListener);
  }

  ngOnDestroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    if (this.resizeListener) {
      window.removeEventListener('resize', this.resizeListener);
    }
  }
}
```

### Lazy Loading Strategies

#### Intersection Observer for Components

```ts
@Directive({
  selector: '[appLazyLoad]',
})
export class LazyLoadDirective implements OnInit, OnDestroy {
  @Input() appLazyLoad!: () => void;
  private observer?: IntersectionObserver;

  constructor(private element: ElementRef) {}

  ngOnInit() {
    this.observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          this.appLazyLoad();
          this.observer?.unobserve(this.element.nativeElement);
        }
      });
    });

    this.observer.observe(this.element.nativeElement);
  }

  ngOnDestroy() {
    this.observer?.disconnect();
  }
}

// Usage
@Component({
  template: `
    <div appLazyLoad [appLazyLoad]="loadComments">
      <ng-container *ngIf="comments">
        <!-- Comments content -->
      </ng-container>
    </div>
  `,
})
export class PostComponent {
  comments?: Comment[];

  loadComments = () => {
    this.commentService
      .getComments()
      .subscribe((comments) => (this.comments = comments));
  };
}
```

## Server-Side Optimization

### SSR Performance

#### Cache Server-Side Responses

```ts
// src/server/middleware/cache.ts
import { defineEventHandler } from 'h3';

const cache = new Map();
const CACHE_DURATION = 60 * 1000; // 1 minute

export default defineEventHandler(async (event) => {
  const url = event.node.req.url;
  const cached = cache.get(url);

  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }

  // Continue with request and cache response
  const response = await event.next();

  cache.set(url, {
    data: response,
    timestamp: Date.now(),
  });

  return response;
});
```

#### Optimize Server Bundle

```ts
// vite.config.ts
export default defineConfig({
  ssr: {
    noExternal: ['@angular/*'],
    external: ['node:*'],
    optimizeDeps: {
      include: ['tslib'],
    },
  },
});
```

### API Response Optimization

#### Compression

```ts
// src/server/middleware/compression.ts
import { defineEventHandler } from 'h3';
import { compress } from 'h3-compress';

export default defineEventHandler(async (event) => {
  // Enable gzip/brotli compression
  await compress(event, {
    gzip: true,
    brotli: true,
    threshold: 1024, // Only compress responses > 1KB
  });
});
```

#### Response Caching

```ts
// src/server/routes/api/products.ts
export default defineEventHandler(async (event) => {
  // Set cache headers
  setHeader(event, 'Cache-Control', 'public, max-age=3600, s-maxage=3600');
  setHeader(event, 'CDN-Cache-Control', 'public, max-age=7200');

  // Add ETag for conditional requests
  const products = await getProducts();
  const etag = generateETag(products);

  setHeader(event, 'ETag', etag);

  if (event.node.req.headers['if-none-match'] === etag) {
    setResponseStatus(event, 304);
    return null;
  }

  return products;
});
```

## Asset Optimization

### Image Optimization

#### Responsive Images

```ts
@Component({
  template: `
    <picture>
      <source media="(max-width: 768px)" srcset="/images/hero-mobile.webp" />
      <source media="(min-width: 769px)" srcset="/images/hero-desktop.webp" />
      <img
        src="/images/hero-fallback.jpg"
        alt="Hero image"
        loading="lazy"
        decoding="async"
      />
    </picture>
  `,
})
export class HeroComponent {}
```

#### Image Processing Plugin

```ts
// vite.config.ts
import imagemin from 'vite-plugin-imagemin';

export default defineConfig({
  plugins: [
    imagemin({
      gifsicle: { optimizationLevel: 3 },
      optipng: { optimizationLevel: 5 },
      mozjpeg: { quality: 75 },
      pngquant: { quality: [0.7, 0.8] },
      svgo: {
        plugins: [
          { name: 'removeViewBox', active: false },
          { name: 'removeDimensions', active: true },
        ],
      },
    }),
  ],
});
```

### Font Optimization

#### Font Loading Strategy

```css
/* Preload critical fonts */
@font-face {
  font-family: 'CustomFont';
  src: url('/fonts/custom-font.woff2') format('woff2');
  font-display: swap; /* Show fallback immediately */
  unicode-range: U+000-5FF; /* Latin characters only */
}
```

```html
<!-- Preload in index.html -->
<link
  rel="preload"
  href="/fonts/custom-font.woff2"
  as="font"
  type="font/woff2"
  crossorigin
/>
```

### CSS Optimization

#### Critical CSS

```ts
// vite.config.ts
import criticalCSS from 'vite-plugin-critical';

export default defineConfig({
  plugins: [
    criticalCSS({
      routes: ['/', '/about', '/products'],
      css: ['dist/styles.css'],
    }),
  ],
});
```

#### PurgeCSS for Unused Styles

```ts
// postcss.config.js
export default {
  plugins: {
    '@fullhuman/postcss-purgecss': {
      content: ['./src/**/*.html', './src/**/*.ts'],
      safelist: [/^ng-/, /^mat-/], // Keep Angular/Material classes
    },
  },
};
```

## Network Performance

### Resource Hints

```html
<!-- index.html -->
<!DOCTYPE html>
<html>
  <head>
    <!-- DNS prefetch for external domains -->
    <link rel="dns-prefetch" href="https://api.example.com" />

    <!-- Preconnect for critical origins -->
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />

    <!-- Prefetch future navigation resources -->
    <link rel="prefetch" href="/products" />

    <!-- Preload critical resources -->
    <link rel="preload" href="/styles/main.css" as="style" />
    <link rel="preload" href="/scripts/app.js" as="script" />
  </head>
</html>
```

### Service Worker Caching

```ts
// src/service-worker.ts
/// <reference lib="webworker" />

const CACHE_NAME = 'analog-app-v1';
const urlsToCache = ['/', '/styles/main.css', '/scripts/app.js'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache)),
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches
      .match(event.request)
      .then((response) => response || fetch(event.request)),
  );
});
```

## Monitoring Performance

### Core Web Vitals

```ts
// src/utils/web-vitals.ts
import { onCLS, onFID, onLCP, onFCP, onTTFB } from 'web-vitals';

export function reportWebVitals() {
  onCLS(console.log);
  onFID(console.log);
  onLCP(console.log);
  onFCP(console.log);
  onTTFB(console.log);
}

// Initialize in main.ts
if (!import.meta.env.SSR) {
  reportWebVitals();
}
```

### Custom Performance Marks

```ts
@Component({})
export class DataTableComponent implements AfterViewInit {
  ngAfterViewInit() {
    // Mark when component is fully rendered
    performance.mark('data-table-rendered');

    // Measure time from navigation start
    performance.measure(
      'data-table-load-time',
      'navigationStart',
      'data-table-rendered',
    );

    // Log the measurement
    const measure = performance.getEntriesByName('data-table-load-time')[0];
    console.log(`Data table loaded in ${measure.duration}ms`);
  }
}
```

## Checklist

### Build-Time Optimizations

- [ ] Enable Vite dependency pre-bundling
- [ ] Configure TypeScript incremental compilation
- [ ] Set up proper code splitting
- [ ] Implement tree shaking
- [ ] Analyze and optimize bundle size
- [ ] Configure build caching

### Runtime Optimizations

- [ ] Use OnPush change detection
- [ ] Implement proper subscription management
- [ ] Add lazy loading for heavy components
- [ ] Optimize list rendering with trackBy
- [ ] Minimize DOM manipulations
- [ ] Use Web Workers for heavy computations

### Asset Optimizations

- [ ] Compress and optimize images
- [ ] Implement responsive images
- [ ] Optimize font loading
- [ ] Remove unused CSS
- [ ] Inline critical CSS

### Network Optimizations

- [ ] Enable HTTP/2 or HTTP/3
- [ ] Implement proper caching strategies
- [ ] Use CDN for static assets
- [ ] Add resource hints
- [ ] Enable compression

### Monitoring

- [ ] Track Core Web Vitals
- [ ] Set up performance budgets
- [ ] Monitor bundle size
- [ ] Track real user metrics
- [ ] Regular performance audits

## Related Resources

- [Vite Performance Guide](https://vitejs.dev/guide/performance.html)
- [Angular Performance Checklist](https://angular.io/guide/performance)
- [Web Vitals](https://web.dev/vitals/)
- [Lighthouse CI](https://github.com/GoogleChrome/lighthouse-ci)

---
sidebar_position: 5
---

# Advanced Routing Patterns

This guide covers advanced routing patterns and techniques in Analog, including route guards, lazy loading, route resolvers, and complex navigation scenarios.

## Route Guards

Route guards allow you to control access to routes based on conditions. Analog supports all Angular route guards.

### Authentication Guard

```ts
// src/app/guards/auth.guard.ts
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isAuthenticated()) {
    return true;
  }

  // Redirect to login page
  return router.parseUrl('/login');
};
```

Use the guard in your route metadata:

```ts
// src/app/pages/admin/dashboard.page.ts
import { Component } from '@angular/core';
import { RouteMeta } from '@analogjs/router';
import { authGuard } from '../../guards/auth.guard';

export const routeMeta: RouteMeta = {
  title: 'Admin Dashboard',
  canActivate: [authGuard],
};

@Component({
  template: `<h1>Admin Dashboard</h1>`,
})
export default class AdminDashboardComponent {}
```

### Role-Based Guards

```ts
// src/app/guards/role.guard.ts
import { inject } from '@angular/core';
import { ActivatedRouteSnapshot } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const roleGuard = (route: ActivatedRouteSnapshot) => {
  const authService = inject(AuthService);
  const requiredRole = route.data['role'];

  return authService.hasRole(requiredRole);
};

// Usage in route
export const routeMeta: RouteMeta = {
  data: { role: 'admin' },
  canActivate: [roleGuard],
};
```

### Deactivate Guards

Prevent users from accidentally leaving a page with unsaved changes:

```ts
// src/app/guards/can-deactivate.guard.ts
export interface CanComponentDeactivate {
  canDeactivate: () => boolean | Promise<boolean>;
}

export const canDeactivateGuard = (component: CanComponentDeactivate) => {
  return component.canDeactivate ? component.canDeactivate() : true;
};

// Component implementation
@Component({
  template: `
    <form (ngSubmit)="save()">
      <input [(ngModel)]="data" />
      <button type="submit">Save</button>
    </form>
  `,
})
export default class EditPageComponent implements CanComponentDeactivate {
  hasUnsavedChanges = false;

  canDeactivate(): boolean {
    if (this.hasUnsavedChanges) {
      return confirm('You have unsaved changes. Do you really want to leave?');
    }
    return true;
  }
}

export const routeMeta: RouteMeta = {
  canDeactivate: [canDeactivateGuard],
};
```

## Route Resolvers

Resolvers pre-fetch data before navigating to a route.

### Basic Resolver

```ts
// src/app/resolvers/user.resolver.ts
import { inject } from '@angular/core';
import { ActivatedRouteSnapshot } from '@angular/router';
import { UserService } from '../services/user.service';

export const userResolver = (route: ActivatedRouteSnapshot) => {
  const userService = inject(UserService);
  const userId = route.params['id'];

  return userService.getUser(userId);
};

// src/app/pages/users/[id].page.ts
import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { RouteMeta } from '@analogjs/router';
import { userResolver } from '../../resolvers/user.resolver';

export const routeMeta: RouteMeta = {
  resolve: {
    user: userResolver,
  },
};

@Component({
  template: `
    <h1>{{ user.name }}</h1>
    <p>{{ user.email }}</p>
  `,
})
export default class UserDetailComponent {
  route = inject(ActivatedRoute);
  user = this.route.snapshot.data['user'];
}
```

### Error Handling in Resolvers

```ts
// src/app/resolvers/product.resolver.ts
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, of } from 'rxjs';

export const productResolver = (route: ActivatedRouteSnapshot) => {
  const productService = inject(ProductService);
  const router = inject(Router);
  const productId = route.params['id'];

  return productService.getProduct(productId).pipe(
    catchError(() => {
      router.navigate(['/products/not-found']);
      return of(null);
    }),
  );
};
```

## Lazy Loading Strategies

### Feature Module Lazy Loading

Structure your pages for optimal lazy loading:

```
src/app/pages/
├── admin/
│   ├── dashboard.page.ts
│   ├── users.page.ts
│   └── settings.page.ts
├── shop/
│   ├── products.page.ts
│   ├── cart.page.ts
│   └── checkout.page.ts
└── (home).page.ts
```

Each folder becomes a lazy-loaded chunk automatically.

### Preloading Strategies

Configure preloading for better performance:

```ts
// app.config.ts
import { ApplicationConfig } from '@angular/core';
import { PreloadAllModules, withPreloading } from '@angular/router';
import { provideFileRouter } from '@analogjs/router';

export const appConfig: ApplicationConfig = {
  providers: [provideFileRouter(withPreloading(PreloadAllModules))],
};
```

### Custom Preloading Strategy

```ts
// src/app/strategies/selective-preload.strategy.ts
import { Injectable } from '@angular/core';
import { PreloadingStrategy, Route } from '@angular/router';
import { Observable, of } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class SelectivePreloadingStrategy implements PreloadingStrategy {
  preload(route: Route, load: () => Observable<any>): Observable<any> {
    // Preload if route has preload data flag
    if (route.data && route.data['preload']) {
      return load();
    }
    return of(null);
  }
}

// Mark routes for preloading
export const routeMeta: RouteMeta = {
  data: { preload: true },
};
```

## Complex Navigation Patterns

### Nested Route Navigation

```ts
// src/app/pages/products/[category]/[productId].page.ts
import { Component, inject } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';

@Component({
  template: `
    <div>
      <button (click)="goToCategory()">Back to Category</button>
      <button (click)="goToNextProduct()">Next Product</button>
    </div>
  `,
})
export default class ProductDetailComponent {
  router = inject(Router);
  route = inject(ActivatedRoute);

  goToCategory() {
    const category = this.route.snapshot.params['category'];
    this.router.navigate(['/products', category]);
  }

  goToNextProduct() {
    const category = this.route.snapshot.params['category'];
    const currentId = +this.route.snapshot.params['productId'];
    this.router.navigate(['/products', category, currentId + 1]);
  }
}
```

### Auxiliary Routes

```ts
// Define auxiliary route outlets
@Component({
  template: `
    <div class="main-content">
      <router-outlet></router-outlet>
    </div>
    <aside class="sidebar">
      <router-outlet name="sidebar"></router-outlet>
    </aside>
  `,
})
export class LayoutComponent {}

// Navigate to auxiliary routes
this.router.navigate([
  {
    outlets: {
      primary: ['products'],
      sidebar: ['filters'],
    },
  },
]);
```

### Query Parameters and Fragments

```ts
// src/app/pages/search.page.ts
import { Component, inject, computed } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';

@Component({
  template: `
    <input
      [value]="searchQuery()"
      (input)="updateSearch($event)"
      placeholder="Search..."
    />
    <div *ngFor="let result of results()">
      {{ result.name }}
    </div>
  `,
})
export default class SearchPageComponent {
  router = inject(Router);
  route = inject(ActivatedRoute);

  queryParams = toSignal(this.route.queryParams);
  searchQuery = computed(() => this.queryParams()?.['q'] || '');
  results = computed(() => this.performSearch(this.searchQuery()));

  updateSearch(event: Event) {
    const query = (event.target as HTMLInputElement).value;

    // Update URL without navigating
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { q: query },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private performSearch(query: string) {
    // Search implementation
    return [];
  }
}
```

## Route Animations

Add smooth transitions between routes:

```ts
// src/app/animations/route-animations.ts
import {
  trigger,
  transition,
  style,
  animate,
  query,
} from '@angular/animations';

export const slideInAnimation = trigger('routeAnimations', [
  transition('* <=> *', [
    query(
      ':enter, :leave',
      [
        style({
          position: 'absolute',
          left: 0,
          width: '100%',
          opacity: 0,
          transform: 'scale(0) translateY(100%)',
        }),
      ],
      { optional: true },
    ),
    query(
      ':enter',
      [
        animate(
          '600ms ease',
          style({
            opacity: 1,
            transform: 'scale(1) translateY(0)',
          }),
        ),
      ],
      { optional: true },
    ),
  ]),
]);

// App component with animations
@Component({
  selector: 'app-root',
  template: `
    <main [@routeAnimations]="outlet.activatedRouteData">
      <router-outlet #outlet="outlet"></router-outlet>
    </main>
  `,
  animations: [slideInAnimation],
})
export class AppComponent {}
```

## Route State Management

### Preserving Route State

```ts
// src/app/services/route-state.service.ts
import { Injectable } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class RouteStateService {
  private routeHistory: string[] = [];

  constructor(private router: Router) {
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        this.routeHistory.push(event.url);
      });
  }

  getPreviousUrl(): string | null {
    return this.routeHistory[this.routeHistory.length - 2] || null;
  }

  goBack() {
    const previousUrl = this.getPreviousUrl();
    if (previousUrl) {
      this.router.navigateByUrl(previousUrl);
    } else {
      this.router.navigate(['/']);
    }
  }
}
```

### Scroll Position Restoration

```ts
// app.config.ts
import { ApplicationConfig } from '@angular/core';
import { withInMemoryScrolling } from '@angular/router';
import { provideFileRouter } from '@analogjs/router';

export const appConfig: ApplicationConfig = {
  providers: [
    provideFileRouter(
      withInMemoryScrolling({
        scrollPositionRestoration: 'enabled',
        anchorScrolling: 'enabled',
      }),
    ),
  ],
};
```

## Route Testing

### Testing Route Guards

```ts
// auth.guard.spec.ts
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { authGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';

describe('AuthGuard', () => {
  let mockAuthService: jasmine.SpyObj<AuthService>;
  let mockRouter: jasmine.SpyObj<Router>;

  beforeEach(() => {
    mockAuthService = jasmine.createSpyObj('AuthService', ['isAuthenticated']);
    mockRouter = jasmine.createSpyObj('Router', ['parseUrl']);

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: Router, useValue: mockRouter },
      ],
    });
  });

  it('should allow access when authenticated', () => {
    mockAuthService.isAuthenticated.and.returnValue(true);

    const result = TestBed.runInInjectionContext(() => authGuard());

    expect(result).toBe(true);
  });

  it('should redirect to login when not authenticated', () => {
    mockAuthService.isAuthenticated.and.returnValue(false);
    mockRouter.parseUrl.and.returnValue('/login' as any);

    const result = TestBed.runInInjectionContext(() => authGuard());

    expect(mockRouter.parseUrl).toHaveBeenCalledWith('/login');
  });
});
```

## Best Practices

1. **Use Route Guards Wisely**: Apply guards at the highest level possible to avoid repetition
2. **Implement Loading States**: Show loading indicators while resolvers fetch data
3. **Handle Navigation Errors**: Always provide fallback routes for error scenarios
4. **Optimize Bundle Sizes**: Group related routes together for better code splitting
5. **Use Type-Safe Navigation**: Create helper functions for complex navigation patterns
6. **Test Route Logic**: Write unit tests for guards, resolvers, and navigation logic

## Related Documentation

- [Basic Routing Overview](/docs/features/routing/overview)
- [Route Metadata](/docs/features/routing/metadata)
- [Content Routes](/docs/features/routing/content)
- [Testing Guide](/docs/features/testing/overview)

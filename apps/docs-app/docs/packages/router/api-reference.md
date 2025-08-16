---
sidebar_position: 2
---

# Router API Reference

This document provides a comprehensive reference for the `@analogjs/router` package APIs, utilities, and advanced routing patterns.

## Core Functions

### `provideFileRouter`

Configures file-based routing for your Analog application.

```ts title="app.config.ts - Basic file router configuration"
import { provideFileRouter } from '@analogjs/router';

export const appConfig: ApplicationConfig = {
  providers: [provideFileRouter()],
};
```

#### Options

```ts title="FileRouterOptions interface"
interface FileRouterOptions {
  // Custom pages directory (default: 'src/app/pages')
  pagesDir?: string;

  // Additional routes to include
  extraRoutes?: Routes;

  // Enable debug routes
  debug?: boolean;

  // Custom route configuration
  routeConfig?: RouteConfig;
}
```

### `withExtraRoutes`

Adds additional routes to the file-based router.

```ts title="app.config.ts - Adding extra routes"
import { provideFileRouter, withExtraRoutes } from '@analogjs/router';

const customRoutes: Routes = [
  {
    path: '/custom',
    loadComponent: () =>
      import('./custom.component').then((m) => m.CustomComponent),
  },
];

export const appConfig: ApplicationConfig = {
  providers: [provideFileRouter(withExtraRoutes(customRoutes))],
};
```

### `withDebugRoutes`

Enables debug routes for development.

```ts title="app.config.ts - Enable debug routes"
import { provideFileRouter, withDebugRoutes } from '@analogjs/router';

export const appConfig: ApplicationConfig = {
  providers: [provideFileRouter(withDebugRoutes())],
};
```

Access debug routes at `/__analog/routes` to see all generated routes.

## Injection Tokens

### `injectRequest`

Injects the current HTTP request object.

```ts title="Component using injectRequest"
import { injectRequest } from '@analogjs/router/tokens';

@Component({})
export class MyComponent {
  request = injectRequest();

  ngOnInit() {
    console.log('Request URL:', this.request.url);
    console.log('Request headers:', this.request.headers);
  }
}
```

### `injectResponse`

Injects the current HTTP response object.

```ts
import { injectResponse } from '@analogjs/router/tokens';

@Component({})
export class MyComponent {
  response = injectResponse();

  setCustomHeader() {
    this.response.setHeader('X-Custom-Header', 'value');
  }
}
```

### `injectBaseURL`

Injects the base URL for the current request.

```ts
import { injectBaseURL } from '@analogjs/router/tokens';

@Component({})
export class MyComponent {
  baseURL = injectBaseURL();

  ngOnInit() {
    console.log('Base URL:', this.baseURL);
  }
}
```

## Server-Side Utilities

### `provideServerContext`

Provides server context for SSR.

```ts
import { provideServerContext } from '@analogjs/router/server';

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

### `requestContextInterceptor`

HTTP interceptor for handling relative URLs in SSR.

```ts
import { requestContextInterceptor } from '@analogjs/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';

export const appConfig: ApplicationConfig = {
  providers: [provideHttpClient(withInterceptors([requestContextInterceptor]))],
};
```

## Route Metadata

### `RouteMeta`

Interface for defining route metadata.

```ts
interface RouteMeta {
  title?: string;
  description?: string;
  keywords?: string[];
  canonical?: string;
  robots?: string;
  ogImage?: string;
  twitterCard?: string;
  canActivate?: (() => boolean | Promise<boolean>)[];
  canDeactivate?: ((component: any) => boolean | Promise<boolean>)[];
  resolve?: Record<string, any>;
  data?: Record<string, any>;
}
```

### Usage Examples

```ts
// Basic metadata
export const routeMeta: RouteMeta = {
  title: 'User Profile',
  description: 'View user profile information',
  keywords: ['user', 'profile', 'account'],
};

// With guards
export const routeMeta: RouteMeta = {
  title: 'Admin Dashboard',
  canActivate: [authGuard, adminGuard],
  data: { requiresAuth: true },
};

// With resolvers
export const routeMeta: RouteMeta = {
  title: 'Product Details',
  resolve: {
    product: productResolver,
    reviews: reviewsResolver,
  },
};
```

## Advanced Routing Patterns

### Dynamic Route Parameters

```ts
// src/app/pages/users/[id].page.ts
import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';

@Component({
  template: `
    <h1>User {{ userId() }}</h1>
    <p>User details for ID: {{ userId() }}</p>
  `,
})
export default class UserDetailComponent {
  private route = inject(ActivatedRoute);

  userId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('id'))),
  );
}
```

### Catch-all Routes

```ts
// src/app/pages/[...not-found].page.ts
import { Component } from '@angular/core';
import { injectResponse } from '@analogjs/router/tokens';
import { RouteMeta } from '@analogjs/router';

export const routeMeta: RouteMeta = {
  title: 'Page Not Found',
  canActivate: [
    () => {
      const response = injectResponse();
      if (import.meta.env.SSR && response) {
        response.statusCode = 404;
      }
      return true;
    },
  ],
};

@Component({
  template: `
    <h1>404 - Page Not Found</h1>
    <p>The page you're looking for doesn't exist.</p>
    <a routerLink="/">Go Home</a>
  `,
})
export default class NotFoundComponent {}
```

### Route Groups

```ts
// File structure:
// src/app/pages/
// ├── (auth)/
// │   ├── login.page.ts
// │   └── signup.page.ts
// └── (auth).page.ts

// src/app/pages/(auth).page.ts
@Component({
  template: `
    <div class="auth-layout">
      <div class="auth-container">
        <router-outlet />
      </div>
    </div>
  `,
  styles: [
    `
      .auth-layout {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      }

      .auth-container {
        background: white;
        padding: 2rem;
        border-radius: 8px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        width: 100%;
        max-width: 400px;
      }
    `,
  ],
})
export default class AuthLayoutComponent {}
```

## Route Guards

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

  return router.parseUrl('/login');
};
```

### Role-based Guard

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
```

### Usage in Routes

```ts
// src/app/pages/admin/dashboard.page.ts
import { RouteMeta } from '@analogjs/router';
import { authGuard, roleGuard } from '../../guards';

export const routeMeta: RouteMeta = {
  title: 'Admin Dashboard',
  canActivate: [authGuard, roleGuard],
  data: { role: 'admin' },
};
```

## Route Resolvers

### Data Resolver

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
```

### Multiple Resolvers

```ts
// src/app/pages/products/[id].page.ts
import { RouteMeta } from '@analogjs/router';
import { productResolver, reviewsResolver } from '../../resolvers';

export const routeMeta: RouteMeta = {
  title: 'Product Details',
  resolve: {
    product: productResolver,
    reviews: reviewsResolver,
  },
};

@Component({
  template: `
    @if (product()) {
      <h1>{{ product()?.name }}</h1>
      <p>{{ product()?.description }}</p>

      <h2>Reviews</h2>
      @for (review of reviews(); track review.id) {
        <div class="review">
          <h3>{{ review.title }}</h3>
          <p>{{ review.content }}</p>
        </div>
      }
    }
  `,
})
export default class ProductDetailComponent {
  private route = inject(ActivatedRoute);

  product = toSignal(this.route.data.pipe(map((data) => data['product'])));
  reviews = toSignal(this.route.data.pipe(map((data) => data['reviews'])));
}
```

## Lazy Loading

### Route-based Lazy Loading

```ts
// File structure automatically enables lazy loading
// src/app/pages/
// ├── admin/
// │   ├── dashboard.page.ts
// │   ├── users.page.ts
// │   └── settings.page.ts
// └── shop/
//     ├── products.page.ts
//     ├── cart.page.ts
//     └── checkout.page.ts
```

### Manual Lazy Loading

```ts
// src/app/pages/heavy-feature.page.ts
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="heavy-feature">
      <h1>Heavy Feature</h1>
      <ng-container *ngComponentOutlet="heavyComponent" />
    </div>
  `,
})
export default class HeavyFeatureComponent {
  heavyComponent?: Type<any>;

  async ngOnInit() {
    const { HeavyComponent } = await import('./heavy.component');
    this.heavyComponent = HeavyComponent;
  }
}
```

## Navigation Utilities

### Programmatic Navigation

```ts
// src/app/services/navigation.service.ts
import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';

@Injectable({
  providedIn: 'root',
})
export class NavigationService {
  private router = inject(Router);

  navigateToUser(userId: string) {
    this.router.navigate(['/users', userId]);
  }

  navigateToUserWithQuery(userId: string, tab: string) {
    this.router.navigate(['/users', userId], {
      queryParams: { tab },
    });
  }

  navigateToUserWithFragment(userId: string, section: string) {
    this.router.navigate(['/users', userId], {
      fragment: section,
    });
  }
}
```

### Route State Management

```ts
// src/app/services/route-state.service.ts
import { Injectable, inject } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class RouteStateService {
  private router = inject(Router);
  private routeHistory: string[] = [];

  constructor() {
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

## Testing

### Unit Testing Routes

```ts
// user-detail.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import UserDetailComponent from './user-detail.component';

describe('UserDetailComponent', () => {
  let component: UserDetailComponent;
  let fixture: ComponentFixture<UserDetailComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UserDetailComponent],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(new Map([['id', '123']])),
            data: of({ user: { id: 123, name: 'John Doe' } }),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UserDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should display user name', () => {
    const compiled = fixture.nativeElement;
    expect(compiled.querySelector('h1').textContent).toContain('John Doe');
  });
});
```

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

### 1. Route Organization

- Group related routes in folders
- Use descriptive file names
- Keep route components focused and lightweight

### 2. Performance

- Use lazy loading for feature modules
- Implement proper route guards
- Cache route data when appropriate

### 3. Security

- Always validate route parameters
- Implement proper authentication guards
- Sanitize user inputs

### 4. SEO

- Set proper meta tags for each route
- Use semantic URLs
- Implement proper redirects

### 5. Accessibility

- Use semantic HTML in route templates
- Provide proper ARIA labels
- Ensure keyboard navigation works

## Related Documentation

- [File-based Routing Overview](/docs/features/routing/overview)
- [Advanced Routing Patterns](/docs/features/routing/advanced)
- [Route Metadata](/docs/features/routing/metadata)
- [Content Routes](/docs/features/routing/content)

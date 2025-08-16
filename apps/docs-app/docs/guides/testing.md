---
sidebar_position: 4
---

# Testing Best Practices

This guide covers comprehensive testing strategies and best practices for Analog applications, including unit testing, integration testing, and end-to-end testing.

## Testing Strategy Overview

A comprehensive testing strategy for Analog applications should include:

- **Unit Tests**: Test individual components, services, and utilities
- **Integration Tests**: Test component interactions and API integration
- **E2E Tests**: Test complete user workflows
- **Performance Tests**: Test application performance and load handling
- **Accessibility Tests**: Ensure applications are accessible to all users

## Unit Testing with Vitest

### Component Testing

```ts title="user-card.component.spec.ts - Component unit test example"
// src/app/components/user-card/user-card.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UserCardComponent } from './user-card.component';
import { User } from '../../models/user.model';

describe('UserCardComponent', () => {
  let component: UserCardComponent;
  let fixture: ComponentFixture<UserCardComponent>;

  const mockUser: User = {
    id: 1,
    name: 'John Doe',
    email: 'john@example.com',
    role: 'user',
    avatar: 'https://example.com/avatar.jpg',
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UserCardComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(UserCardComponent);
    component = fixture.componentInstance;
    component.user = mockUser;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display user information', () => {
    const compiled = fixture.nativeElement;

    expect(
      compiled.querySelector('[data-testid="user-name"]').textContent,
    ).toContain('John Doe');
    expect(
      compiled.querySelector('[data-testid="user-email"]').textContent,
    ).toContain('john@example.com');
    expect(
      compiled.querySelector('[data-testid="user-role"]').textContent,
    ).toContain('user');
  });

  it('should emit edit event when edit button is clicked', () => {
    const editSpy = jest.fn();
    component.edit.emit = editSpy;

    const editButton = fixture.nativeElement.querySelector(
      '[data-testid="edit-button"]',
    );
    editButton.click();

    expect(editSpy).toHaveBeenCalledWith(mockUser);
  });

  it('should show admin badge for admin users', () => {
    component.user = { ...mockUser, role: 'admin' };
    fixture.detectChanges();

    const adminBadge = fixture.nativeElement.querySelector(
      '[data-testid="admin-badge"]',
    );
    expect(adminBadge).toBeTruthy();
  });

  it('should not show admin badge for regular users', () => {
    const adminBadge = fixture.nativeElement.querySelector(
      '[data-testid="admin-badge"]',
    );
    expect(adminBadge).toBeFalsy();
  });
});
```

### Service Testing

```ts title="user.service.spec.ts - Service unit test example"
// src/app/services/user.service.spec.ts
import { TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { UserService } from './user.service';
import { User } from '../models/user.model';

describe('UserService', () => {
  let service: UserService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [UserService],
    });

    service = TestBed.inject(UserService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should fetch users', (done) => {
    const mockUsers: User[] = [
      { id: 1, name: 'John Doe', email: 'john@example.com', role: 'user' },
      { id: 2, name: 'Jane Smith', email: 'jane@example.com', role: 'admin' },
    ];

    service.getUsers().subscribe({
      next: (users) => {
        expect(users).toEqual(mockUsers);
        done();
      },
      error: done,
    });

    const req = httpMock.expectOne('/api/users');
    expect(req.request.method).toBe('GET');
    req.flush(mockUsers);
  });

  it('should create a new user', (done) => {
    const newUser: Omit<User, 'id'> = {
      name: 'New User',
      email: 'new@example.com',
      role: 'user',
    };

    const createdUser: User = { ...newUser, id: 3 };

    service.createUser(newUser).subscribe({
      next: (user) => {
        expect(user).toEqual(createdUser);
        done();
      },
      error: done,
    });

    const req = httpMock.expectOne('/api/users');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(newUser);
    req.flush(createdUser);
  });

  it('should handle errors gracefully', (done) => {
    service.getUsers().subscribe({
      next: () => {
        fail('Should have failed');
      },
      error: (error) => {
        expect(error.status).toBe(500);
        expect(error.message).toBe('Internal Server Error');
        done();
      },
    });

    const req = httpMock.expectOne('/api/users');
    req.flush('Internal Server Error', {
      status: 500,
      statusText: 'Internal Server Error',
    });
  });
});
```

### Route Testing

```ts
// src/app/pages/users/[id].page.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { UserDetailComponent } from './user-detail.component';
import { UserService } from '../../services/user.service';

describe('UserDetailComponent', () => {
  let component: UserDetailComponent;
  let fixture: ComponentFixture<UserDetailComponent>;
  let userService: jest.Mocked<UserService>;

  const mockUser = {
    id: 1,
    name: 'John Doe',
    email: 'john@example.com',
    role: 'user',
  };

  beforeEach(async () => {
    const userServiceMock = {
      getUserById: jest.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [UserDetailComponent],
      providers: [
        {
          provide: UserService,
          useValue: userServiceMock,
        },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(new Map([['id', '1']])),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UserDetailComponent);
    component = fixture.componentInstance;
    userService = TestBed.inject(UserService) as jest.Mocked<UserService>;
  });

  it('should load user data on init', () => {
    userService.getUserById.mockReturnValue(of(mockUser));

    component.ngOnInit();

    expect(userService.getUserById).toHaveBeenCalledWith(1);
    expect(component.user()).toEqual(mockUser);
  });

  it('should handle user not found', () => {
    userService.getUserById.mockReturnValue(of(null));

    component.ngOnInit();

    expect(component.user()).toBeNull();
    expect(component.error()).toBeTruthy();
  });
});
```

## Integration Testing

### Component Integration

```ts
// src/app/components/user-list/user-list.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { UserListComponent } from './user-list.component';
import { UserService } from '../../services/user.service';
import { UserCardComponent } from '../user-card/user-card.component';

describe('UserListComponent Integration', () => {
  let component: UserListComponent;
  let fixture: ComponentFixture<UserListComponent>;
  let userService: UserService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UserListComponent, UserCardComponent, HttpClientTestingModule],
      providers: [UserService],
    }).compileComponents();

    fixture = TestBed.createComponent(UserListComponent);
    component = fixture.componentInstance;
    userService = TestBed.inject(UserService);
  });

  it('should display users from service', async () => {
    const mockUsers = [
      { id: 1, name: 'John Doe', email: 'john@example.com', role: 'user' },
      { id: 2, name: 'Jane Smith', email: 'jane@example.com', role: 'admin' },
    ];

    jest.spyOn(userService, 'getUsers').mockReturnValue(of(mockUsers));

    component.ngOnInit();
    fixture.detectChanges();

    await fixture.whenStable();

    const userCards = fixture.nativeElement.querySelectorAll('app-user-card');
    expect(userCards.length).toBe(2);
  });

  it('should handle user selection', async () => {
    const mockUsers = [
      { id: 1, name: 'John Doe', email: 'john@example.com', role: 'user' },
    ];

    jest.spyOn(userService, 'getUsers').mockReturnValue(of(mockUsers));

    component.ngOnInit();
    fixture.detectChanges();

    await fixture.whenStable();

    const userCard = fixture.nativeElement.querySelector('app-user-card');
    const selectButton = userCard.querySelector(
      '[data-testid="select-button"]',
    );

    selectButton.click();
    fixture.detectChanges();

    expect(component.selectedUser()).toEqual(mockUsers[0]);
  });
});
```

### API Integration Testing

```ts
// src/app/services/api-integration.spec.ts
import { TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { UserService } from './user.service';
import { AuthService } from './auth.service';

describe('API Integration', () => {
  let userService: UserService;
  let authService: AuthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [UserService, AuthService],
    });

    userService = TestBed.inject(UserService);
    authService = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should include auth token in requests', () => {
    const token = 'test-token';
    jest.spyOn(authService, 'getToken').mockReturnValue(token);

    userService.getUsers().subscribe();

    const req = httpMock.expectOne('/api/users');
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${token}`);
    req.flush([]);
  });

  it('should handle token expiration', () => {
    userService.getUsers().subscribe({
      next: () => fail('Should have failed'),
      error: (error) => {
        expect(error.status).toBe(401);
      },
    });

    const req = httpMock.expectOne('/api/users');
    req.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });
  });
});
```

## End-to-End Testing with Playwright

### User Workflow Testing

```ts
// tests/e2e/user-workflow.spec.ts
import { test, expect } from '@playwright/test';

test.describe('User Workflow', () => {
  test('should complete user registration and login', async ({ page }) => {
    // Navigate to registration page
    await page.goto('/register');

    // Fill registration form
    await page.fill('[data-testid="name-input"]', 'Test User');
    await page.fill('[data-testid="email-input"]', 'test@example.com');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.fill('[data-testid="confirm-password-input"]', 'password123');

    // Submit registration
    await page.click('[data-testid="register-button"]');

    // Verify redirect to login
    await expect(page).toHaveURL('/login');

    // Login with new credentials
    await page.fill('[data-testid="email-input"]', 'test@example.com');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.click('[data-testid="login-button"]');

    // Verify successful login
    await expect(page).toHaveURL('/dashboard');
    await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
  });

  test('should create and edit a blog post', async ({ page }) => {
    // Login first
    await page.goto('/login');
    await page.fill('[data-testid="email-input"]', 'admin@example.com');
    await page.fill('[data-testid="password-input"]', 'admin123');
    await page.click('[data-testid="login-button"]');

    // Navigate to blog management
    await page.click('[data-testid="blog-menu"]');
    await page.click('[data-testid="new-post-button"]');

    // Create new post
    await page.fill('[data-testid="title-input"]', 'Test Blog Post');
    await page.fill(
      '[data-testid="content-input"]',
      'This is a test blog post content.',
    );
    await page.click('[data-testid="publish-button"]');

    // Verify post creation
    await expect(page.locator('text=Test Blog Post')).toBeVisible();

    // Edit the post
    await page.click('[data-testid="edit-button"]');
    await page.fill('[data-testid="title-input"]', 'Updated Blog Post');
    await page.click('[data-testid="save-button"]');

    // Verify post update
    await expect(page.locator('text=Updated Blog Post')).toBeVisible();
  });
});
```

### Cross-Browser Testing

```ts
// tests/e2e/cross-browser.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Cross-Browser Compatibility', () => {
  test('should work across different browsers', async ({ page }) => {
    await page.goto('/');

    // Test basic functionality
    await expect(page.locator('h1')).toBeVisible();

    // Test navigation
    await page.click('a[href="/about"]');
    await expect(page).toHaveURL('/about');

    // Test form interaction
    await page.goto('/contact');
    await page.fill('[data-testid="name-input"]', 'Test User');
    await page.fill('[data-testid="email-input"]', 'test@example.com');
    await page.fill('[data-testid="message-input"]', 'Test message');

    // Test responsive design
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.locator('[data-testid="mobile-menu"]')).toBeVisible();

    await page.setViewportSize({ width: 1920, height: 1080 });
    await expect(page.locator('[data-testid="desktop-menu"]')).toBeVisible();
  });
});
```

## Performance Testing

### Load Testing

```ts
// tests/performance/load-testing.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Performance Tests', () => {
  test('should load home page within 2 seconds', async ({ page }) => {
    const startTime = Date.now();

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const loadTime = Date.now() - startTime;
    expect(loadTime).toBeLessThan(2000);
  });

  test('should handle concurrent users', async ({ browser }) => {
    const contexts = await Promise.all([
      browser.newContext(),
      browser.newContext(),
      browser.newContext(),
    ]);

    const pages = await Promise.all(
      contexts.map((context) => context.newPage()),
    );

    // Navigate all pages simultaneously
    await Promise.all(pages.map((page) => page.goto('/')));

    // Verify all pages loaded successfully
    for (const page of pages) {
      await expect(page.locator('h1')).toBeVisible();
    }

    // Clean up
    await Promise.all(contexts.map((context) => context.close()));
  });

  test('should maintain performance with large data sets', async ({ page }) => {
    await page.goto('/users');

    // Wait for data to load
    await page.waitForSelector('[data-testid="user-card"]');

    // Measure rendering time
    const startTime = Date.now();
    await page.waitForLoadState('networkidle');
    const renderTime = Date.now() - startTime;

    expect(renderTime).toBeLessThan(1000);

    // Verify all users are displayed
    const userCards = await page.locator('[data-testid="user-card"]').count();
    expect(userCards).toBeGreaterThan(0);
  });
});
```

## Accessibility Testing

### Automated Accessibility Testing

```ts
// tests/accessibility/a11y.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Accessibility', () => {
  test('should meet WCAG 2.1 AA standards', async ({ page }) => {
    await page.goto('/');

    // Test keyboard navigation
    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toBeVisible();

    // Test ARIA labels
    const buttons = await page.locator('button').all();
    for (const button of buttons) {
      const ariaLabel = await button.getAttribute('aria-label');
      if (!ariaLabel) {
        const text = await button.textContent();
        expect(text).toBeTruthy();
      }
    }

    // Test color contrast (basic check)
    const textElements = await page.locator('p, h1, h2, h3, h4, h5, h6').all();
    for (const element of textElements) {
      const color = await element.evaluate(
        (el) => window.getComputedStyle(el).color,
      );
      expect(color).not.toBe('rgba(0, 0, 0, 0)');
    }
  });

  test('should work with screen readers', async ({ page }) => {
    await page.goto('/');

    // Test semantic HTML
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('nav')).toBeVisible();

    // Test heading hierarchy
    const headings = await page.locator('h1, h2, h3, h4, h5, h6').all();
    let previousLevel = 0;

    for (const heading of headings) {
      const tagName = await heading.evaluate((el) => el.tagName.toLowerCase());
      const level = parseInt(tagName.charAt(1));

      // Check for proper heading hierarchy
      expect(level - previousLevel).toBeLessThanOrEqual(1);
      previousLevel = level;
    }
  });
});
```

## Testing Utilities and Helpers

### Custom Testing Utilities

```ts
// tests/utils/test-helpers.ts
import { ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

export class TestHelpers {
  static clickElement<T>(fixture: ComponentFixture<T>, testId: string): void {
    const element = fixture.debugElement.query(
      By.css(`[data-testid="${testId}"]`),
    );
    element.nativeElement.click();
    fixture.detectChanges();
  }

  static setInputValue<T>(
    fixture: ComponentFixture<T>,
    testId: string,
    value: string,
  ): void {
    const element = fixture.debugElement.query(
      By.css(`[data-testid="${testId}"]`),
    );
    element.nativeElement.value = value;
    element.nativeElement.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  static getElementText<T>(
    fixture: ComponentFixture<T>,
    testId: string,
  ): string {
    const element = fixture.debugElement.query(
      By.css(`[data-testid="${testId}"]`),
    );
    return element.nativeElement.textContent.trim();
  }

  static expectElementToBeVisible<T>(
    fixture: ComponentFixture<T>,
    testId: string,
  ): void {
    const element = fixture.debugElement.query(
      By.css(`[data-testid="${testId}"]`),
    );
    expect(element).toBeTruthy();
  }

  static expectElementToNotBeVisible<T>(
    fixture: ComponentFixture<T>,
    testId: string,
  ): void {
    const element = fixture.debugElement.query(
      By.css(`[data-testid="${testId}"]`),
    );
    expect(element).toBeFalsy();
  }
}
```

### Mock Data Factories

```ts
// tests/utils/mock-data.ts
import { User, Post, Comment } from '../../src/app/models';

export class MockDataFactory {
  static createUser(overrides: Partial<User> = {}): User {
    return {
      id: 1,
      name: 'Test User',
      email: 'test@example.com',
      role: 'user',
      avatar: 'https://example.com/avatar.jpg',
      ...overrides,
    };
  }

  static createUsers(count: number): User[] {
    return Array.from({ length: count }, (_, i) =>
      this.createUser({
        id: i + 1,
        name: `User ${i + 1}`,
        email: `user${i + 1}@example.com`,
      }),
    );
  }

  static createPost(overrides: Partial<Post> = {}): Post {
    return {
      id: 1,
      title: 'Test Post',
      content: 'This is a test post content.',
      author: this.createUser(),
      publishedAt: new Date(),
      tags: ['test', 'example'],
      ...overrides,
    };
  }

  static createComment(overrides: Partial<Comment> = {}): Comment {
    return {
      id: 1,
      content: 'This is a test comment.',
      author: this.createUser(),
      createdAt: new Date(),
      ...overrides,
    };
  }
}
```

## CI/CD Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/test.yml
name: Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  unit-tests:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: 18
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run unit tests
        run: npm run test

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          file: ./coverage/lcov.info

  e2e-tests:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: 18
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install --with-deps

      - name: Build application
        run: npm run build

      - name: Run E2E tests
        run: npm run test:e2e

      - name: Upload test results
        uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 30

  performance-tests:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: 18
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run performance tests
        run: npm run test:performance
```

## Best Practices Summary

### 1. Test Organization

- **Structure**: Organize tests by feature/component
- **Naming**: Use descriptive test names
- **Isolation**: Keep tests independent
- **Setup**: Use beforeEach/afterEach for common setup

### 2. Test Coverage

- **Critical Paths**: Test main user workflows
- **Edge Cases**: Test error conditions and boundary values
- **Accessibility**: Ensure applications are accessible
- **Performance**: Test under load conditions

### 3. Test Data

- **Factories**: Use mock data factories
- **Fixtures**: Create reusable test data
- **Cleanup**: Clean up test data after tests
- **Realistic**: Use realistic test data

### 4. Assertions

- **Specific**: Make assertions specific and meaningful
- **Descriptive**: Use descriptive assertion messages
- **Complete**: Test all relevant aspects
- **Maintainable**: Keep assertions maintainable

### 5. Performance

- **Fast**: Keep tests fast and efficient
- **Parallel**: Run tests in parallel when possible
- **Caching**: Use test result caching
- **Monitoring**: Monitor test performance

## Related Documentation

- [Vitest Testing](/docs/features/testing/vitest)
- [Playwright Testing](/docs/features/testing/playwright)
- [Testing Overview](/docs/features/testing/overview)
- [Performance Optimization](/docs/guides/performance)

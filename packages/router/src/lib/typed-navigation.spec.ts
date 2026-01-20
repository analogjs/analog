import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, RouterOutlet } from '@angular/router';
import { provideLocationMocks } from '@angular/common/testing';
import { describe, expect, it, vi } from 'vitest';
import { injectNavigate, injectNavigateByUrl } from './typed-navigation';
import { TypedRoute } from './route-builder';

/**
 * These tests verify the runtime behavior of the typed navigation functions.
 * We use type assertions to TypedRoute to bypass TypeScript's type checking
 * because the actual type constraints require routes.d.ts to be generated.
 */

describe('typed-navigation', () => {
  @Component({
    imports: [RouterOutlet],
    template: '<router-outlet></router-outlet>',
  })
  class TestComponent {}

  function setup() {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: '', component: TestComponent },
          { path: 'about', component: TestComponent },
          { path: 'products/:productId', component: TestComponent },
          {
            path: 'categories/:categoryId/products/:productId',
            component: TestComponent,
          },
        ]),
        provideLocationMocks(),
      ],
    });

    const router = TestBed.inject(Router);
    return { router };
  }

  describe('injectNavigate', () => {
    it('should return a navigate function', () => {
      setup();

      const navigate = TestBed.runInInjectionContext(() => injectNavigate());

      expect(typeof navigate).toBe('function');
    });

    it('should navigate to a static route', async () => {
      const { router } = setup();
      const navigateSpy = vi.spyOn(router, 'navigate');

      const navigate = TestBed.runInInjectionContext(() => injectNavigate());
      await navigate('/about' as TypedRoute);

      expect(navigateSpy).toHaveBeenCalledWith(['/about'], undefined);
    });

    it('should navigate to a dynamic route with params', async () => {
      const { router } = setup();
      const navigateSpy = vi.spyOn(router, 'navigate');

      const navigate = TestBed.runInInjectionContext(() => injectNavigate());
      await navigate('/products/[productId]' as TypedRoute, {
        productId: '123',
      });

      expect(navigateSpy).toHaveBeenCalledWith(['/products/123'], undefined);
    });

    it('should navigate with multiple params', async () => {
      const { router } = setup();
      const navigateSpy = vi.spyOn(router, 'navigate');

      const navigate = TestBed.runInInjectionContext(() => injectNavigate());
      await navigate(
        '/categories/[categoryId]/products/[productId]' as TypedRoute,
        {
          categoryId: 'electronics',
          productId: '456',
        },
      );

      expect(navigateSpy).toHaveBeenCalledWith(
        ['/categories/electronics/products/456'],
        undefined,
      );
    });

    it('should pass navigation extras', async () => {
      const { router } = setup();
      const navigateSpy = vi.spyOn(router, 'navigate');

      const navigate = TestBed.runInInjectionContext(() => injectNavigate());
      await navigate('/about' as TypedRoute, undefined, {
        replaceUrl: true,
        queryParams: { ref: 'home' },
      });

      expect(navigateSpy).toHaveBeenCalledWith(['/about'], {
        replaceUrl: true,
        queryParams: { ref: 'home' },
      });
    });

    it('should pass navigation extras with dynamic route', async () => {
      const { router } = setup();
      const navigateSpy = vi.spyOn(router, 'navigate');

      const navigate = TestBed.runInInjectionContext(() => injectNavigate());
      await navigate(
        '/products/[productId]' as TypedRoute,
        { productId: '123' },
        { fragment: 'details' },
      );

      expect(navigateSpy).toHaveBeenCalledWith(['/products/123'], {
        fragment: 'details',
      });
    });

    it('should return a promise from router.navigate', async () => {
      setup();

      const navigate = TestBed.runInInjectionContext(() => injectNavigate());
      const result = await navigate('/about' as TypedRoute);

      expect(typeof result).toBe('boolean');
    });

    it('should work outside injection context after being injected', async () => {
      const { router } = setup();
      const navigateSpy = vi.spyOn(router, 'navigate');

      // Inject the navigate function within injection context
      const navigate = TestBed.runInInjectionContext(() => injectNavigate());

      // Call it outside injection context (simulating event handler)
      await navigate('/products/[productId]' as TypedRoute, {
        productId: '789',
      });

      expect(navigateSpy).toHaveBeenCalledWith(['/products/789'], undefined);
    });
  });

  describe('injectNavigateByUrl', () => {
    it('should return a navigateByUrl function', () => {
      setup();

      const navigateByUrl = TestBed.runInInjectionContext(() =>
        injectNavigateByUrl(),
      );

      expect(typeof navigateByUrl).toBe('function');
    });

    it('should navigate to a static route', async () => {
      const { router } = setup();
      const navigateByUrlSpy = vi.spyOn(router, 'navigateByUrl');

      const navigateByUrl = TestBed.runInInjectionContext(() =>
        injectNavigateByUrl(),
      );
      await navigateByUrl('/about' as TypedRoute);

      expect(navigateByUrlSpy).toHaveBeenCalledWith('/about', undefined);
    });

    it('should navigate to a dynamic route with params', async () => {
      const { router } = setup();
      const navigateByUrlSpy = vi.spyOn(router, 'navigateByUrl');

      const navigateByUrl = TestBed.runInInjectionContext(() =>
        injectNavigateByUrl(),
      );
      await navigateByUrl('/products/[productId]' as TypedRoute, {
        productId: '123',
      });

      expect(navigateByUrlSpy).toHaveBeenCalledWith('/products/123', undefined);
    });

    it('should navigate with multiple params', async () => {
      const { router } = setup();
      const navigateByUrlSpy = vi.spyOn(router, 'navigateByUrl');

      const navigateByUrl = TestBed.runInInjectionContext(() =>
        injectNavigateByUrl(),
      );
      await navigateByUrl(
        '/categories/[categoryId]/products/[productId]' as TypedRoute,
        {
          categoryId: 'electronics',
          productId: '456',
        },
      );

      expect(navigateByUrlSpy).toHaveBeenCalledWith(
        '/categories/electronics/products/456',
        undefined,
      );
    });

    it('should pass navigation behavior options', async () => {
      const { router } = setup();
      const navigateByUrlSpy = vi.spyOn(router, 'navigateByUrl');

      const navigateByUrl = TestBed.runInInjectionContext(() =>
        injectNavigateByUrl(),
      );
      await navigateByUrl('/about' as TypedRoute, undefined, {
        replaceUrl: true,
      });

      expect(navigateByUrlSpy).toHaveBeenCalledWith('/about', {
        replaceUrl: true,
      });
    });

    it('should pass navigation behavior options with dynamic route', async () => {
      const { router } = setup();
      const navigateByUrlSpy = vi.spyOn(router, 'navigateByUrl');

      const navigateByUrl = TestBed.runInInjectionContext(() =>
        injectNavigateByUrl(),
      );
      await navigateByUrl(
        '/products/[productId]' as TypedRoute,
        { productId: '123' },
        { skipLocationChange: true },
      );

      expect(navigateByUrlSpy).toHaveBeenCalledWith('/products/123', {
        skipLocationChange: true,
      });
    });

    it('should return a promise from router.navigateByUrl', async () => {
      setup();

      const navigateByUrl = TestBed.runInInjectionContext(() =>
        injectNavigateByUrl(),
      );
      const result = await navigateByUrl('/about' as TypedRoute);

      expect(typeof result).toBe('boolean');
    });

    it('should work outside injection context after being injected', async () => {
      const { router } = setup();
      const navigateByUrlSpy = vi.spyOn(router, 'navigateByUrl');

      // Inject the navigateByUrl function within injection context
      const navigateByUrl = TestBed.runInInjectionContext(() =>
        injectNavigateByUrl(),
      );

      // Call it outside injection context (simulating event handler)
      await navigateByUrl('/products/[productId]' as TypedRoute, {
        productId: '789',
      });

      expect(navigateByUrlSpy).toHaveBeenCalledWith('/products/789', undefined);
    });
  });
});

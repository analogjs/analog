import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, RouterOutlet } from '@angular/router';
import { provideLocationMocks } from '@angular/common/testing';
import { describe, expect, it, vi } from 'vitest';
import { navigate, navigateByUrl } from './typed-navigation';
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

  describe('navigate', () => {
    it('should navigate to a static route', async () => {
      const { router } = setup();
      const navigateSpy = vi.spyOn(router, 'navigate');

      await TestBed.runInInjectionContext(() =>
        navigate('/about' as TypedRoute),
      );

      expect(navigateSpy).toHaveBeenCalledWith(['/about'], undefined);
    });

    it('should navigate to a dynamic route with params', async () => {
      const { router } = setup();
      const navigateSpy = vi.spyOn(router, 'navigate');

      await TestBed.runInInjectionContext(() =>
        navigate('/products/[productId]' as TypedRoute, { productId: '123' }),
      );

      expect(navigateSpy).toHaveBeenCalledWith(['/products/123'], undefined);
    });

    it('should navigate with multiple params', async () => {
      const { router } = setup();
      const navigateSpy = vi.spyOn(router, 'navigate');

      await TestBed.runInInjectionContext(() =>
        navigate(
          '/categories/[categoryId]/products/[productId]' as TypedRoute,
          {
            categoryId: 'electronics',
            productId: '456',
          },
        ),
      );

      expect(navigateSpy).toHaveBeenCalledWith(
        ['/categories/electronics/products/456'],
        undefined,
      );
    });

    it('should pass navigation extras', async () => {
      const { router } = setup();
      const navigateSpy = vi.spyOn(router, 'navigate');

      await TestBed.runInInjectionContext(() =>
        navigate('/about' as TypedRoute, undefined, {
          replaceUrl: true,
          queryParams: { ref: 'home' },
        }),
      );

      expect(navigateSpy).toHaveBeenCalledWith(['/about'], {
        replaceUrl: true,
        queryParams: { ref: 'home' },
      });
    });

    it('should pass navigation extras with dynamic route', async () => {
      const { router } = setup();
      const navigateSpy = vi.spyOn(router, 'navigate');

      await TestBed.runInInjectionContext(() =>
        navigate(
          '/products/[productId]' as TypedRoute,
          { productId: '123' },
          { fragment: 'details' },
        ),
      );

      expect(navigateSpy).toHaveBeenCalledWith(['/products/123'], {
        fragment: 'details',
      });
    });

    it('should return a promise from router.navigate', async () => {
      setup();

      const result = await TestBed.runInInjectionContext(() =>
        navigate('/about' as TypedRoute),
      );

      expect(typeof result).toBe('boolean');
    });
  });

  describe('navigateByUrl', () => {
    it('should navigate to a static route', async () => {
      const { router } = setup();
      const navigateByUrlSpy = vi.spyOn(router, 'navigateByUrl');

      await TestBed.runInInjectionContext(() =>
        navigateByUrl('/about' as TypedRoute),
      );

      expect(navigateByUrlSpy).toHaveBeenCalledWith('/about', undefined);
    });

    it('should navigate to a dynamic route with params', async () => {
      const { router } = setup();
      const navigateByUrlSpy = vi.spyOn(router, 'navigateByUrl');

      await TestBed.runInInjectionContext(() =>
        navigateByUrl('/products/[productId]' as TypedRoute, {
          productId: '123',
        }),
      );

      expect(navigateByUrlSpy).toHaveBeenCalledWith('/products/123', undefined);
    });

    it('should navigate with multiple params', async () => {
      const { router } = setup();
      const navigateByUrlSpy = vi.spyOn(router, 'navigateByUrl');

      await TestBed.runInInjectionContext(() =>
        navigateByUrl(
          '/categories/[categoryId]/products/[productId]' as TypedRoute,
          {
            categoryId: 'electronics',
            productId: '456',
          },
        ),
      );

      expect(navigateByUrlSpy).toHaveBeenCalledWith(
        '/categories/electronics/products/456',
        undefined,
      );
    });

    it('should pass navigation behavior options', async () => {
      const { router } = setup();
      const navigateByUrlSpy = vi.spyOn(router, 'navigateByUrl');

      await TestBed.runInInjectionContext(() =>
        navigateByUrl('/about' as TypedRoute, undefined, { replaceUrl: true }),
      );

      expect(navigateByUrlSpy).toHaveBeenCalledWith('/about', {
        replaceUrl: true,
      });
    });

    it('should pass navigation behavior options with dynamic route', async () => {
      const { router } = setup();
      const navigateByUrlSpy = vi.spyOn(router, 'navigateByUrl');

      await TestBed.runInInjectionContext(() =>
        navigateByUrl(
          '/products/[productId]' as TypedRoute,
          { productId: '123' },
          { skipLocationChange: true },
        ),
      );

      expect(navigateByUrlSpy).toHaveBeenCalledWith('/products/123', {
        skipLocationChange: true,
      });
    });

    it('should return a promise from router.navigateByUrl', async () => {
      setup();

      const result = await TestBed.runInInjectionContext(() =>
        navigateByUrl('/about' as TypedRoute),
      );

      expect(typeof result).toBe('boolean');
    });
  });
});

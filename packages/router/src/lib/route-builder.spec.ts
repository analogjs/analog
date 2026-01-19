import { describe, expect, it } from 'vitest';
import { route, TypedRoute } from './route-builder';

/**
 * These tests verify the runtime behavior of the route builder.
 * We use type assertions to TypedRoute to bypass TypeScript's type checking
 * because the actual type constraints require routes.d.ts to be generated.
 * The type safety is tested separately via compilation tests.
 */

describe('route-builder', () => {
  describe('route', () => {
    describe('static routes', () => {
      it('should return the path as-is for static routes', () => {
        expect(route('/' as TypedRoute)).toBe('/');
        expect(route('/about' as TypedRoute)).toBe('/about');
        expect(route('/products' as TypedRoute)).toBe('/products');
      });

      it('should handle nested static paths', () => {
        expect(route('/admin/settings' as TypedRoute)).toBe('/admin/settings');
        expect(route('/auth/login' as TypedRoute)).toBe('/auth/login');
      });
    });

    describe('dynamic routes', () => {
      it('should substitute a single parameter', () => {
        const result = route('/products/[productId]' as TypedRoute, {
          productId: '123',
        });
        expect(result).toBe('/products/123');
      });

      it('should substitute multiple parameters', () => {
        const result = route(
          '/categories/[categoryId]/products/[productId]' as TypedRoute,
          {
            categoryId: 'electronics',
            productId: '456',
          },
        );
        expect(result).toBe('/categories/electronics/products/456');
      });

      it('should handle numeric parameters', () => {
        const result = route('/products/[productId]' as TypedRoute, {
          productId: 123,
        });
        expect(result).toBe('/products/123');
      });

      it('should handle parameters at the start of the path', () => {
        const result = route('/[slug]' as TypedRoute, { slug: 'hello-world' });
        expect(result).toBe('/hello-world');
      });

      it('should handle consecutive dynamic segments', () => {
        const result = route('/[categoryId]/[productId]' as TypedRoute, {
          categoryId: 'books',
          productId: '789',
        });
        expect(result).toBe('/books/789');
      });
    });

    describe('catch-all routes', () => {
      it('should substitute catch-all parameters', () => {
        const result = route('/[...slug]' as TypedRoute, {
          slug: 'docs/getting-started',
        });
        expect(result).toBe('/docs/getting-started');
      });

      it('should handle nested catch-all routes', () => {
        const result = route('/docs/[...slug]' as TypedRoute, {
          slug: 'api/reference',
        });
        expect(result).toBe('/docs/api/reference');
      });

      it('should handle catch-all with hyphenated names', () => {
        const result = route('/[...not-found]' as TypedRoute, {
          'not-found': 'some/path',
        });
        expect(result).toBe('/some/path');
      });
    });

    describe('edge cases', () => {
      it('should return path unchanged if params is undefined', () => {
        expect(route('/about' as TypedRoute, undefined)).toBe('/about');
      });

      it('should return path unchanged if params is empty object', () => {
        expect(route('/about' as TypedRoute, {})).toBe('/about');
      });

      it('should handle empty string parameter value', () => {
        const result = route('/products/[productId]' as TypedRoute, {
          productId: '',
        });
        expect(result).toBe('/products/');
      });

      it('should handle special characters in parameter values', () => {
        const result = route('/search/[query]' as TypedRoute, {
          query: 'hello world',
        });
        expect(result).toBe('/search/hello world');
      });

      it('should ignore extra parameters not in the path', () => {
        const result = route('/products/[productId]' as TypedRoute, {
          productId: '123',
          extraParam: 'ignored',
        });
        expect(result).toBe('/products/123');
      });
    });
  });
});

import { describe, expect, it } from 'vitest';
import { route } from './route-builder';

describe('route-builder', () => {
  describe('route', () => {
    describe('static routes', () => {
      it('should return the path as-is for static routes', () => {
        expect(route('/')).toBe('/');
        expect(route('/about')).toBe('/about');
        expect(route('/products')).toBe('/products');
      });

      it('should handle nested static paths', () => {
        expect(route('/admin/settings')).toBe('/admin/settings');
        expect(route('/auth/login')).toBe('/auth/login');
      });
    });

    describe('dynamic routes', () => {
      it('should substitute a single parameter', () => {
        const result = route('/products/[productId]', { productId: '123' });
        expect(result).toBe('/products/123');
      });

      it('should substitute multiple parameters', () => {
        const result = route('/categories/[categoryId]/products/[productId]', {
          categoryId: 'electronics',
          productId: '456',
        });
        expect(result).toBe('/categories/electronics/products/456');
      });

      it('should handle numeric parameters', () => {
        const result = route('/products/[productId]', { productId: 123 });
        expect(result).toBe('/products/123');
      });

      it('should handle parameters at the start of the path', () => {
        const result = route('/[slug]', { slug: 'hello-world' });
        expect(result).toBe('/hello-world');
      });

      it('should handle consecutive dynamic segments', () => {
        const result = route('/[categoryId]/[productId]', {
          categoryId: 'books',
          productId: '789',
        });
        expect(result).toBe('/books/789');
      });
    });

    describe('catch-all routes', () => {
      it('should substitute catch-all parameters', () => {
        const result = route('/[...slug]', { slug: 'docs/getting-started' });
        expect(result).toBe('/docs/getting-started');
      });

      it('should handle nested catch-all routes', () => {
        const result = route('/docs/[...slug]', { slug: 'api/reference' });
        expect(result).toBe('/docs/api/reference');
      });

      it('should handle catch-all with hyphenated names', () => {
        const result = route('/[...not-found]', { 'not-found': 'some/path' });
        expect(result).toBe('/some/path');
      });
    });

    describe('edge cases', () => {
      it('should return path unchanged if params is undefined', () => {
        expect(route('/about', undefined)).toBe('/about');
      });

      it('should return path unchanged if params is empty object', () => {
        expect(route('/about', {})).toBe('/about');
      });

      it('should handle empty string parameter value', () => {
        const result = route('/products/[productId]', { productId: '' });
        expect(result).toBe('/products/');
      });

      it('should handle special characters in parameter values', () => {
        const result = route('/search/[query]', { query: 'hello world' });
        expect(result).toBe('/search/hello world');
      });

      it('should ignore extra parameters not in the path', () => {
        const result = route('/products/[productId]', {
          productId: '123',
          extraParam: 'ignored',
        });
        expect(result).toBe('/products/123');
      });
    });
  });
});

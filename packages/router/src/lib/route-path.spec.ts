import { describe, expect, it } from 'vitest';

import { buildUrl } from './route-path';

// Test the internal buildUrl directly since routePath's type
// constraints depend on the generated route table augmentation.
describe('buildUrl', () => {
  describe('static routes', () => {
    it('should return static paths unchanged', () => {
      expect(buildUrl('/')).toBe('/');
      expect(buildUrl('/about')).toBe('/about');
      expect(buildUrl('/auth/login')).toBe('/auth/login');
    });
  });

  describe('dynamic params', () => {
    it('should replace a single dynamic param', () => {
      expect(buildUrl('/users/[id]', { params: { id: '42' } })).toBe(
        '/users/42',
      );
    });

    it('should replace multiple dynamic params', () => {
      expect(
        buildUrl('/categories/[categoryId]/products/[productId]', {
          params: { categoryId: 'shoes', productId: 'nike-air' },
        }),
      ).toBe('/categories/shoes/products/nike-air');
    });

    it('should encode special characters in dynamic params', () => {
      expect(buildUrl('/users/[id]', { params: { id: 'hello world' } })).toBe(
        '/users/hello%20world',
      );
    });

    it('should handle numeric-like params', () => {
      expect(buildUrl('/posts/[id]', { params: { id: '123' } })).toBe(
        '/posts/123',
      );
    });
  });

  describe('catch-all params', () => {
    it('should replace catch-all with joined segments', () => {
      expect(
        buildUrl('/docs/[...slug]', {
          params: { slug: ['api', 'auth', 'login'] },
        }),
      ).toBe('/docs/api/auth/login');
    });

    it('should replace catch-all with a single segment', () => {
      expect(
        buildUrl('/docs/[...slug]', {
          params: { slug: ['getting-started'] },
        }),
      ).toBe('/docs/getting-started');
    });

    it('should handle catch-all with string value', () => {
      expect(
        buildUrl('/docs/[...slug]', {
          params: { slug: 'single-page' },
        }),
      ).toBe('/docs/single-page');
    });

    it('should encode special characters in catch-all segments', () => {
      expect(
        buildUrl('/docs/[...slug]', {
          params: { slug: ['hello world', 'foo&bar'] },
        }),
      ).toBe('/docs/hello%20world/foo%26bar');
    });
  });

  describe('optional catch-all params', () => {
    it('should replace optional catch-all when value provided', () => {
      expect(
        buildUrl('/shop/[[...category]]', {
          params: { category: ['shoes', 'running'] },
        }),
      ).toBe('/shop/shoes/running');
    });

    it('should strip optional catch-all when no params given', () => {
      expect(buildUrl('/shop/[[...category]]')).toBe('/shop');
    });

    it('should strip optional catch-all when param is undefined', () => {
      expect(
        buildUrl('/shop/[[...category]]', {
          params: { category: undefined },
        }),
      ).toBe('/shop');
    });

    it('should handle root optional catch-all', () => {
      expect(buildUrl('/[[...slug]]')).toBe('/');
    });

    it('should handle root optional catch-all with value', () => {
      expect(
        buildUrl('/[[...slug]]', {
          params: { slug: ['docs', 'intro'] },
        }),
      ).toBe('/docs/intro');
    });
  });

  describe('query params', () => {
    it('should append query params', () => {
      expect(buildUrl('/users', { query: { page: '1', limit: '10' } })).toBe(
        '/users?page=1&limit=10',
      );
    });

    it('should handle array query params', () => {
      expect(buildUrl('/search', { query: { tag: ['js', 'ts'] } })).toBe(
        '/search?tag=js&tag=ts',
      );
    });

    it('should skip undefined query params', () => {
      expect(
        buildUrl('/users', {
          query: { page: '1', filter: undefined },
        }),
      ).toBe('/users?page=1');
    });

    it('should encode query params', () => {
      expect(buildUrl('/search', { query: { q: 'hello world' } })).toBe(
        '/search?q=hello%20world',
      );
    });

    it('should combine params and query', () => {
      expect(
        buildUrl('/users/[id]', {
          params: { id: '42' },
          query: { tab: 'settings' },
        }),
      ).toBe('/users/42?tab=settings');
    });
  });

  describe('hash', () => {
    it('should append hash', () => {
      expect(buildUrl('/about', { hash: 'team' })).toBe('/about#team');
    });

    it('should combine params, query, and hash', () => {
      expect(
        buildUrl('/users/[id]', {
          params: { id: '42' },
          query: { tab: 'profile' },
          hash: 'bio',
        }),
      ).toBe('/users/42?tab=profile#bio');
    });
  });

  describe('edge cases', () => {
    it('should clean up double slashes', () => {
      expect(buildUrl('//about//')).toBe('/about');
    });

    it('should ensure leading slash', () => {
      expect(buildUrl('about')).toBe('/about');
    });

    it('should handle empty string', () => {
      expect(buildUrl('')).toBe('/');
    });

    it('should strip bracket syntax when no params provided', () => {
      expect(buildUrl('/users/[id]')).toBe('/users');
      expect(buildUrl('/docs/[...slug]')).toBe('/docs');
    });
  });
});

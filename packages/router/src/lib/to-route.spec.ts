import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { describe, expect, it } from 'vitest';

import {
  buildRouteLink,
  buildUrl,
  resolveRoutePath,
  resolveScopedRoute,
  type RoutePathOptionsBase,
} from './to-route';

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
      ).toBe('/docs/hello%20world/foo&bar');
    });

    it('should reject empty arrays for required catch-all params', () => {
      expect(() =>
        buildUrl('/docs/[...slug]', {
          params: { slug: [] },
        }),
      ).toThrow(/Missing required catch-all param "slug"/);
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

    it('should convert number and boolean query values to strings', () => {
      expect(
        buildUrl('/search', { query: { page: 2, archived: true, id: [1, 2] } }),
      ).toBe('/search?page=2&archived=true&id=1&id=2');
    });

    it('should skip null and undefined query params', () => {
      expect(
        buildUrl('/users', {
          query: { page: '1', filter: undefined, sort: null },
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

    it('should reject missing required params', () => {
      expect(() => buildUrl('/users/[id]')).toThrow(/Missing required param/);
      expect(() => buildUrl('/docs/[...slug]')).toThrow(
        /Missing required catch-all param/,
      );
    });
  });
});

// Test buildRouteLink directly (same logic as toRoute, without generic constraints).
describe('buildRouteLink', () => {
  it('should return path only for static routes', () => {
    expect(buildRouteLink('/about')).toEqual({
      path: ['/', 'about'],
      queryParams: null,
      fragment: undefined,
    });
  });

  it('should resolve dynamic params in path', () => {
    const result = buildRouteLink('/users/[id]', { params: { id: '42' } });
    expect(result.path).toEqual(['/', 'users', '42']);
    expect(result.queryParams).toBeNull();
    expect(result.fragment).toBeUndefined();
  });

  it.each([0, 42, -1, 1.5])(
    'normalizes numeric parameter %s to a string',
    (id) => {
      expect(buildRouteLink('/users/[id]', { params: { id } }).path).toEqual([
        '/',
        'users',
        String(id),
      ]);
      expect(buildUrl('/users/[id]', { params: { id } })).toBe(`/users/${id}`);
    },
  );

  it('normalizes numeric catch-all segments without mutating the input', () => {
    const slug = ['a/b', 0, 42];
    expect(buildUrl('/docs/[...slug]', { params: { slug } })).toBe(
      '/docs/a%2Fb/0/42',
    );
    expect(slug).toEqual(['a/b', 0, 42]);
  });

  it('should separate query params from path', () => {
    const result = buildRouteLink('/users', {
      query: { page: '1', limit: '10' },
    });
    expect(result.path).toEqual(['/', 'users']);
    expect(result.queryParams).toEqual({ page: '1', limit: '10' });
  });

  it('should separate fragment from path', () => {
    const result = buildRouteLink('/about', { hash: 'team' });
    expect(result.path).toEqual(['/', 'about']);
    expect(result.fragment).toBe('team');
  });

  it('should handle params, query, and hash together', () => {
    expect(
      buildRouteLink('/users/[id]', {
        params: { id: '42' },
        query: { tab: 'profile' },
        hash: 'bio',
      }),
    ).toEqual({
      path: ['/', 'users', '42'],
      queryParams: { tab: 'profile' },
      fragment: 'bio',
    });
  });

  it('passes undefined query values through for Angular to omit or remove', () => {
    const result = buildRouteLink('/users', {
      query: { page: '1', filter: undefined },
    });
    expect(result.queryParams).toStrictEqual({ page: '1', filter: undefined });
  });

  it('should handle array query params', () => {
    const result = buildRouteLink('/search', {
      query: { tag: ['js', 'ts'] },
    });
    expect(result.queryParams).toEqual({ tag: ['js', 'ts'] });
  });
});

describe('Angular link serialization', () => {
  it('keeps each param value in a single segment', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const router = TestBed.inject(Router);
    for (const id of ['hello world', 'a/b', '%', '(aux)', '..']) {
      const link = buildRouteLink('/users/[id]', { params: { id } });
      const tree = router.createUrlTree(link.path);
      expect(tree.root.children['primary'].segments[1].path).toBe(id);
    }
  });
});

describe('resolveRoutePath', () => {
  it.each([
    ['/users/[id]', '.', '/users/[id]'],
    ['/users/[id]', './posts', '/users/[id]/posts'],
    ['/users/[id]', '..', '/users'],
    ['/users/[id]', '../new', '/users/new'],
    ['/users/[id]/posts/[postId]', '../../settings', '/users/[id]/settings'],
    ['/about', '..', '/'],
    ['/', './about', '/about'],
    ['/users/[id]', '/about', '/about'],
  ])('resolves %s + %s to %s', (from, to, expected) => {
    expect(resolveRoutePath(from, to)).toBe(expected);
  });
});

describe('resolveScopedRoute', () => {
  const current = { id: '42', postId: '7', slug: ['a', 'b'] };

  it('inherits params from leading segments shared with the current route', () => {
    const { path, options } = resolveScopedRoute(
      '/users/[id]/posts/[postId]',
      '../../settings',
      current,
    );
    expect(buildUrl(path, options)).toBe('/users/42/settings');
  });

  it('does not inherit same-named params after the paths diverge', () => {
    const { path, options } = resolveScopedRoute(
      '/users/[id]',
      '/posts/[id]',
      current,
      { params: { id: 'p1' } },
    );
    expect(buildUrl(path, options)).toBe('/posts/p1');
    expect(() => {
      const scoped = resolveScopedRoute('/users/[id]', '/posts/[id]', current);
      buildUrl(scoped.path, scoped.options);
    }).toThrow('Missing required param "id"');
  });

  it('lets explicit params, query, and hash override inherited values', () => {
    const { path, options } = resolveScopedRoute('/users/[id]', '.', current, {
      params: { id: 43 },
      query: { tab: 'bio' },
      hash: 'top',
    });
    expect(buildUrl(path, options)).toBe('/users/43?tab=bio#top');
  });

  it('inherits catch-all segments', () => {
    const { path, options } = resolveScopedRoute(
      '/docs/[...slug]',
      '.',
      current,
    );
    expect(buildUrl(path, options)).toBe('/docs/a/b');
  });
});

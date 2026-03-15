import { describe, expect, it, vi } from 'vitest';

import {
  filenameToRoutePath,
  extractRouteParams,
  generateRouteManifest,
  generateRouteTableDeclaration,
} from './route-manifest';

describe('filenameToRoutePath', () => {
  describe('static routes', () => {
    it('should handle a root static route', () => {
      expect(filenameToRoutePath('/app/routes/about.ts')).toBe('/about');
    });

    it('should handle a nested static route', () => {
      expect(filenameToRoutePath('/src/app/pages/auth/login.page.ts')).toBe(
        '/auth/login',
      );
    });

    it('should handle an index route', () => {
      expect(filenameToRoutePath('/app/routes/index.ts')).toBe('/');
    });

    it('should handle a nested index route', () => {
      expect(filenameToRoutePath('/src/app/pages/products/index.page.ts')).toBe(
        '/products',
      );
    });
  });

  describe('group segments', () => {
    it('should strip named index/group route', () => {
      expect(filenameToRoutePath('/app/routes/(home).ts')).toBe('/');
    });

    it('should strip single pathless group', () => {
      expect(filenameToRoutePath('/src/app/pages/(auth)/login.page.ts')).toBe(
        '/login',
      );
    });

    it('should strip multiple pathless groups', () => {
      expect(
        filenameToRoutePath('/src/app/pages/(foo)/auth/(bar)/login.page.ts'),
      ).toBe('/auth/login');
    });

    it('should strip pathless layout', () => {
      expect(filenameToRoutePath('/src/app/pages/(auth).page.ts')).toBe('/');
    });
  });

  describe('dynamic routes', () => {
    it('should handle a dynamic segment with dot notation', () => {
      expect(filenameToRoutePath('/app/routes/blog.[slug].ts')).toBe(
        '/blog/[slug]',
      );
    });

    it('should handle a nested dynamic segment', () => {
      expect(filenameToRoutePath('/src/app/pages/users/[id].page.ts')).toBe(
        '/users/[id]',
      );
    });

    it('should handle multiple dynamic segments with dot notation', () => {
      expect(
        filenameToRoutePath(
          '/app/routes/categories.[categoryId].products.[productId].ts',
        ),
      ).toBe('/categories/[categoryId]/products/[productId]');
    });

    it('should handle multiple dynamic segments with dot notation and page suffix', () => {
      expect(
        filenameToRoutePath('/app/pages/[productId].[partId].page.ts'),
      ).toBe('/[productId]/[partId]');
    });

    it('should handle a nested dynamic route', () => {
      expect(
        filenameToRoutePath('/src/app/pages/[categoryId]/[productId].page.ts'),
      ).toBe('/[categoryId]/[productId]');
    });
  });

  describe('catch-all routes', () => {
    it('should handle a root catch-all', () => {
      expect(filenameToRoutePath('/app/routes/[...not-found].ts')).toBe(
        '/[...not-found]',
      );
    });

    it('should handle a catch-all with page suffix', () => {
      expect(
        filenameToRoutePath('/src/app/pages/[...page-not-found].page.ts'),
      ).toBe('/[...page-not-found]');
    });

    it('should handle a nested catch-all', () => {
      expect(
        filenameToRoutePath('/src/app/pages/users/[...not-found].page.ts'),
      ).toBe('/users/[...not-found]');
    });
  });

  describe('optional catch-all routes', () => {
    it('should handle a root optional catch-all', () => {
      expect(filenameToRoutePath('/app/routes/[[...slug]].ts')).toBe(
        '/[[...slug]]',
      );
    });

    it('should handle a nested optional catch-all', () => {
      expect(
        filenameToRoutePath('/src/app/pages/docs/[[...slug]].page.ts'),
      ).toBe('/docs/[[...slug]]');
    });

    it('should handle optional catch-all with shop prefix', () => {
      expect(
        filenameToRoutePath('/src/app/pages/shop/[[...category]].page.ts'),
      ).toBe('/shop/[[...category]]');
    });
  });

  describe('content routes', () => {
    it('should handle a nested content route', () => {
      expect(filenameToRoutePath('/src/content/a/b/content.md')).toBe(
        '/a/b/content',
      );
    });

    it('should handle a root content route', () => {
      expect(filenameToRoutePath('/src/content/getting-started.md')).toBe(
        '/getting-started',
      );
    });
  });

  describe('layout routes', () => {
    it('should handle a layout route', () => {
      expect(filenameToRoutePath('/app/routes/products.ts')).toBe('/products');
    });
  });
});

describe('extractRouteParams', () => {
  it('should return empty for static routes', () => {
    expect(extractRouteParams('/about')).toEqual([]);
    expect(extractRouteParams('/')).toEqual([]);
    expect(extractRouteParams('/auth/login')).toEqual([]);
  });

  it('should extract a single dynamic param', () => {
    expect(extractRouteParams('/users/[id]')).toEqual([
      { name: 'id', type: 'dynamic' },
    ]);
  });

  it('should extract multiple dynamic params', () => {
    const params = extractRouteParams(
      '/categories/[categoryId]/products/[productId]',
    );
    expect(params).toEqual([
      { name: 'categoryId', type: 'dynamic' },
      { name: 'productId', type: 'dynamic' },
    ]);
  });

  it('should extract a catch-all param', () => {
    expect(extractRouteParams('/docs/[...slug]')).toEqual([
      { name: 'slug', type: 'catchAll' },
    ]);
  });

  it('should extract an optional catch-all param', () => {
    expect(extractRouteParams('/shop/[[...category]]')).toEqual([
      { name: 'category', type: 'optionalCatchAll' },
    ]);
  });

  it('should handle hyphenated param names', () => {
    expect(extractRouteParams('/[...page-not-found]')).toEqual([
      { name: 'page-not-found', type: 'catchAll' },
    ]);
  });

  it('should handle a root catch-all', () => {
    expect(extractRouteParams('/[...not-found]')).toEqual([
      { name: 'not-found', type: 'catchAll' },
    ]);
  });

  it('should handle mixed param types', () => {
    // This is unusual but tests the regex independence
    const params = extractRouteParams('/[type]/[id]/[...rest]');
    expect(params).toContainEqual({ name: 'rest', type: 'catchAll' });
    expect(params).toContainEqual({ name: 'type', type: 'dynamic' });
    expect(params).toContainEqual({ name: 'id', type: 'dynamic' });
  });
});

describe('generateRouteManifest', () => {
  it('should generate an empty manifest for no files', () => {
    const manifest = generateRouteManifest([]);
    expect(manifest.routes).toEqual([]);
  });

  it('should generate manifest entries from filenames', () => {
    const manifest = generateRouteManifest([
      '/app/routes/index.ts',
      '/app/routes/about.ts',
      '/src/app/pages/users/[id].page.ts',
    ]);

    expect(manifest.routes).toHaveLength(3);
    expect(manifest.routes[0].path).toBe('/');
    expect(manifest.routes[1].path).toBe('/about');
    expect(manifest.routes[2].path).toBe('/users/[id]');
  });

  it('should sort static routes before dynamic routes', () => {
    const manifest = generateRouteManifest([
      '/src/app/pages/[id].page.ts',
      '/src/app/pages/about.page.ts',
      '/src/app/pages/[...not-found].page.ts',
    ]);

    expect(manifest.routes[0].path).toBe('/about');
    expect(manifest.routes[1].path).toBe('/[id]');
    expect(manifest.routes[2].path).toBe('/[...not-found]');
  });

  it('should sort optional catch-all after required catch-all', () => {
    const manifest = generateRouteManifest([
      '/app/routes/[[...slug]].ts',
      '/app/routes/[...not-found].ts',
      '/app/routes/about.ts',
    ]);

    expect(manifest.routes[0].path).toBe('/about');
    expect(manifest.routes[1].path).toBe('/[...not-found]');
    expect(manifest.routes[2].path).toBe('/[[...slug]]');
  });

  it('should warn on route collisions', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    generateRouteManifest(['/app/routes/index.ts', '/app/routes/(home).ts']);

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('Route collision'),
    );

    spy.mockRestore();
  });

  it('should extract params for each route', () => {
    const manifest = generateRouteManifest([
      '/src/app/pages/users/[id].page.ts',
      '/src/app/pages/docs/[...slug].page.ts',
    ]);

    expect(manifest.routes[0].params).toEqual([
      { name: 'id', type: 'dynamic' },
    ]);
    expect(manifest.routes[1].params).toEqual([
      { name: 'slug', type: 'catchAll' },
    ]);
  });
});

describe('generateRouteTableDeclaration', () => {
  it('should generate valid TypeScript for static routes', () => {
    const manifest = generateRouteManifest([
      '/app/routes/index.ts',
      '/app/routes/about.ts',
    ]);

    const output = generateRouteTableDeclaration(manifest);

    expect(output).toContain("declare module '@analogjs/router'");
    expect(output).toContain('interface AnalogRouteTable');
    expect(output).toContain("'/': {");
    expect(output).toContain("'/about': {");
    expect(output).toContain('Record<string, never>');
    expect(output).toContain('export {};');
  });

  it('should generate correct param types for dynamic routes', () => {
    const manifest = generateRouteManifest([
      '/src/app/pages/users/[id].page.ts',
    ]);

    const output = generateRouteTableDeclaration(manifest);

    expect(output).toContain("'/users/[id]': {");
    expect(output).toContain('{ id: string }');
  });

  it('should generate correct param types for catch-all routes', () => {
    const manifest = generateRouteManifest([
      '/src/app/pages/docs/[...slug].page.ts',
    ]);

    const output = generateRouteTableDeclaration(manifest);

    expect(output).toContain("'/docs/[...slug]': {");
    expect(output).toContain('{ slug: string[] }');
  });

  it('should generate correct param types for optional catch-all routes', () => {
    const manifest = generateRouteManifest([
      '/src/app/pages/shop/[[...category]].page.ts',
    ]);

    const output = generateRouteTableDeclaration(manifest);

    expect(output).toContain("'/shop/[[...category]]': {");
    expect(output).toContain('{ category?: string[] }');
  });

  it('should quote invalid identifiers in param names', () => {
    const manifest = generateRouteManifest([
      '/src/app/pages/[...page-not-found].page.ts',
    ]);

    const output = generateRouteTableDeclaration(manifest);

    expect(output).toContain("'page-not-found': string[]");
  });

  it('should generate multiple params for complex routes', () => {
    const manifest = generateRouteManifest([
      '/app/routes/categories.[categoryId].products.[productId].ts',
    ]);

    const output = generateRouteTableDeclaration(manifest);

    expect(output).toContain('categoryId: string');
    expect(output).toContain('productId: string');
  });
});

import { describe, expect, it, vi } from 'vitest';

import {
  filenameToRouteId,
  filenameToRoutePath,
  extractRouteParams,
  generateRouteManifest,
  generateRouteTableDeclaration,
} from './route-manifest.js';

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

  it.each([
    ['index/details', '/details'],
    ['docs/index/details', '/docs/details'],
    ['reindex', '/re'],
    ['(auth.v2)/login', '/login'],
    ['prefix(group)/details', '/prefix/details'],
  ])('matches beta filename normalization for %s', (filename, expected) => {
    expect(filenameToRoutePath(`/src/app/pages/${filename}.page.ts`)).toBe(
      expected,
    );
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

    it('should handle content from additional content dirs', () => {
      expect(
        filenameToRoutePath('/libs/shared/feature/src/content/test.md'),
      ).toBe('/test');
    });

    it('should handle nested content from additional content dirs', () => {
      expect(
        filenameToRoutePath('/libs/shared/feature/src/content/docs/guide.md'),
      ).toBe('/docs/guide');
    });
  });

  describe('layout routes', () => {
    it('should handle a layout route', () => {
      expect(filenameToRoutePath('/app/routes/products.ts')).toBe('/products');
    });
  });
});

describe('filenameToRouteId', () => {
  it('preserves route groups and index segments', () => {
    expect(filenameToRouteId('/src/app/pages/(auth)/index.page.ts')).toBe(
      '/(auth)/index',
    );
    expect(
      filenameToRouteId('/src/app/pages/(foo)/auth/(bar)/login.page.ts'),
    ).toBe('/(foo)/auth/(bar)/login');
  });

  it('preserves dynamic segments and content paths', () => {
    expect(filenameToRouteId('/app/routes/blog.[slug].ts')).toBe(
      '/blog/[slug]',
    );
    expect(filenameToRouteId('/src/content/guides/deployment.md')).toBe(
      '/guides/deployment',
    );
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
    expect(manifest.collisions).toEqual([]);
  });

  it('should generate manifest entries from filenames', () => {
    const manifest = generateRouteManifest([
      '/app/routes/index.ts',
      '/app/routes/about.ts',
      '/src/app/pages/users/[id].page.ts',
    ]);

    expect(manifest.routes).toHaveLength(3);
    expect(manifest.routes[0].fullPath).toBe('/');
    expect(manifest.routes[1].fullPath).toBe('/about');
    expect(manifest.routes[2].fullPath).toBe('/users/[id]');
  });

  it('should sort static routes before dynamic routes', () => {
    const manifest = generateRouteManifest([
      '/src/app/pages/[id].page.ts',
      '/src/app/pages/about.page.ts',
      '/src/app/pages/[...not-found].page.ts',
    ]);

    expect(manifest.routes[0].fullPath).toBe('/about');
    expect(manifest.routes[1].fullPath).toBe('/[id]');
    expect(manifest.routes[2].fullPath).toBe('/[...not-found]');
  });

  it('should sort optional catch-all after required catch-all', () => {
    const manifest = generateRouteManifest([
      '/app/routes/[[...slug]].ts',
      '/app/routes/[...not-found].ts',
      '/app/routes/about.ts',
    ]);

    expect(manifest.routes[0].fullPath).toBe('/about');
    expect(manifest.routes[1].fullPath).toBe('/[...not-found]');
    expect(manifest.routes[2].fullPath).toBe('/[[...slug]]');
  });

  it('should warn on route collisions and skip duplicates', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {
      /* noop */
    });

    const manifest = generateRouteManifest([
      '/src/app/pages/about.page.ts',
      '/libs/shared/feature/src/pages/about.page.ts',
    ]);

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('Route collision'),
    );
    expect(manifest.routes.filter((r) => r.fullPath === '/about').length).toBe(
      1,
    );
    expect(manifest.collisions).toHaveLength(1);
    expect(manifest.collisions[0].fullPath).toBe('/about');
    expect(manifest.collisions[0].samePriority).toBe(false);

    spy.mockRestore();
  });

  it('does not record a collision for two group routes at the same path', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {
      /* noop */
    });

    const manifest = generateRouteManifest([
      '/src/app/pages/(auth).page.ts',
      '/src/app/pages/(home).page.ts',
    ]);

    expect(manifest.collisions).toHaveLength(0);
    expect(spy).not.toHaveBeenCalled();

    spy.mockRestore();
  });

  it('does not record a collision for layout + index pair at the same path', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {
      /* noop */
    });

    const manifest = generateRouteManifest([
      '/src/app/pages/docs.page.ts',
      '/src/app/pages/docs/index.page.ts',
    ]);

    expect(manifest.collisions).toHaveLength(0);
    expect(spy).not.toHaveBeenCalled();

    spy.mockRestore();
  });

  it('does not record a collision when the same file appears twice', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {
      /* noop */
    });

    const manifest = generateRouteManifest([
      '/src/app/pages/about.page.ts',
      '/src/app/pages/about.page.ts',
    ]);

    expect(manifest.routes).toHaveLength(1);
    expect(manifest.collisions).toHaveLength(0);
    expect(spy).not.toHaveBeenCalled();

    spy.mockRestore();
  });

  it('should preserve pathless layouts that share the same fullPath', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {
      /* noop */
    });

    const manifest = generateRouteManifest([
      '/src/app/pages/index.page.ts',
      '/src/app/pages/(auth).page.ts',
      '/src/app/pages/(home).page.ts',
    ]);

    expect(spy).not.toHaveBeenCalledWith(
      expect.stringContaining('Route collision'),
    );
    expect(manifest.routes.filter((r) => r.fullPath === '/').length).toBe(3);
    expect(manifest.routes.find((r) => r.id === '/(auth)')?.isGroup).toBe(true);
    expect(manifest.routes.find((r) => r.id === '/(home)')?.isGroup).toBe(true);

    spy.mockRestore();
  });

  it('should pick a deterministic canonical route when only pathless layouts exist at a fullPath', () => {
    // Provide filenames in reverse-alphabetical order to verify the
    // tiebreaker selects by id, not by iteration/input order.
    const manifest = generateRouteManifest([
      '/src/app/pages/(home).page.ts',
      '/src/app/pages/(auth).page.ts',
    ]);

    // Both resolve to fullPath '/' — all are group layouts, no index.page.ts
    expect(manifest.routes).toHaveLength(2);
    expect(manifest.routes.every((r) => r.isGroup)).toBe(true);

    // The canonical selection (used for AnalogRouteTable / byFullPath) must
    // pick exactly one. Tiebreaker picks alphabetically-first id: /(auth).
    const tableOutput = generateRouteTableDeclaration(manifest);

    // Exactly one entry for '/' in AnalogRouteTable
    const tableMatches = tableOutput.match(/"\/":\s*\{/g) ?? [];
    expect(tableMatches).toHaveLength(1);

    expect(manifest.canonicalByFullPath.get('/')?.id).toBe('/(auth)');
  });

  it('should preserve pathless layout with its nested children', () => {
    const manifest = generateRouteManifest([
      '/src/app/pages/index.page.ts',
      '/src/app/pages/(auth).page.ts',
      '/src/app/pages/(auth)/login.page.ts',
    ]);

    expect(manifest.routes).toHaveLength(3);

    const authLayout = manifest.routes.find((r) => r.id === '/(auth)')!;
    const loginRoute = manifest.routes.find((r) => r.id === '/(auth)/login')!;

    expect(authLayout).toBeDefined();
    expect(loginRoute).toBeDefined();
    expect(loginRoute.parentId).toBe('/(auth)');
    expect(authLayout.children).toEqual(['/(auth)/login']);
  });

  it('should wire nested group children to their group parent, not a fullPath ancestor', () => {
    const manifest = generateRouteManifest([
      '/src/app/pages/dashboard.page.ts',
      '/src/app/pages/dashboard/(settings).page.ts',
      '/src/app/pages/dashboard/(settings)/profile.page.ts',
    ]);

    const settings = manifest.routes.find(
      (r) => r.id === '/dashboard/(settings)',
    )!;
    const profile = manifest.routes.find(
      (r) => r.id === '/dashboard/(settings)/profile',
    )!;

    expect(settings).toBeDefined();
    expect(profile).toBeDefined();
    // profile's parent should be the (settings) group, not /dashboard
    expect(profile.parentId).toBe('/dashboard/(settings)');
    expect(settings.children).toContain('/dashboard/(settings)/profile');
  });

  it('prefers app-local routes over additional/shared route sources', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {
      /* noop */
    });

    const manifest = generateRouteManifest([
      '/libs/shared/feature/src/pages/blog/[slug].page.ts',
      '/src/app/pages/blog/[slug].page.ts',
    ]);

    expect(manifest.routes).toHaveLength(1);
    expect(manifest.routes[0].fullPath).toBe('/blog/[slug]');
    expect(manifest.routes[0].filename).toBe(
      '/src/app/pages/blog/[slug].page.ts',
    );
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("Keeping '/src/app/pages/blog/[slug].page.ts'"),
    );

    spy.mockRestore();
  });

  it('uses custom collisionPriority callback when provided', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {
      /* noop */
    });

    // Without callback, the hard-coded heuristic picks /src/app/pages/...
    // With callback, we invert priority: shared file wins
    const manifest = generateRouteManifest(
      [
        '/src/app/pages/blog/[slug].page.ts',
        '/libs/shared/feature/src/pages/blog/[slug].page.ts',
      ],
      (filename) => (filename.startsWith('/libs/shared/') ? 0 : 1),
    );

    expect(manifest.routes).toHaveLength(1);
    expect(manifest.routes[0].filename).toBe(
      '/libs/shared/feature/src/pages/blog/[slug].page.ts',
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

  it('should compute ids, local paths, and parent-child relationships', () => {
    const manifest = generateRouteManifest([
      '/src/app/pages/users/[id].page.ts',
      '/src/app/pages/users/[id]/settings.page.ts',
      '/src/app/pages/(marketing)/pricing.page.ts',
    ]);

    const userRoute = manifest.routes.find(
      (route) => route.fullPath === '/users/[id]',
    )!;
    const settingsRoute = manifest.routes.find(
      (route) => route.fullPath === '/users/[id]/settings',
    )!;
    const pricingRoute = manifest.routes.find(
      (route) => route.fullPath === '/pricing',
    )!;

    expect(userRoute.id).toBe('/users/[id]');
    expect(userRoute.path).toBe('users/[id]');
    expect(userRoute.parentId).toBeNull();
    expect(userRoute.children).toEqual(['/users/[id]/settings']);

    expect(settingsRoute.id).toBe('/users/[id]/settings');
    expect(settingsRoute.path).toBe('settings');
    expect(settingsRoute.parentId).toBe('/users/[id]');

    expect(pricingRoute.id).toBe('/(marketing)/pricing');
    expect(pricingRoute.isGroup).toBe(false);
    expect(pricingRoute.kind).toBe('page');
  });

  it('should compute hierarchy for grouped route with nested dynamic child', () => {
    const manifest = generateRouteManifest([
      '/src/app/pages/(auth)/users/[id].page.ts',
      '/src/app/pages/(auth)/users/[id]/settings.page.ts',
    ]);

    const usersRoute = manifest.routes.find(
      (r) => r.fullPath === '/users/[id]',
    )!;
    const settingsRoute = manifest.routes.find(
      (r) => r.fullPath === '/users/[id]/settings',
    )!;

    // fullPath strips group, id preserves it
    expect(usersRoute.fullPath).toBe('/users/[id]');
    expect(usersRoute.id).toBe('/(auth)/users/[id]');
    expect(usersRoute.parentId).toBeNull();
    expect(usersRoute.children).toEqual(['/(auth)/users/[id]/settings']);

    expect(settingsRoute.fullPath).toBe('/users/[id]/settings');
    expect(settingsRoute.id).toBe('/(auth)/users/[id]/settings');
    expect(settingsRoute.path).toBe('settings');
    expect(settingsRoute.parentId).toBe('/(auth)/users/[id]');
  });

  it('should compute hierarchy for grouped catch-all route', () => {
    const manifest = generateRouteManifest([
      '/src/app/pages/(admin)/dashboard.page.ts',
      '/src/app/pages/(admin)/dashboard/[...slug].page.ts',
    ]);

    const dashboardRoute = manifest.routes.find(
      (r) => r.fullPath === '/dashboard',
    )!;
    const slugRoute = manifest.routes.find(
      (r) => r.fullPath === '/dashboard/[...slug]',
    )!;

    expect(dashboardRoute.fullPath).toBe('/dashboard');
    expect(dashboardRoute.id).toBe('/(admin)/dashboard');
    expect(dashboardRoute.parentId).toBeNull();
    expect(dashboardRoute.children).toEqual(['/(admin)/dashboard/[...slug]']);

    expect(slugRoute.fullPath).toBe('/dashboard/[...slug]');
    expect(slugRoute.id).toBe('/(admin)/dashboard/[...slug]');
    expect(slugRoute.path).toBe('[...slug]');
    expect(slugRoute.parentId).toBe('/(admin)/dashboard');
    expect(slugRoute.isCatchAll).toBe(true);
  });

  it('should compute hierarchy for optional catch-all with nested dynamic child', () => {
    const manifest = generateRouteManifest([
      '/src/app/pages/shop/[[...category]].page.ts',
      '/src/app/pages/shop/[[...category]]/[productId].page.ts',
    ]);

    const categoryRoute = manifest.routes.find(
      (r) => r.fullPath === '/shop/[[...category]]',
    )!;
    const productRoute = manifest.routes.find(
      (r) => r.fullPath === '/shop/[[...category]]/[productId]',
    )!;

    expect(categoryRoute.fullPath).toBe('/shop/[[...category]]');
    expect(categoryRoute.parentId).toBeNull();
    expect(categoryRoute.isOptionalCatchAll).toBe(true);
    expect(categoryRoute.children).toEqual([
      '/shop/[[...category]]/[productId]',
    ]);

    expect(productRoute.fullPath).toBe('/shop/[[...category]]/[productId]');
    expect(productRoute.path).toBe('[productId]');
    expect(productRoute.parentId).toBe('/shop/[[...category]]');
  });

  it('should compute hierarchy for deep tree with groups, dynamic, and catch-all', () => {
    const manifest = generateRouteManifest([
      '/src/app/pages/index.page.ts',
      '/src/app/pages/(auth)/users/[id].page.ts',
      '/src/app/pages/(auth)/users/[id]/settings.page.ts',
      '/src/app/pages/(admin)/dashboard.page.ts',
      '/src/app/pages/(admin)/dashboard/[...slug].page.ts',
      '/src/app/pages/shop/[[...category]].page.ts',
      '/src/app/pages/shop/[[...category]]/[productId].page.ts',
    ]);

    const find = (fp: string) =>
      manifest.routes.find((r) => r.fullPath === fp)!;

    // Root
    expect(find('/').parentId).toBeNull();

    // Grouped auth tree
    expect(find('/users/[id]').parentId).toBeNull();
    expect(find('/users/[id]/settings').parentId).toBe('/(auth)/users/[id]');
    expect(find('/users/[id]').children).toEqual([
      '/(auth)/users/[id]/settings',
    ]);

    // Grouped admin tree
    expect(find('/dashboard').parentId).toBeNull();
    expect(find('/dashboard/[...slug]').parentId).toBe('/(admin)/dashboard');
    expect(find('/dashboard').children).toEqual([
      '/(admin)/dashboard/[...slug]',
    ]);

    // Optional catch-all tree
    expect(find('/shop/[[...category]]').parentId).toBeNull();
    expect(find('/shop/[[...category]]/[productId]').parentId).toBe(
      '/shop/[[...category]]',
    );
  });

  it('should mark content routes with kind content', () => {
    const manifest = generateRouteManifest([
      '/src/app/pages/about.page.ts',
      '/src/content/guides/getting-started.md',
    ]);

    const pageRoute = manifest.routes.find((r) => r.fullPath === '/about')!;
    const contentRoute = manifest.routes.find(
      (r) => r.fullPath === '/guides/getting-started',
    )!;

    expect(pageRoute.kind).toBe('page');
    expect(contentRoute.kind).toBe('content');
  });

  it('should set isIndex flag on index routes', () => {
    const manifest = generateRouteManifest([
      '/src/app/pages/index.page.ts',
      '/src/app/pages/about.page.ts',
      '/src/app/pages/products/index.page.ts',
    ]);

    const rootIndex = manifest.routes.find((r) => r.fullPath === '/')!;
    const aboutRoute = manifest.routes.find((r) => r.fullPath === '/about')!;
    const productsIndex = manifest.routes.find(
      (r) => r.fullPath === '/products',
    )!;

    expect(rootIndex.isIndex).toBe(true);
    expect(aboutRoute.isIndex).toBe(false);
    expect(productsIndex.isIndex).toBe(true);
  });

  it('should set isCatchAll and isOptionalCatchAll flags', () => {
    const manifest = generateRouteManifest([
      '/src/app/pages/docs/[...slug].page.ts',
      '/src/app/pages/shop/[[...category]].page.ts',
      '/src/app/pages/about.page.ts',
    ]);

    const catchAll = manifest.routes.find(
      (r) => r.fullPath === '/docs/[...slug]',
    )!;
    const optionalCatchAll = manifest.routes.find(
      (r) => r.fullPath === '/shop/[[...category]]',
    )!;
    const staticRoute = manifest.routes.find((r) => r.fullPath === '/about')!;

    expect(catchAll.isCatchAll).toBe(true);
    expect(catchAll.isOptionalCatchAll).toBe(false);
    expect(optionalCatchAll.isCatchAll).toBe(false);
    expect(optionalCatchAll.isOptionalCatchAll).toBe(true);
    expect(staticRoute.isCatchAll).toBe(false);
    expect(staticRoute.isOptionalCatchAll).toBe(false);
  });
});

describe('generateRouteTableDeclaration', () => {
  it('should generate valid TypeScript for static routes', () => {
    const manifest = generateRouteManifest([
      '/app/routes/index.ts',
      '/app/routes/about.ts',
    ]);

    const output = generateRouteTableDeclaration(manifest);

    expect(output).toContain(
      '// This file is auto-generated by @analogjs/platform',
    );
    expect(output).toContain("declare module '@analogjs/router'");
    expect(output).toContain('interface AnalogRouteTable');
    expect(output).toContain('"/": {');
    expect(output).toContain('"/about": {');
    expect(output).toContain('Record<string, never>');
    expect(output).toContain('export {};');
  });

  it('should generate correct param types for dynamic routes', () => {
    const manifest = generateRouteManifest([
      '/src/app/pages/users/[id].page.ts',
    ]);

    const output = generateRouteTableDeclaration(manifest);

    expect(output).toContain('"/users/[id]": {');
    expect(output).toContain('{ id: string }');
  });

  it('should generate correct param types for catch-all routes', () => {
    const manifest = generateRouteManifest([
      '/src/app/pages/docs/[...slug].page.ts',
    ]);

    const output = generateRouteTableDeclaration(manifest);

    expect(output).toContain('"/docs/[...slug]": {');
    expect(output).toContain('{ slug: string[] }');
  });

  it('should generate correct param types for optional catch-all routes', () => {
    const manifest = generateRouteManifest([
      '/src/app/pages/shop/[[...category]].page.ts',
    ]);

    const output = generateRouteTableDeclaration(manifest);

    expect(output).toContain('"/shop/[[...category]]": {');
    expect(output).toContain('{ category?: string[] }');
  });

  it('should quote invalid identifiers in param names', () => {
    const manifest = generateRouteManifest([
      '/src/app/pages/[...page-not-found].page.ts',
    ]);

    const output = generateRouteTableDeclaration(manifest);

    expect(output).toContain('"page-not-found": string[]');
  });

  it('should generate multiple params for complex routes', () => {
    const manifest = generateRouteManifest([
      '/app/routes/categories.[categoryId].products.[productId].ts',
    ]);

    const output = generateRouteTableDeclaration(manifest);

    expect(output).toContain('categoryId: string');
    expect(output).toContain('productId: string');
  });

  it('should not import StandardSchemaV1 when no schemas', () => {
    const manifest = generateRouteManifest(['/app/routes/about.ts']);

    const output = generateRouteTableDeclaration(manifest);

    expect(output).not.toContain('StandardSchemaV1');
    expect(output).not.toContain('routeParamsSchema');
  });

  it('emits only the parameter and query fields needed by consumers', () => {
    const manifest = generateRouteManifest([
      '/src/app/pages/users/[id].page.ts',
    ]);

    const output = generateRouteTableDeclaration(manifest);

    expect(output).toContain('params: { id: string }');
    expect(output).toContain(
      'query: Record<string, string | string[] | undefined>',
    );
    expect(output).not.toContain('paramsOutput');
    expect(output).not.toContain('queryOutput');
  });
});

describe('guarded route branches', () => {
  it('keeps grouped pages with the same URL and emits one navigation type', () => {
    const manifest = generateRouteManifest([
      '/src/app/pages/(admin).page.ts',
      '/src/app/pages/(admin)/dashboard.page.ts',
      '/src/app/pages/(user).page.ts',
      '/src/app/pages/(user)/dashboard.page.ts',
    ]);
    expect(manifest.collisions).toEqual([]);
    const pages = manifest.routes.filter(
      (route) => route.fullPath === '/dashboard',
    );
    expect(pages.map((route) => route.parentId).sort()).toEqual([
      '/(admin)',
      '/(user)',
    ]);
    expect(
      generateRouteTableDeclaration(manifest).match(/"\/dashboard":/g),
    ).toHaveLength(1);
  });
});

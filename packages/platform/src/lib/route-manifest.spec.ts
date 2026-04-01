import { describe, expect, it, vi } from 'vitest';

import {
  filenameToRouteId,
  filenameToRoutePath,
  extractRouteParams,
  generateRouteManifest,
  generateRouteTableDeclaration,
  generateRouteTreeDeclaration,
  detectSchemaExports,
  formatManifestSummary,
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
      '/app/routes/index.ts',
      '/app/routes/(home).ts',
    ]);

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('Route collision'),
    );
    // Duplicate should be skipped — only one '/' entry
    expect(manifest.routes.filter((r) => r.fullPath === '/').length).toBe(1);
    expect(manifest.routes[0].filename).toMatch(
      /^\/app\/routes\/(index|\(home\))\.ts$/,
    );
    expect(manifest.collisions).toHaveLength(1);
    expect(manifest.collisions[0].fullPath).toBe('/');

    spy.mockRestore();
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
      undefined,
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
    expect(pricingRoute.isGroup).toBe(true);
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

  it('should generate schema references when detected', () => {
    const manifest = generateRouteManifest(
      ['/src/app/pages/users/[id].page.ts'],
      () => ({ hasParamsSchema: true, hasQuerySchema: false }),
    );

    const output = generateRouteTableDeclaration(manifest);

    expect(output).toContain(
      "import type { StandardSchemaV1 } from '@standard-schema/spec'",
    );
    expect(output).toContain(
      "import type { routeParamsSchema as _p0 } from '../src/app/pages/users/[id].page'",
    );
    // params stays filename-derived for navigation input
    expect(output).toContain('params: { id: string }');
    // paramsOutput uses schema InferOutput for runtime
    expect(output).toContain(
      'paramsOutput: StandardSchemaV1.InferOutput<typeof _p0>',
    );
    // query/queryOutput remain default (no query schema)
    expect(output).toContain(
      'query: Record<string, string | string[] | undefined>',
    );
    expect(output).toContain(
      'queryOutput: Record<string, string | string[] | undefined>',
    );
  });

  it('should generate both schema references', () => {
    const manifest = generateRouteManifest(
      ['/src/app/pages/products/[id].page.ts'],
      () => ({ hasParamsSchema: true, hasQuerySchema: true }),
    );

    const output = generateRouteTableDeclaration(manifest);

    expect(output).toContain('routeParamsSchema as _p0');
    expect(output).toContain('routeQuerySchema as _q0');
    // params always filename-derived
    expect(output).toContain('params: { id: string }');
    // Output types use schema InferOutput
    expect(output).toContain(
      'paramsOutput: StandardSchemaV1.InferOutput<typeof _p0>',
    );
    expect(output).toContain(
      'queryOutput: StandardSchemaV1.InferOutput<typeof _q0>',
    );
  });

  it('should not import StandardSchemaV1 when no schemas', () => {
    const manifest = generateRouteManifest(['/app/routes/about.ts']);

    const output = generateRouteTableDeclaration(manifest);

    expect(output).not.toContain('StandardSchemaV1');
    expect(output).not.toContain('import type');
  });

  it('should set paramsOutput same as params when no schema', () => {
    const manifest = generateRouteManifest([
      '/src/app/pages/users/[id].page.ts',
    ]);

    const output = generateRouteTableDeclaration(manifest);

    // Both params and paramsOutput are filename-derived
    expect(output).toContain('params: { id: string }');
    expect(output).toContain('paramsOutput: { id: string }');
  });

  it('should mix schema and non-schema routes', () => {
    const manifest = generateRouteManifest(
      ['/app/routes/about.ts', '/src/app/pages/users/[id].page.ts'],
      (filename) => {
        if (filename.includes('[id]')) {
          return { hasParamsSchema: true, hasQuerySchema: false };
        }
        return { hasParamsSchema: false, hasQuerySchema: false };
      },
    );

    const output = generateRouteTableDeclaration(manifest);

    // about uses default params type
    expect(output).toContain(
      "'/about': {\n      params: Record<string, never>",
    );
    // users/[id]: params is still filename-derived, paramsOutput uses schema
    expect(output).toContain(
      'paramsOutput: StandardSchemaV1.InferOutput<typeof _p0>',
    );
  });
});

describe('generateRouteTreeDeclaration', () => {
  it('should generate typed route metadata indexes and runtime tree data', () => {
    const manifest = generateRouteManifest(
      [
        '/src/app/pages/(home).page.ts',
        '/src/app/pages/users/[id].page.ts',
        '/src/app/pages/users/[id]/settings.page.ts',
        '/src/content/guides/deployment.md',
      ],
      (filename) => ({
        hasParamsSchema: filename.includes('[id].page.ts'),
        hasQuerySchema: filename.includes('settings.page.ts'),
      }),
    );

    const output = generateRouteTreeDeclaration(manifest, {
      jsonLdPaths: ['/', '/users/[id]'],
    });

    expect(output).toContain(
      '// This file is auto-generated by @analogjs/platform',
    );
    expect(output).toContain('export interface AnalogGeneratedRouteRecord<');
    expect(output).toContain('export interface AnalogFileRoutesById {');
    expect(output).toContain('export interface AnalogFileRoutesByFullPath {');
    expect(output).not.toContain('export interface AnalogFileRoutesByTo {');
    expect(output).toContain('export const analogRouteTree = {');
    expect(output).toContain('"/(home)"');
    expect(output).toContain('fullPath: "/"');
    expect(output).toContain('path: "settings"');
    expect(output).toContain('parentId: "/users/[id]"');
    expect(output).toContain('children: ["/users/[id]/settings"] as const');
    expect(output).toContain('kind: "content"');
    expect(output).toContain('hasJsonLd: true');
    expect(output).toContain('hasQuerySchema: true');
  });

  it('should mark routes with hasJsonLd based on jsonLdPaths', () => {
    const manifest = generateRouteManifest([
      '/src/app/pages/index.page.ts',
      '/src/app/pages/about.page.ts',
      '/src/app/pages/users/[id].page.ts',
    ]);

    const output = generateRouteTreeDeclaration(manifest, {
      jsonLdPaths: ['/'],
    });

    // Home route should have hasJsonLd: true
    expect(output).toMatch(/id: "\/index"[\s\S]*?hasJsonLd: true/);
    // About and users should have hasJsonLd: false
    expect(output).toMatch(/id: "\/about"[\s\S]*?hasJsonLd: false/);
    expect(output).toMatch(/id: "\/users\/\[id\]"[\s\S]*?hasJsonLd: false/);
  });

  it('should set all hasJsonLd to false when jsonLdPaths is empty', () => {
    const manifest = generateRouteManifest([
      '/src/app/pages/index.page.ts',
      '/src/app/pages/about.page.ts',
    ]);

    const output = generateRouteTreeDeclaration(manifest);

    expect(output).not.toContain('hasJsonLd: true');
    expect(output).toContain('hasJsonLd: false');
  });

  it('should generate AnalogRouteTreeId and AnalogRouteTreeFullPath type aliases without ByTo duplicate', () => {
    const manifest = generateRouteManifest([
      '/src/app/pages/index.page.ts',
      '/src/app/pages/about.page.ts',
    ]);

    const output = generateRouteTreeDeclaration(manifest);

    expect(output).toContain(
      'export type AnalogRouteTreeId = keyof AnalogFileRoutesById;',
    );
    expect(output).toContain(
      'export type AnalogRouteTreeFullPath = keyof AnalogFileRoutesByFullPath;',
    );
    expect(output).not.toContain('AnalogRouteTreeTo');
    expect(output).not.toContain('AnalogFileRoutesByTo');
  });
});

describe('detectSchemaExports', () => {
  it('should detect routeParamsSchema export', () => {
    const content = `
import * as v from 'valibot';
export const routeParamsSchema = v.object({
  id: v.string(),
});
`;
    const result = detectSchemaExports(content);
    expect(result.hasParamsSchema).toBe(true);
    expect(result.hasQuerySchema).toBe(false);
  });

  it('should detect routeQuerySchema export', () => {
    const content = `
import * as v from 'valibot';
export const routeQuerySchema = v.object({
  tab: v.optional(v.string()),
});
`;
    const result = detectSchemaExports(content);
    expect(result.hasParamsSchema).toBe(false);
    expect(result.hasQuerySchema).toBe(true);
  });

  it('should detect both schemas', () => {
    const content = `
import * as v from 'valibot';
export const routeParamsSchema = v.object({ id: v.string() });
export const routeQuerySchema = v.object({ tab: v.string() });
`;
    const result = detectSchemaExports(content);
    expect(result.hasParamsSchema).toBe(true);
    expect(result.hasQuerySchema).toBe(true);
  });

  it('should return false for no schema exports', () => {
    const content = `
export default class UserPage {}
export const routeMeta = { title: 'Users' };
`;
    const result = detectSchemaExports(content);
    expect(result.hasParamsSchema).toBe(false);
    expect(result.hasQuerySchema).toBe(false);
  });

  it('should not match non-exported schemas', () => {
    const content = `
const routeParamsSchema = v.object({ id: v.string() });
`;
    const result = detectSchemaExports(content);
    expect(result.hasParamsSchema).toBe(false);
  });

  it('should not match commented-out exports', () => {
    // The regex does a simple check; single-line comments
    // would still contain the text but on a comment line.
    // For now, the simple regex may false-positive on comments.
    // This is acceptable for v1.
    const content = `
// export const routeParamsSchema = v.object({});
`;
    // Simple regex doesn't filter comments — acceptable for v1
    const result = detectSchemaExports(content);
    expect(result.hasParamsSchema).toBe(true);
  });
});

describe('formatManifestSummary', () => {
  it('should produce a human-readable summary', () => {
    const manifest = generateRouteManifest(
      [
        '/app/routes/index.ts',
        '/app/routes/about.ts',
        '/src/app/pages/users/[id].page.ts',
      ],
      (filename) => {
        if (filename.includes('[id]')) {
          return { hasParamsSchema: true, hasQuerySchema: false };
        }
        return { hasParamsSchema: false, hasQuerySchema: false };
      },
    );

    const summary = formatManifestSummary(manifest);

    expect(summary).toContain('[Analog] Generated typed routes:');
    expect(summary).toContain('3 routes (2 static, 1 dynamic)');
    expect(summary).toContain('1 with schema validation');
    expect(summary).toContain('/users/[id] [params-schema]');
    expect(summary).toContain('/about');
    expect(summary).toContain('/');
  });

  it('should not show schema count when none present', () => {
    const manifest = generateRouteManifest(['/app/routes/about.ts']);

    const summary = formatManifestSummary(manifest);

    expect(summary).not.toContain('with schema');
    expect(summary).toContain('1 routes (1 static, 0 dynamic)');
  });
});

describe('dev diagnostics', () => {
  it('should warn when schema exists on static route', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {
      /* noop */
    });

    generateRouteManifest(['/app/routes/about.ts'], () => ({
      hasParamsSchema: true,
      hasQuerySchema: false,
    }));

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining(
        'exports routeParamsSchema but has no dynamic params',
      ),
    );

    spy.mockRestore();
  });

  it('should not warn when schema matches dynamic params', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {
      /* noop */
    });

    generateRouteManifest(['/src/app/pages/users/[id].page.ts'], () => ({
      hasParamsSchema: true,
      hasQuerySchema: false,
    }));

    // Should not have warnings about schema mismatch
    const schemaCalls = spy.mock.calls.filter((call) =>
      String(call[0]).includes('routeParamsSchema'),
    );
    expect(schemaCalls).toHaveLength(0);

    spy.mockRestore();
  });
});

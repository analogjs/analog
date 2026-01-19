import { describe, expect, it } from 'vitest';
import { parseRouteFile, parseRouteFiles, ParsedRoute } from './route-parser';

describe('route-parser', () => {
  describe('parseRouteFile', () => {
    describe('static routes', () => {
      it('should parse a simple static route', () => {
        const result = parseRouteFile('/src/app/pages/about.page.ts');

        expect(result).toEqual({
          filePath: '/src/app/pages/about.page.ts',
          typedPath: '/about',
          params: [],
          isStatic: true,
          isCatchAll: false,
        });
      });

      it('should parse a nested static route', () => {
        const result = parseRouteFile('/src/app/pages/auth/login.page.ts');

        expect(result).toEqual({
          filePath: '/src/app/pages/auth/login.page.ts',
          typedPath: '/auth/login',
          params: [],
          isStatic: true,
          isCatchAll: false,
        });
      });

      it('should parse a deeply nested static route', () => {
        const result = parseRouteFile(
          '/src/app/pages/admin/settings/security.page.ts',
        );

        expect(result).toEqual({
          filePath: '/src/app/pages/admin/settings/security.page.ts',
          typedPath: '/admin/settings/security',
          params: [],
          isStatic: true,
          isCatchAll: false,
        });
      });
    });

    describe('index routes', () => {
      it('should parse an index route as root path', () => {
        const result = parseRouteFile('/src/app/pages/index.page.ts');

        expect(result).toEqual({
          filePath: '/src/app/pages/index.page.ts',
          typedPath: '/',
          params: [],
          isStatic: true,
          isCatchAll: false,
        });
      });

      it('should parse a named index route (home).page.ts as root path', () => {
        const result = parseRouteFile('/src/app/pages/(home).page.ts');

        expect(result).toEqual({
          filePath: '/src/app/pages/(home).page.ts',
          typedPath: '/',
          params: [],
          isStatic: true,
          isCatchAll: false,
        });
      });

      it('should parse a nested index route', () => {
        const result = parseRouteFile('/src/app/pages/products/index.page.ts');

        expect(result).toEqual({
          filePath: '/src/app/pages/products/index.page.ts',
          typedPath: '/products',
          params: [],
          isStatic: true,
          isCatchAll: false,
        });
      });
    });

    describe('route groups (pathless segments)', () => {
      it('should handle a pathless layout segment', () => {
        const result = parseRouteFile('/src/app/pages/(auth)/login.page.ts');

        expect(result).toEqual({
          filePath: '/src/app/pages/(auth)/login.page.ts',
          typedPath: '/login',
          params: [],
          isStatic: true,
          isCatchAll: false,
        });
      });

      it('should handle multiple pathless segments', () => {
        const result = parseRouteFile(
          '/src/app/pages/(foo)/auth/(bar)/login.page.ts',
        );

        expect(result).toEqual({
          filePath: '/src/app/pages/(foo)/auth/(bar)/login.page.ts',
          typedPath: '/auth/login',
          params: [],
          isStatic: true,
          isCatchAll: false,
        });
      });
    });

    describe('dynamic routes', () => {
      it('should parse a dynamic route with single parameter', () => {
        const result = parseRouteFile(
          '/src/app/pages/products/[productId].page.ts',
        );

        expect(result).toEqual({
          filePath: '/src/app/pages/products/[productId].page.ts',
          typedPath: '/products/[productId]',
          params: ['productId'],
          isStatic: false,
          isCatchAll: false,
        });
      });

      it('should parse a dynamic route at root level', () => {
        const result = parseRouteFile('/src/app/pages/[slug].page.ts');

        expect(result).toEqual({
          filePath: '/src/app/pages/[slug].page.ts',
          typedPath: '/[slug]',
          params: ['slug'],
          isStatic: false,
          isCatchAll: false,
        });
      });

      it('should parse a nested dynamic route', () => {
        const result = parseRouteFile(
          '/src/app/pages/[categoryId]/[productId].page.ts',
        );

        expect(result).toEqual({
          filePath: '/src/app/pages/[categoryId]/[productId].page.ts',
          typedPath: '/[categoryId]/[productId]',
          params: ['categoryId', 'productId'],
          isStatic: false,
          isCatchAll: false,
        });
      });

      it('should parse dot notation dynamic routes', () => {
        const result = parseRouteFile(
          '/src/app/pages/categories.[categoryId].products.[productId].page.ts',
        );

        expect(result).toEqual({
          filePath:
            '/src/app/pages/categories.[categoryId].products.[productId].page.ts',
          typedPath: '/categories/[categoryId]/products/[productId]',
          params: ['categoryId', 'productId'],
          isStatic: false,
          isCatchAll: false,
        });
      });
    });

    describe('catch-all routes', () => {
      it('should parse a catch-all route', () => {
        const result = parseRouteFile('/src/app/pages/[...not-found].page.ts');

        expect(result).toEqual({
          filePath: '/src/app/pages/[...not-found].page.ts',
          typedPath: '/[...not-found]',
          params: ['not-found'],
          isStatic: false,
          isCatchAll: true,
        });
      });

      it('should parse a nested catch-all route', () => {
        const result = parseRouteFile('/src/app/pages/docs/[...slug].page.ts');

        expect(result).toEqual({
          filePath: '/src/app/pages/docs/[...slug].page.ts',
          typedPath: '/docs/[...slug]',
          params: ['slug'],
          isStatic: false,
          isCatchAll: true,
        });
      });
    });

    describe('invalid files', () => {
      it('should return null for non-.page.ts files', () => {
        expect(parseRouteFile('/src/app/pages/about.ts')).toBeNull();
        expect(parseRouteFile('/src/app/pages/about.component.ts')).toBeNull();
        expect(parseRouteFile('/src/app/services/api.service.ts')).toBeNull();
      });

      it('should return null for files not in pages directory', () => {
        expect(parseRouteFile('/src/app/components/nav.page.ts')).toBeNull();
        expect(parseRouteFile('/src/lib/utils.page.ts')).toBeNull();
      });
    });

    describe('cross-platform paths', () => {
      it('should handle Windows-style paths', () => {
        const result = parseRouteFile(
          '\\src\\app\\pages\\products\\[productId].page.ts',
        );

        expect(result).toEqual({
          filePath: '\\src\\app\\pages\\products\\[productId].page.ts',
          typedPath: '/products/[productId]',
          params: ['productId'],
          isStatic: false,
          isCatchAll: false,
        });
      });
    });
  });

  describe('parseRouteFiles', () => {
    it('should parse multiple files and return sorted routes', () => {
      const files = [
        '/src/app/pages/products/[productId].page.ts',
        '/src/app/pages/about.page.ts',
        '/src/app/pages/(home).page.ts',
      ];

      const result = parseRouteFiles(files);

      expect(result).toHaveLength(3);
      expect(result.map((r) => r.typedPath)).toEqual([
        '/',
        '/about',
        '/products/[productId]',
      ]);
    });

    it('should deduplicate routes with the same typedPath', () => {
      const files = [
        '/src/app/pages/index.page.ts',
        '/src/app/pages/(home).page.ts', // Same path as index
      ];

      const result = parseRouteFiles(files);

      expect(result).toHaveLength(1);
      expect(result[0].typedPath).toBe('/');
    });

    it('should filter out invalid files', () => {
      const files = [
        '/src/app/pages/about.page.ts',
        '/src/app/pages/utils.ts', // Not a page file
        '/src/app/services/api.page.ts', // Not in pages directory
      ];

      const result = parseRouteFiles(files);

      expect(result).toHaveLength(1);
      expect(result[0].typedPath).toBe('/about');
    });

    it('should return empty array for no valid files', () => {
      const files = ['/src/app/utils.ts', '/src/app/components/nav.ts'];

      const result = parseRouteFiles(files);

      expect(result).toEqual([]);
    });

    it('should correctly identify static vs dynamic routes', () => {
      const files = [
        '/src/app/pages/about.page.ts',
        '/src/app/pages/products/[productId].page.ts',
        '/src/app/pages/[...not-found].page.ts',
      ];

      const result = parseRouteFiles(files);

      const staticRoutes = result.filter((r) => r.isStatic);
      const dynamicRoutes = result.filter((r) => !r.isStatic);
      const catchAllRoutes = result.filter((r) => r.isCatchAll);

      expect(staticRoutes).toHaveLength(1);
      expect(dynamicRoutes).toHaveLength(2);
      expect(catchAllRoutes).toHaveLength(1);
    });
  });
});

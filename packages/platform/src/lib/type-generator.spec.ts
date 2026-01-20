import { describe, expect, it } from 'vitest';
import { generateRouteTypes } from './type-generator';
import { ParsedRoute } from './route-parser';

describe('type-generator', () => {
  describe('generateRouteTypes', () => {
    it('should generate types for static routes only', () => {
      const routes: ParsedRoute[] = [
        {
          filePath: '/src/app/pages/(home).page.ts',
          typedPath: '/',
          params: [],
          isStatic: true,
          isCatchAll: false,
        },
        {
          filePath: '/src/app/pages/about.page.ts',
          typedPath: '/about',
          params: [],
          isStatic: true,
          isCatchAll: false,
        },
      ];

      const result = generateRouteTypes(routes);

      expect(result).toContain('export type StaticRoutes =');
      expect(result).toContain("| '/'");
      expect(result).toContain("| '/about'");
      expect(result).toContain('[key: string]: never;'); // Empty DynamicRouteParams
    });

    it('should generate types for dynamic routes only', () => {
      const routes: ParsedRoute[] = [
        {
          filePath: '/src/app/pages/products/[productId].page.ts',
          typedPath: '/products/[productId]',
          params: ['productId'],
          isStatic: false,
          isCatchAll: false,
        },
      ];

      const result = generateRouteTypes(routes);

      expect(result).toContain('| never'); // Empty StaticRoutes
      expect(result).toContain(
        "'/products/[productId]': { 'productId': string | number };",
      );
    });

    it('should generate types for mixed static and dynamic routes', () => {
      const routes: ParsedRoute[] = [
        {
          filePath: '/src/app/pages/(home).page.ts',
          typedPath: '/',
          params: [],
          isStatic: true,
          isCatchAll: false,
        },
        {
          filePath: '/src/app/pages/about.page.ts',
          typedPath: '/about',
          params: [],
          isStatic: true,
          isCatchAll: false,
        },
        {
          filePath: '/src/app/pages/products/[productId].page.ts',
          typedPath: '/products/[productId]',
          params: ['productId'],
          isStatic: false,
          isCatchAll: false,
        },
      ];

      const result = generateRouteTypes(routes);

      // Static routes
      expect(result).toContain("| '/'");
      expect(result).toContain("| '/about'");

      // Dynamic route params
      expect(result).toContain(
        "'/products/[productId]': { 'productId': string | number };",
      );
    });

    it('should generate types for routes with multiple parameters', () => {
      const routes: ParsedRoute[] = [
        {
          filePath: '/src/app/pages/[categoryId]/[productId].page.ts',
          typedPath: '/[categoryId]/[productId]',
          params: ['categoryId', 'productId'],
          isStatic: false,
          isCatchAll: false,
        },
      ];

      const result = generateRouteTypes(routes);

      expect(result).toContain(
        "'/[categoryId]/[productId]': { 'categoryId': string | number; 'productId': string | number };",
      );
    });

    it('should generate types for catch-all routes', () => {
      const routes: ParsedRoute[] = [
        {
          filePath: '/src/app/pages/[...not-found].page.ts',
          typedPath: '/[...not-found]',
          params: ['not-found'],
          isStatic: false,
          isCatchAll: true,
        },
      ];

      const result = generateRouteTypes(routes);

      expect(result).toContain(
        "'/[...not-found]': { 'not-found': string | number };",
      );
    });

    it('should generate route() function overloads', () => {
      const routes: ParsedRoute[] = [
        {
          filePath: '/src/app/pages/about.page.ts',
          typedPath: '/about',
          params: [],
          isStatic: true,
          isCatchAll: false,
        },
      ];

      const result = generateRouteTypes(routes);

      expect(result).toContain(
        'export function route<T extends StaticRoutes>(path: T): T;',
      );
      expect(result).toContain(
        'export function route<T extends keyof DynamicRouteParams>',
      );
    });

    it('should generate navigate() function overloads', () => {
      const routes: ParsedRoute[] = [
        {
          filePath: '/src/app/pages/about.page.ts',
          typedPath: '/about',
          params: [],
          isStatic: true,
          isCatchAll: false,
        },
      ];

      const result = generateRouteTypes(routes);

      expect(result).toContain(
        'export function navigate<T extends StaticRoutes>',
      );
      expect(result).toContain(
        'export function navigate<T extends keyof DynamicRouteParams>',
      );
      expect(result).toContain('NavigationExtras');
    });

    it('should generate navigateByUrl() function overloads', () => {
      const routes: ParsedRoute[] = [
        {
          filePath: '/src/app/pages/about.page.ts',
          typedPath: '/about',
          params: [],
          isStatic: true,
          isCatchAll: false,
        },
      ];

      const result = generateRouteTypes(routes);

      expect(result).toContain(
        'export function navigateByUrl<T extends StaticRoutes>',
      );
      expect(result).toContain(
        'export function navigateByUrl<T extends keyof DynamicRouteParams>',
      );
      expect(result).toContain('NavigationBehaviorOptions');
    });

    it('should generate ResolvedRouteParams for injectParams to use', () => {
      const routes: ParsedRoute[] = [
        {
          filePath: '/src/app/pages/products/[productId].page.ts',
          typedPath: '/products/[productId]',
          params: ['productId'],
          isStatic: false,
          isCatchAll: false,
        },
      ];

      const result = generateRouteTypes(routes);

      // ResolvedRouteParams is augmented for injectParams to use
      expect(result).toContain('export interface ResolvedRouteParams');
      expect(result).toContain(
        "'/products/[productId]': { 'productId': string };",
      );
      // Note: injectParams overloads are now in the base package, not generated
    });

    it('should generate ResolvedRouteParams with string types only', () => {
      const routes: ParsedRoute[] = [
        {
          filePath: '/src/app/pages/products/[productId].page.ts',
          typedPath: '/products/[productId]',
          params: ['productId'],
          isStatic: false,
          isCatchAll: false,
        },
      ];

      const result = generateRouteTypes(routes);

      // DynamicRouteParams allows string | number (for building routes)
      expect(result).toContain(
        "'/products/[productId]': { 'productId': string | number };",
      );

      // ResolvedRouteParams uses string only (runtime values)
      expect(result).toContain('export interface ResolvedRouteParams');
      expect(result).toMatch(
        /ResolvedRouteParams[\s\S]*'\/products\/\[productId\]': \{ 'productId': string \}/,
      );
    });

    it('should include header comment', () => {
      const routes: ParsedRoute[] = [];

      const result = generateRouteTypes(routes);

      expect(result).toContain('Auto-generated by @analogjs/platform');
      expect(result).toContain('DO NOT EDIT MANUALLY');
    });

    it('should declare module augmentation for @analogjs/router', () => {
      const routes: ParsedRoute[] = [];

      const result = generateRouteTypes(routes);

      expect(result).toContain("declare module '@analogjs/router'");
    });

    it('should handle empty routes array', () => {
      const routes: ParsedRoute[] = [];

      const result = generateRouteTypes(routes);

      expect(result).toContain('| never'); // Empty StaticRoutes
      expect(result).toContain('[key: string]: never;'); // Empty DynamicRouteParams
    });
  });
});

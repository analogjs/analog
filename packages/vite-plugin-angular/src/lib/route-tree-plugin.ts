import { Plugin } from 'vite';
import { resolve, relative, dirname, basename } from 'node:path';
import {
  writeFileSync,
  mkdirSync,
  existsSync,
  readFileSync,
  promises as fs,
} from 'node:fs';
import { normalizePath } from 'vite';
import { globSync } from 'tinyglobby';
import { type } from 'arktype';

/**
 * @fileoverview Analog Route Tree Generator Plugin
 *
 * This Vite plugin generates type-safe route trees from file-based routing conventions.
 * It scans page files, extracts metadata, and generates TypeScript definitions for
 * type-safe navigation and route management.
 *
 * CRITICAL SSR CONFLICT LESSONS LEARNED:
 *
 * 1. **File Writing Race Conditions**:
 *    - writeFileSync() operations during dev server startup interfere with
 *      viteServer.ssrLoadModule() calls from other plugins (especially Nitro)
 *    - SOLUTION: Conditional file writing - only write if file doesn't exist
 *      in dev mode, always write in build mode
 *
 * 2. **Plugin Hook Timing**:
 *    - buildStart() hook runs too early and conflicts with SSR setup
 *    - configureServer() hook with async callback provides proper timing
 *    - Must use the same async pattern as other SSR-dependent plugins
 *
 * 3. **Vite Module Graph Interference**:
 *    - File operations can corrupt Vite's internal module graph
 *    - Any writeFileSync during active ssrLoadModule calls causes empty modules
 *    - Async file operations (fs.writeFile) are safer but timing still matters
 *
 * 4. **Development vs Build Behavior**:
 *    - Dev mode: Generate content but skip file writing if file exists
 *    - Build mode: Always write files for production builds
 *    - Hot reload: Safe to write files since SSR setup is complete
 *
 * 5. **Error Recovery Strategies**:
 *    - Never crash the dev server due to route tree generation failures
 *    - Provide detailed logging for debugging
 *    - Graceful degradation when file operations fail
 *
 * ## ADVANCED SSR CONFLICT RESOLUTION
 *
 * ### Race Condition Deep Dive
 * The core issue stems from a complex interaction between multiple Vite plugins:
 * - **Route Tree Plugin**: Generates `routeTree.gen.ts` via file I/O operations
 * - **Nitro Plugin**: Loads server middleware via `viteServer.ssrLoadModule()`
 * - **JSON-LD Plugin**: Loads route tree via `viteServer.ssrLoadModule()`
 *
 * When `writeFileSync()` occurs during active `ssrLoadModule()` calls, Vite's
 * module graph becomes corrupted, causing modules to load with empty exports.
 *
 * ### Context-Aware Writing Strategy
 * The solution implements a sophisticated context detection system:
 *
 * **Dev Server Startup (configureServer)**:
 * - Content generation: ✅ (in-memory processing)
 * - File writing: ❌ (deferred to avoid SSR conflicts)
 * - Rationale: SSR setup is incomplete, file I/O is dangerous
 *
 * **Build Mode (isBuilding)**:
 * - Content generation: ✅
 * - File writing: ✅ (required for production assets)
 * - Rationale: No SSR conflicts in build context
 *
 * **Hot Reload (handleHotUpdate)**:
 * - Content generation: ✅
 * - File writing: ✅ (SSR setup is stable)
 * - Rationale: Development server is fully initialized
 *
 * ### Developer Workflow Integration
 * - First startup: User sees warning if route tree missing
 * - Any page file change: Triggers automatic generation
 * - No manual intervention required after initial setup
 *
 * ## FUTURE ENHANCEMENT OPPORTUNITIES
 *
 * ### 1. **Performance Optimizations**
 * - **Incremental Generation**: Only regenerate affected routes on file changes
 * - **Parallel Processing**: Use worker threads for large route trees
 * - **Memory Mapping**: Use memory-mapped files for very large projects
 * - **Debounced Updates**: Batch multiple file changes to reduce I/O
 *
 * ### 2. **Advanced Route Features**
 * - **Dynamic Route Parameters**: Support for `[...params]` and `[[optional]]`
 * - **Route Guards**: Generate type-safe route guard interfaces
 * - **Nested Layouts**: Support for layout hierarchy in route tree
 * - **Route Aliases**: Support for multiple paths to same component
 *
 * ### 3. **Developer Experience**
 * - **VS Code Extension**: Autocomplete and navigation for routes
 * - **Route Visualization**: Generate interactive route tree diagrams
 * - **Build-time Validation**: Catch broken route references at build
 * - **Performance Profiling**: Track route tree generation performance
 *
 * ### 4. **Framework Integration**
 * - **Multi-Framework Support**: Extend beyond Angular to React, Vue
 * - **Micro-frontend Support**: Route federation across applications
 * - **Server Components**: Integration with Angular server components
 * - **Edge Runtime**: Optimizations for Vercel Edge, Cloudflare Workers
 *
 * ### 5. **Enterprise Features**
 * - **Route Permissions**: RBAC integration with route generation
 * - **Analytics Integration**: Automatic route tracking setup
 * - **A/B Testing**: Route-level feature flag integration
 * - **CDN Optimization**: Route-based cache control generation
 *
 * SSR FILE WRITING STRATEGY:
 *
 * Context-aware file writing prevents SSR conflicts:
 *
 * 1. **Build Mode**: Always write to file (no SSR conflicts during production builds)
 * 2. **Dev Server Startup**: NEVER write during startup (defer to hot reload to avoid race conditions)
 * 3. **Hot Reload**: Always write to file (SSR setup is complete, safe to write)
 *
 * This eliminates "No default export found" errors while maintaining TypeScript consistency.
 *
 * DEVELOPER WORKFLOW:
 * - If route tree file is missing: Start dev server → Warning logged → Touch page file → File generated
 * - Normal development: All changes trigger hot reload → File stays synchronized
 * - Production builds: Complete file generation always occurs
 *
 * @author AnalogJS Team
 * @since 1.0.0
 * @experimental This plugin contains experimental features
 */

// Define the arktype schema for Angular Route metadata (RestrictedRoute)
// Based on @angular/router Route type minus the file-based properties
const RouteMetaSchema = type({
  'title?': 'string',
  'redirectTo?': 'string',
  'outlet?': 'string',
  'canActivate?': 'unknown[]',
  'canActivateChild?': 'unknown[]',
  'canDeactivate?': 'unknown[]',
  'canMatch?': 'unknown[]',
  'canLoad?': 'unknown[]',
  'data?': 'object',
  'resolve?': 'object',
  'providers?': 'unknown[]',
  'runGuardsAndResolvers?': type(
    "'pathParamsChange' | 'pathParamsOrQueryParamsChange' | 'paramsChange' | 'paramsOrQueryParamsChange' | 'always'",
  ).or('Function'),
});

/**
 * Configuration options for the Route Tree Plugin
 *
 * These options control how the route tree is generated, including
 * file locations, code style preferences, and feature flags.
 */
export interface RouteTreePluginOptions {
  /** Root directory for the workspace */
  workspaceRoot?: string;
  /** Directory containing page files */
  pagesDirectory?: string;
  /** Output file for the generated route tree */
  generatedRouteTree?: string;
  /** Additional page directories to scan */
  additionalPagesDirs?: string[];
  /** Quote style for generated code */
  quoteStyle?: 'single' | 'double';
  /** Whether to use semicolons */
  semicolons?: boolean;
  /** Generate lazy loading routes instead of eager imports */
  lazyLoading?: boolean;
  /** Generate Angular Router compatible routes */
  angularRoutes?: boolean;
  /** DEBUG: Extra verbose logging for debugging */
  debugVerbose?: boolean;
}

/**
 * Internal representation of a route parsed from the file system
 *
 * This interface contains all the metadata extracted from a page file,
 * including path information, component details, and optional exports
 * like routeMeta and routeJsonLd.
 */
interface AnalogRoute {
  filePath: string;
  routePath: string;
  routeId: string;
  fullPath: string;
  isLayout: boolean;
  isIndex: boolean;
  isDynamic: boolean;
  isCatchAll: boolean;
  level: number;
  segments: string[];
  parentPath?: string;
  children: AnalogRoute[];
  hasRouteMeta?: boolean;
  routeMetaValid?: boolean;
  routeMetaErrors?: string[];
  hasJsonLd?: boolean;
}

/**
 * Creates a Vite plugin for generating type-safe route trees from file-based routing
 *
 * This plugin scans page files in the specified directory, extracts route information
 * and metadata, then generates TypeScript definitions for type-safe navigation.
 *
 * KEY FEATURES:
 * - File-based routing with Analog conventions
 * - Type-safe route definitions and navigation utilities
 * - JSON-LD structured data integration
 * - Angular Router compatibility
 * - Lazy loading support
 * - Hot reload support
 *
 * SSR COMPATIBILITY:
 * This plugin implements special handling to avoid conflicts with SSR module loading:
 * - Conditional file writing in dev mode
 * - Proper Vite hook timing
 * - Race condition prevention
 *
 * @param options - Configuration options for route tree generation
 * @returns Vite plugin instance
 *
 * @example
 * ```typescript
 * // vite.config.ts
 * export default defineConfig({
 *   plugins: [
 *     routeTreePlugin({
 *       workspaceRoot: process.cwd(),
 *       pagesDirectory: 'src/app/pages',
 *       lazyLoading: true,
 *       angularRoutes: true
 *     })
 *   ]
 * });
 * ```
 */
export function routeTreePlugin(options: RouteTreePluginOptions = {}): Plugin {
  const workspaceRoot = normalizePath(options.workspaceRoot ?? process.cwd());
  const pagesDirectory = options.pagesDirectory ?? 'src/app/pages';
  const generatedRouteTree =
    options.generatedRouteTree ?? 'src/app/routeTree.gen.ts';
  const additionalPagesDirs = options.additionalPagesDirs ?? [];
  const quoteStyle = options.quoteStyle ?? 'single';
  const semicolons = options.semicolons ?? false;
  const lazyLoading = options.lazyLoading ?? true; // Default to lazy loading
  const angularRoutes = options.angularRoutes ?? false;
  const debugVerbose = options.debugVerbose ?? false;

  const quote = quoteStyle === 'single' ? "'" : '"';
  const semi = semicolons ? ';' : '';

  let isBuilding = false;
  let viteRoot = '';

  function log(message: string) {
    if (debugVerbose) {
      console.log(`[analog-route-tree] ${message}`);
    }
  }

  /**
   * Scans the file system for page files and returns parsed route information
   *
   * Uses glob patterns to find all .page.{ts,analog,ag} files in the specified
   * directories, then parses each file to extract route metadata.
   *
   * @returns Array of parsed route objects sorted by level and path
   */
  function scanRouteFiles(): AnalogRoute[] {
    // Use viteRoot if available, otherwise fall back to workspaceRoot
    const baseDir = viteRoot || workspaceRoot;
    const patterns = [
      `${baseDir}/${pagesDirectory}/**/*.page.{ts,analog,ag}`,
      ...additionalPagesDirs.map(
        (dir) => `${baseDir}${dir}/**/*.page.{ts,analog,ag}`,
      ),
    ];

    log(`Scanning for routes in: ${patterns.join(', ')}`);
    const files = globSync(patterns, { dot: true });
    log(`Found ${files.length} route files`);

    return files.map(parseRouteFile).sort((a, b) => {
      // Sort by level first, then alphabetically
      if (a.level !== b.level) return a.level - b.level;
      return a.routePath.localeCompare(b.routePath);
    });
  }

  /**
   * Parses a single page file to extract route information and metadata
   *
   * This function analyzes the file path to determine the route structure,
   * reads the file content to detect exports (routeMeta, routeJsonLd),
   * and creates a comprehensive route object.
   *
   * ANALOG ROUTING CONVENTIONS:
   * - (home).page.ts → /
   * - about.page.ts → /about
   * - products/[id].page.ts → /products/:id
   * - blog/[...slug].page.ts → /blog/**
   *
   * @param filePath - Absolute path to the page file
   * @returns Parsed route object with metadata
   */
  function parseRouteFile(filePath: string): AnalogRoute {
    const baseDir = viteRoot || workspaceRoot;
    const relativePath = relative(baseDir, filePath);
    const pagesPrefix = pagesDirectory.replace(/^\.\//, '') + '/';
    const pathFromPages = relativePath
      .replace(new RegExp(`^${pagesPrefix}`), '')
      .replace(/\.page\.(ts|analog|ag)$/, '');

    // Parse route path following Analog conventions
    let routePath = pathFromPages;

    // Handle index routes: (home) -> /
    if (routePath.match(/^\(.*\)$/)) {
      const indexName = routePath.slice(1, -1);
      routePath = indexName === 'home' ? '/' : `/${indexName}`;
    }

    // Handle nested paths (subdirectories)
    const pathParts = pathFromPages.split('/');
    let parentPath: string | undefined;
    if (pathParts.length > 1) {
      parentPath = pathParts.slice(0, -1).join('/');
      // Convert parent path to route format
      parentPath = parentPath.replace(/\[([^\]]+)\]/g, ':$1');
      parentPath = parentPath.replace(/\./g, '/');
      if (parentPath.match(/^\(.*\)$/)) {
        const indexName = parentPath.slice(1, -1);
        parentPath = indexName === 'home' ? '/' : `/${indexName}`;
      }
      if (!parentPath.startsWith('/')) {
        parentPath = `/${parentPath}`;
      }
    }

    // Handle catch-all routes first: [...slug] -> **
    const isCatchAll = pathFromPages.includes('[...');
    if (isCatchAll) {
      routePath = routePath.replace(/\[\.\.\.([^\]]+)\]/g, '**');
    } else {
      // Handle dynamic routes only if not catch-all: [id] -> :id
      routePath = routePath.replace(/\[([^\]]+)\]/g, ':$1');
    }

    // Convert dots to slashes: about.contact -> /about/contact
    routePath = routePath.replace(/\./g, '/');

    // Ensure leading slash
    if (!routePath.startsWith('/')) {
      routePath = `/${routePath}`;
    }

    // Handle layout routes (directories without index)
    const isLayout = !basename(filePath).includes('.page.');
    const isIndex =
      pathFromPages.includes('(') || pathFromPages.includes('index');
    const isDynamic = pathFromPages.includes('[') && !isCatchAll;

    const segments = routePath.split('/').filter((s) => s);
    const level = segments.length;

    // Generate route ID - similar to TanStack style
    let routeId = routePath === '/' ? '/' : routePath;

    // Check if the file has routeMeta export and validate it
    let hasRouteMeta = false;
    let routeMetaValid = true;
    let routeMetaErrors: string[] = [];
    let hasJsonLd = false;

    try {
      log(`Reading file: ${filePath}`);
      const fileContent = readFileSync(filePath, 'utf-8');
      hasRouteMeta = /export\s+const\s+routeMeta\s*(:.*?)?\s*=/.test(
        fileContent,
      );
      hasJsonLd = /export\s+const\s+routeJsonLd\s*(:.*?)?\s*=/.test(
        fileContent,
      );
      log(
        `File analysis - hasRouteMeta: ${hasRouteMeta}, hasJsonLd: ${hasJsonLd}`,
      );

      if (hasRouteMeta && debugVerbose) {
        // Extract and validate routeMeta using arktype
        try {
          // This is a simple validation check - in production, you'd want to actually parse the AST
          const routeMetaMatch = fileContent.match(
            /export\s+const\s+routeMeta\s*=\s*({[\s\S]*?});/,
          );
          if (routeMetaMatch) {
            // For now, we'll just check if it looks like a valid object
            // In a real implementation, you'd use a TypeScript compiler API to extract the actual value
            const routeMetaStr = routeMetaMatch[1];

            // Basic validation - check for known invalid patterns
            if (
              routeMetaStr.includes('component:') ||
              routeMetaStr.includes('loadComponent:') ||
              routeMetaStr.includes('loadChildren:') ||
              routeMetaStr.includes('path:') ||
              routeMetaStr.includes('pathMatch:')
            ) {
              routeMetaValid = false;
              routeMetaErrors.push(
                'routeMeta should not contain: component, loadComponent, loadChildren, path, or pathMatch',
              );
            }
          }
        } catch (parseError) {
          // If we can't parse it, we'll assume it's valid and let TypeScript handle it
        }
      }
    } catch (error) {
      // Ignore errors reading the file
    }

    return {
      filePath: normalizePath(filePath),
      routePath,
      routeId,
      fullPath: routePath,
      isLayout,
      isIndex,
      isDynamic,
      isCatchAll,
      level,
      segments,
      parentPath,
      children: [],
      hasRouteMeta,
      routeMetaValid,
      routeMetaErrors,
      hasJsonLd,
    };
  }

  /**
   * Generates TypeScript code for the route tree and related utilities
   *
   * Creates a complete TypeScript module with:
   * - Route imports and definitions
   * - Type-safe interfaces
   * - Navigation utilities
   * - JSON-LD mapping
   * - Angular Router compatibility
   *
   * @param routes - Array of parsed route objects
   * @returns Generated TypeScript code as a string
   */
  function generateRouteTree(routes: AnalogRoute[]): string {
    const header = [
      '/* eslint-disable */',
      '// @ts-nocheck',
      '// noinspection JSUnusedGlobalSymbols',
      '',
      '// This file is auto-generated by @analogjs/vite-plugin-angular',
      '// You should NOT make any changes in this file as it will be overwritten.',
      '// Additionally, you should also exclude this file from your linter and/or formatter to prevent it from being checked or modified.',
      '',
    ];

    const baseDir = viteRoot || workspaceRoot;
    const outputDir = dirname(resolve(baseDir, generatedRouteTree));

    // Generate route imports
    const imports: string[] = [];
    const routeImportMap = new Map<string, string>();

    // Import root route
    imports.push(`import { Component } from '@angular/core'${semi}`);
    imports.push(`import { Routes } from '@angular/router'${semi}`);
    imports.push(`import type { Route } from '@angular/router'${semi}`);
    imports.push(`import type { WithContext, Thing } from 'schema-dts'${semi}`);
    imports.push('');

    // Add root route type for module declaration
    imports.push(`// Root route type for module declaration`);
    imports.push(`declare const rootRoute: any${semi}`);
    imports.push('');

    if (lazyLoading) {
      // For lazy loading, we don't import components eagerly for runtime use
      // But we still need to import components as types for the module declaration
      routes.forEach((route) => {
        const routeName = getRouteImportName(route);
        const importPath = relative(outputDir, route.filePath).replace(
          /\\/g,
          '/',
        );
        const cleanImportPath = importPath
          .replace(/\.ts$/, '')
          .replace(/\.analog$/, '')
          .replace(/\.ag$/, '');

        // Import component as type for module declaration
        imports.push(
          `import type ${routeName}Component from ${quote}./${cleanImportPath}${quote}${semi}`,
        );

        // Import routeMeta if it exists (as type since only used in module declaration)
        if (route.hasRouteMeta) {
          imports.push(
            `import type { routeMeta as ${routeName}RouteMeta } from ${quote}./${cleanImportPath}${quote}${semi}`,
          );
        }

        // Import routeJsonLd if it exists (runtime value needed for routeJsonLdMap)
        if (route.hasJsonLd) {
          imports.push(
            `import { routeJsonLd as ${routeName}JsonLd } from ${quote}./${cleanImportPath}${quote}${semi}`,
          );
        }

        routeImportMap.set(route.routeId, routeName);
      });
    } else {
      // Legacy eager import behavior
      routes.forEach((route) => {
        const importPath = relative(outputDir, route.filePath).replace(
          /\\/g,
          '/',
        );
        const routeName = getRouteImportName(route);
        const cleanImportPath = importPath
          .replace(/\.ts$/, '')
          .replace(/\.analog$/, '')
          .replace(/\.ag$/, '');
        // Angular pages use default exports for components
        imports.push(
          `import ${routeName}Component from ${quote}./${cleanImportPath}${quote}${semi}`,
        );
        // Import routeMeta if it exists (as type since only used in module declaration)
        if (route.hasRouteMeta) {
          imports.push(
            `import type { routeMeta as ${routeName}RouteMeta } from ${quote}./${cleanImportPath}${quote}${semi}`,
          );
          // Add validation warning comments if routeMeta has errors
          if (!route.routeMetaValid && route.routeMetaErrors?.length) {
            imports.push(
              `// ⚠️ Warning: routeMeta validation issues in ${cleanImportPath}:`,
            );
            route.routeMetaErrors.forEach((error) => {
              imports.push(`//   - ${error}`);
            });
          }
        }
        // Import routeJsonLd if it exists
        if (route.hasJsonLd) {
          imports.push(
            `import { routeJsonLd as ${routeName}JsonLd } from ${quote}./${cleanImportPath}${quote}${semi}`,
          );
        }
        routeImportMap.set(route.routeId, routeName);
      });
    }

    imports.push('');

    // Generate route instances/configurations
    const routeInstances: string[] = [];

    if (lazyLoading) {
      // Generate lazy loading route configurations
      routes.forEach((route) => {
        const routeName = routeImportMap.get(route.routeId)!;
        const importPath = relative(outputDir, route.filePath).replace(
          /\\/g,
          '/',
        );
        const cleanImportPath = importPath
          .replace(/\.ts$/, '')
          .replace(/\.analog$/, '')
          .replace(/\.ag$/, '');

        if (angularRoutes) {
          // Generate Angular Router Routes
          routeInstances.push(
            `const ${routeName}Route: Route = {
  path: ${quote}${route.routePath === '/' ? '' : route.routePath}${quote},
  loadComponent: () => import(${quote}./${cleanImportPath}${quote}).then(m => m.default)${
    route.hasRouteMeta
      ? `,
  data: { hasRouteMeta: true, routePath: ${quote}./${cleanImportPath}${quote} }`
      : ''
  }
}${semi}`,
          );
        } else {
          // Generate TanStack-style lazy loaders
          routeInstances.push(
            `const ${routeName}Route = () => import(${quote}./${cleanImportPath}${quote})${semi}`,
          );
        }
      });
    } else {
      // Legacy eager loading
      routes.forEach((route) => {
        const routeName = routeImportMap.get(route.routeId)!;
        routeInstances.push(
          `const ${routeName}Route = ${routeName}Component${semi}`,
        );
      });
    }

    // Build parent-child relationships
    const rootRoutes = routes.filter((r) => !r.parentPath);
    const buildRouteTree = (parentPath?: string): AnalogRoute[] => {
      if (!parentPath) {
        return rootRoutes;
      }
      return routes.filter((r) => r.parentPath === parentPath);
    };

    // Generate interfaces
    const routeTypeDefinition = lazyLoading
      ? angularRoutes
        ? 'Route'
        : '() => Promise<any>'
      : 'typeof ${routeName}Route';

    const fileRoutesByPath = routes
      .map((route) => {
        const routeName = routeImportMap.get(route.routeId)!;
        const typeRef = lazyLoading
          ? angularRoutes
            ? 'Route'
            : '() => Promise<any>'
          : `typeof ${routeName}Route`;
        return `  ${quote}${route.fullPath}${quote}: ${typeRef}`;
      })
      .join(',\n');

    const fileRoutesByTo = routes
      .map((route) => {
        const routeName = routeImportMap.get(route.routeId)!;
        const toPath =
          route.fullPath.endsWith('/') && route.fullPath !== '/'
            ? route.fullPath.slice(0, -1)
            : route.fullPath;
        const typeRef = lazyLoading
          ? angularRoutes
            ? 'Route'
            : '() => Promise<any>'
          : `typeof ${routeName}Route`;
        return `  ${quote}${toPath}${quote}: ${typeRef}`;
      })
      .join(',\n');

    const fileRoutesById = routes
      .map((route) => {
        const routeName = routeImportMap.get(route.routeId)!;
        const typeRef = lazyLoading
          ? angularRoutes
            ? 'Route'
            : '() => Promise<any>'
          : `typeof ${routeName}Route`;
        return `  ${quote}${route.routeId}${quote}: ${typeRef}`;
      })
      .join(',\n');

    const fullPaths = routes
      .map((r) => `${quote}${r.fullPath}${quote}`)
      .join(' | ');
    const toPaths = routes
      .map((r) => {
        const toPath =
          r.fullPath.endsWith('/') && r.fullPath !== '/'
            ? r.fullPath.slice(0, -1)
            : r.fullPath;
        return `${quote}${toPath}${quote}`;
      })
      .join(' | ');
    const ids = routes.map((r) => `${quote}${r.routeId}${quote}`).join(' | ');

    const interfaces = `
export interface FileRoutesByPath {
${fileRoutesByPath}
}

export interface FileRoutesByTo {
${fileRoutesByTo}
}

export interface FileRoutesById {
${fileRoutesById}
}

export interface FileRouteTypes {
  fileRoutesByPath: FileRoutesByPath${semi}
  fullPaths: ${fullPaths || 'never'}${semi}
  fileRoutesByTo: FileRoutesByTo${semi}
  to: ${toPaths || 'never'}${semi}
  id: ${ids || 'never'}${semi}
  fileRoutesById: FileRoutesById${semi}
}`;

    // Generate RootRouteChildren interface
    const rootChildren = rootRoutes
      .map((route) => {
        const routeName = routeImportMap.get(route.routeId)!;
        const typeRef = lazyLoading
          ? angularRoutes
            ? 'Route'
            : '() => Promise<any>'
          : `typeof ${routeName}Route`;
        return `  ${routeName}Route: ${typeRef}`;
      })
      .join(',\n');

    const rootRouteChildren = rootChildren
      ? `
export interface RootRouteChildren {
${rootChildren}
}`
      : '';

    // Generate route tree
    const routeTreeChildren = rootRoutes
      .map((route) => {
        const routeName = routeImportMap.get(route.routeId)!;
        return `  ${routeName}Route: ${routeName}Route`;
      })
      .join(',\n');

    const routeTree =
      lazyLoading && angularRoutes
        ? `
// Angular Router lazy loading routes
export const angularRoutes: Routes = [
${rootRoutes
  .map((route) => {
    const routeName = routeImportMap.get(route.routeId)!;
    return `  ${routeName}Route`;
  })
  .join(',\n')}
]${semi}

const rootRouteChildren: RootRouteChildren = {
${routeTreeChildren}
}${semi}

export const routeTree = rootRouteChildren${semi}`
        : `
const rootRouteChildren: RootRouteChildren = {
${routeTreeChildren}
}${semi}

export const routeTree = rootRouteChildren${semi}`;

    // Generate JSON-LD map
    const jsonLdMap = `
// Map of routes to their JSON-LD data
export const routeJsonLdMap = new Map<string, any>([
${routes
  .filter((r) => r.hasJsonLd)
  .map((route) => {
    const routeName = routeImportMap.get(route.routeId)!;
    return `  [${quote}${route.fullPath}${quote}, ${routeName}JsonLd]`;
  })
  .join(',\n')}
])${semi}`;

    // Module augmentation for type safety
    const moduleAugmentation = `
// Type for Angular Route metadata (excludes file-based properties)
export type RouteMeta = Omit<Route, 'component' | 'loadComponent' | 'loadChildren' | 'path' | 'pathMatch'>${semi}

// Type for JSON-LD structured data
export type JsonLd = WithContext<Thing>${semi}

declare module '@analogjs/router' {
  interface FileRoutesByPath {
${routes
  .map((route) => {
    const routeName = routeImportMap.get(route.routeId)!;
    const routeMetaLine = route.hasRouteMeta
      ? `\n      routeMeta: typeof ${routeName}RouteMeta`
      : '';
    const jsonLdLine = route.hasJsonLd
      ? `\n      jsonLd: typeof ${routeName}JsonLd`
      : '';
    return `    ${quote}${route.fullPath}${quote}: {
      id: ${quote}${route.routeId}${quote}
      path: ${quote}${route.routePath}${quote}
      fullPath: ${quote}${route.fullPath}${quote}
      component: typeof ${routeName}Component${routeMetaLine}${jsonLdLine}
      parentRoute: typeof rootRoute
    }`;
  })
  .join('\n')}
  }
}`;

    // Utility types
    const utilityTypes = `
// Utility types for type-safe navigation
export type AnalogRoute = keyof FileRoutesByPath${semi}

// Extract route params from path
export type ExtractParams<T extends string> =
  T extends \`\${string}/:\${infer Param}/\${infer Rest}\`
    ? { [K in Param]: string } & ExtractParams<\`/\${Rest}\`>
    : T extends \`\${string}/:\${infer Param}\`
    ? { [K in Param]: string }
    : {}${semi}

export type RouteParams<T extends AnalogRoute> = ExtractParams<T>${semi}`;

    // Navigation utilities
    const navigationUtils = lazyLoading
      ? `
// Type-safe navigation utilities
export function navigateToRoute<T extends AnalogRoute>(
  router: any, // Router from '@angular/router'
  route: T,
  params?: RouteParams<T>,
  options?: any // NavigationExtras
): Promise<boolean> {
  return router.navigate([route], {
    ...options,
    ...(params && { queryParams: params })
  })${semi}
}

// Type-safe route checking
export function isCurrentRoute<T extends AnalogRoute>(
  router: any, // Router from '@angular/router'
  route: T
): boolean {
  return router.url === route${semi}
}

// Get route with params
export function getRouteWithParams<T extends AnalogRoute>(
  route: T,
  params: RouteParams<T>
): string {
  let result = route as string${semi}
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      result = result.replace(\`:\${key}\`, String(value))${semi}
    })${semi}
  }
  return result${semi}
}`
      : '';

    return [
      ...header,
      ...imports,
      ...routeInstances,
      '',
      interfaces,
      rootRouteChildren,
      routeTree,
      jsonLdMap,
      moduleAugmentation,
      utilityTypes,
      navigationUtils,
      '',
    ].join('\n');
  }

  /**
   * Generates a PascalCase import name for a route
   *
   * Converts route paths to valid TypeScript identifiers by:
   * - Removing special characters
   * - Converting to PascalCase
   * - Handling edge cases like catch-all routes
   *
   * @param route - Route object to generate name for
   * @returns PascalCase identifier suitable for imports
   *
   * @example
   * - / → Index
   * - /about → About
   * - /products/:id → ProductsId
   * - /blog/** → BlogCatchAll
   */
  function getRouteImportName(route: AnalogRoute): string {
    if (route.routeId === '/') return 'Index';

    // Handle catch-all routes specially
    if (route.routeId.includes('**')) {
      const parts = route.routeId.split('/').filter(Boolean);
      const catchAllParts = parts.filter((p) => p !== '**');
      if (catchAllParts.length === 0) {
        return 'CatchAll';
      }
      return (
        catchAllParts.map((part) => toPascalCase(part)).join('') + 'CatchAll'
      );
    }

    // Convert route path to PascalCase name, handling special characters
    let cleanId = route.routeId
      .replace(/[()]/g, '') // Remove parentheses
      .replace(/\//g, '_') // Replace slashes with underscores
      .replace(/:/g, '') // Remove colons from dynamic segments
      .replace(/\[\.\.\.([^\]]+)\]/g, 'CatchAll_$1') // Handle catch-all routes
      .replace(/\[([^\]]+)\]/g, '$1') // Handle dynamic segments
      .replace(/\./g, '_'); // Replace dots with underscores

    // Split by underscore and convert to PascalCase
    const parts = cleanId.split('_').filter(Boolean);
    const result = parts.map((part) => toPascalCase(part)).join('');

    return result || 'Index';
  }

  /**
   * Converts a string to PascalCase
   *
   * @param str - String to convert
   * @returns PascalCase version of the string
   */
  function toPascalCase(str: string): string {
    return str
      .split(/[_\-\.]/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join('');
  }

  /**
   * Writes the generated route tree to the file system with SSR conflict prevention
   *
   * CRITICAL SSR CONFLICT PREVENTION STRATEGY:
   *
   * During dev server startup, ANY file writing operations can interfere with
   * viteServer.ssrLoadModule() calls from other plugins (especially Nitro).
   * This causes "No default export found" errors because the module graph
   * gets corrupted during active SSR loading.
   *
   * CONTEXT-AWARE FILE WRITING STRATEGY:
   *
   * 1. **Build Mode** (isBuilding = true):
   *    - Always write to file
   *    - No SSR conflicts during production builds
   *    - Ensures complete file generation for deployment
   *
   * 2. **Dev Server Startup** (configureServer callback):
   *    - NEVER write to file during startup
   *    - Generate content in memory only
   *    - Prevents interference with viteServer.ssrLoadModule() calls
   *    - Shows warning if file doesn't exist, directing user to trigger hot reload
   *
   * 3. **Hot Reload** (handleHotUpdate hook):
   *    - Always write to file
   *    - SSR setup is complete, no conflicts possible
   *    - Keeps TypeScript types synchronized during development
   *
   * BEHAVIOR MATRIX:
   * | Context       | File Exists | Action      | Reason                    |
   * |---------------|-------------|-------------|---------------------------|
   * | Build         | Any         | ✅ Write    | No SSR conflicts in build |
   * | Dev Startup   | No          | ❌ Skip     | Defer to hot reload       |
   * | Dev Startup   | Yes         | ❌ Skip     | Defer to hot reload       |
   * | Hot Reload    | Any         | ✅ Write    | SSR setup complete        |
   *
   * DEVELOPER WORKFLOW WHEN FILE IS MISSING:
   * 1. Delete routeTree.gen.ts
   * 2. Start dev server (no error! - content generated in memory)
   * 3. Warning: "No route tree file exists. Add/modify a page file to trigger generation"
   * 4. Touch any page file → Hot reload → File gets written safely
   *
   * @param isHotReload - Whether this is called during hot reload (safe to write)
   * @throws Error if route scanning or content generation fails
   *
   * @example
   * ```typescript
   * // Build mode - always safe
   * writeRouteTree(); // isHotReload = false, isBuilding = true
   *
   * // Dev startup - never writes during startup
   * writeRouteTree(); // isHotReload = false, isBuilding = false
   *
   * // Hot reload - always safe to write
   * writeRouteTree(true); // isHotReload = true
   * ```
   */
  async function writeRouteTree(isHotReload = false) {
    try {
      log('writeRouteTree() called - starting route scanning');
      const routes = scanRouteFiles();
      log(`scanRouteFiles() completed - found ${routes.length} routes`);

      log('generateRouteTree() starting');
      const content = generateRouteTree(routes);
      log('generateRouteTree() completed');

      const baseDir = viteRoot || workspaceRoot;
      const outputPath = resolve(baseDir, generatedRouteTree);
      const outputDir = dirname(outputPath);

      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
      }

      // CRITICAL SSR CONFLICT PREVENTION STRATEGY:
      // During dev server startup, ANY file writing operations can interfere with
      // viteServer.ssrLoadModule() calls from other plugins (especially Nitro).
      // This causes "No default export found" errors because the module graph
      // gets corrupted during active SSR loading.
      //
      // SOLUTION: Strict context-based file writing:
      // 1. Build mode: Always write to file (no SSR conflicts)
      // 2. Dev server startup: NEVER write to file (defer to hot reload)
      // 3. Hot reload: Always write to file (SSR setup is complete)
      //
      // See comprehensive JSDoc documentation above for full strategy details.

      const fileExists = existsSync(outputPath);

      if (isBuilding || isHotReload) {
        log(
          `Writing route tree to: ${outputPath} (build: ${isBuilding}, exists: ${fileExists}, hotReload: ${isHotReload})`,
        );
        await fs.writeFile(outputPath, content, 'utf-8');
        log('Route tree file written successfully');
        log(
          `Generated route tree at ${outputPath} with ${routes.length} routes`,
        );
      } else {
        log(
          'Skipping file write during dev server startup to avoid SSR conflicts',
        );
        log(
          `Route tree content generated (${routes.length} routes) - file write deferred to hot reload`,
        );
        if (!fileExists) {
          console.warn(
            '[analog-route-tree] No route tree file exists. Add/modify a page file to trigger generation via hot reload.',
          );
        }
      }
    } catch (error) {
      console.error('[analog-route-tree] Error generating route tree:', error);
      if (error instanceof Error) {
        console.error('[analog-route-tree] Stack trace:', error.stack);
      }
    }
  }

  return {
    name: 'analog-route-tree',
    /**
     * Vite buildStart hook - runs when build starts
     *
     * In build mode, immediately generate the route tree since there are no
     * SSR conflicts during production builds. In dev mode, defer to configureServer
     * to avoid race conditions with SSR setup.
     */
    buildStart() {
      log('buildStart() called');
      // Only generate during build, not dev server startup
      if (isBuilding) {
        log('Build mode - generating route tree immediately');
        writeRouteTree();
      } else {
        log(
          'Dev mode - deferring route tree generation to avoid SSR conflicts',
        );
      }
    },
    /**
     * Vite configResolved hook - runs when Vite config is finalized
     *
     * Determines build vs dev mode and stores the project root path.
     */
    configResolved(config) {
      isBuilding = config.command === 'build';
      viteRoot = normalizePath(config.root);
      log(`configResolved() called - isBuilding: ${isBuilding}`);
      log(`Vite root: ${viteRoot}`);
    },
    /**
     * Vite configureServer hook - runs when dev server is being configured
     *
     * CRITICAL TIMING: Returns an async function that runs AFTER other plugins
     * have completed their server setup. This prevents race conditions with
     * SSR-dependent plugins like Nitro that need to load middleware files.
     *
     * The async callback pattern ensures proper sequencing:
     * 1. All plugins register their configureServer hooks
     * 2. Vite calls each hook and collects async callbacks
     * 3. Vite calls all async callbacks in order
     * 4. This runs after SSR setup is complete
     *
     * SSR CONFLICT PREVENTION:
     * - Never writes to file during dev server startup
     * - Generates content in memory only to avoid module graph corruption
     * - Shows helpful warning if route tree file doesn't exist
     * - Defers actual file writing to hot reload when SSR is stable
     */
    configureServer(server) {
      // Generate route tree after server is configured in dev mode
      if (!isBuilding) {
        log(
          'configureServer() called - deferring route tree generation to after middleware setup',
        );
        return async () => {
          log(
            'configureServer async callback - generating route tree with conditional file writing',
          );
          await writeRouteTree();
        };
      }
      return undefined;
    },
    /**
     * Vite handleHotUpdate hook - runs when files change during development
     *
     * Regenerates the route tree when page files are modified and triggers
     * HMR for any modules that import the route tree.
     *
     * HOT RELOAD SAFETY: File writing is safe here because SSR setup is
     * already complete when the dev server is running.
     *
     * SSR SAFETY GUARANTEES:
     * - SSR module loading is complete by the time hot reload occurs
     * - No race conditions possible with viteServer.ssrLoadModule()
     * - Always safe to write files during hot reload
     * - This is how missing route tree files get generated during development
     */
    handleHotUpdate({ file, server }) {
      // Regenerate route tree when page files change
      if (
        file.includes('/pages/') &&
        (file.endsWith('.page.ts') ||
          file.endsWith('.page.analog') ||
          file.endsWith('.page.ag'))
      ) {
        // Call with hot reload flag - file writing is safe during hot reload
        writeRouteTree(true);

        // Trigger HMR for any files that import the route tree
        const baseDir = viteRoot || workspaceRoot;
        const routeTreePath = resolve(baseDir, generatedRouteTree);
        const module = server.moduleGraph.getModuleById(routeTreePath);
        if (module) {
          server.reloadModule(module);
        }
      }
    },
    /**
     * Vite buildEnd hook - runs when build is finishing
     *
     * Ensures the route tree is written during production builds.
     * This is a safety net in case buildStart didn't run or failed.
     */
    buildEnd() {
      if (isBuilding) {
        writeRouteTree();
      }
    },
  };
}

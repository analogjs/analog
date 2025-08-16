import { Plugin } from 'vite';
import { resolve, relative, dirname, basename } from 'node:path';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { normalizePath } from 'vite';
import { globSync } from 'tinyglobby';
import { type } from 'arktype';

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
  /** Whether to disable logging */
  disableLogging?: boolean;
  /** Generate lazy loading routes instead of eager imports */
  lazyLoading?: boolean;
  /** Generate Angular Router compatible routes */
  angularRoutes?: boolean;
}

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

export function routeTreePlugin(options: RouteTreePluginOptions = {}): Plugin {
  const workspaceRoot = normalizePath(options.workspaceRoot ?? process.cwd());
  const pagesDirectory = options.pagesDirectory ?? 'src/app/pages';
  const generatedRouteTree =
    options.generatedRouteTree ?? 'src/app/routeTree.gen.ts';
  const additionalPagesDirs = options.additionalPagesDirs ?? [];
  const quoteStyle = options.quoteStyle ?? 'single';
  const semicolons = options.semicolons ?? false;
  const disableLogging = options.disableLogging ?? false;
  const lazyLoading = options.lazyLoading ?? true; // Default to lazy loading
  const angularRoutes = options.angularRoutes ?? false;

  const quote = quoteStyle === 'single' ? "'" : '"';
  const semi = semicolons ? ';' : '';

  let isBuilding = false;
  let viteRoot = '';

  function log(message: string) {
    if (!disableLogging) {
      console.log(`[analog-route-tree] ${message}`);
    }
  }

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
      const fileContent = readFileSync(filePath, 'utf-8');
      hasRouteMeta = /export\s+const\s+routeMeta\s*(:.*?)?\s*=/.test(
        fileContent,
      );
      hasJsonLd = /export\s+const\s+routeJsonLd\s*(:.*?)?\s*=/.test(
        fileContent,
      );

      if (hasRouteMeta && !options.disableLogging) {
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

    if (lazyLoading) {
      // For lazy loading, we don't import components eagerly
      // Just generate the route name mapping
      routes.forEach((route) => {
        const routeName = getRouteImportName(route);
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
        // Import routeMeta if it exists
        if (route.hasRouteMeta) {
          imports.push(
            `import { routeMeta as ${routeName}RouteMeta } from ${quote}./${cleanImportPath}${quote}${semi}`,
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
  ...await import(${quote}./${cleanImportPath}${quote}).then(m => m.routeMeta || {})`
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

  function toPascalCase(str: string): string {
    return str
      .split(/[_\-\.]/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join('');
  }

  function writeRouteTree() {
    try {
      const routes = scanRouteFiles();
      const content = generateRouteTree(routes);

      const baseDir = viteRoot || workspaceRoot;
      const outputPath = resolve(baseDir, generatedRouteTree);
      const outputDir = dirname(outputPath);

      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
      }

      writeFileSync(outputPath, content);
      log(`Generated route tree at ${outputPath} with ${routes.length} routes`);
    } catch (error) {
      console.error('[analog-route-tree] Error generating route tree:', error);
    }
  }

  return {
    name: 'analog-route-tree',
    buildStart() {
      // Generate initial route tree
      writeRouteTree();
    },
    configResolved(config) {
      isBuilding = config.command === 'build';
      viteRoot = normalizePath(config.root);
      log(`Vite root: ${viteRoot}`);
    },
    handleHotUpdate({ file, server }) {
      // Regenerate route tree when page files change
      if (
        file.includes('/pages/') &&
        (file.endsWith('.page.ts') ||
          file.endsWith('.page.analog') ||
          file.endsWith('.page.ag'))
      ) {
        writeRouteTree();
        // Trigger HMR for any files that import the route tree
        const baseDir = viteRoot || workspaceRoot;
        const routeTreePath = resolve(baseDir, generatedRouteTree);
        const module = server.moduleGraph.getModuleById(routeTreePath);
        if (module) {
          server.reloadModule(module);
        }
      }
    },
    buildEnd() {
      if (isBuilding) {
        writeRouteTree();
      }
    },
  };
}

/**
 * Route parser for type-safe routing.
 * Parses page file paths into route definitions.
 */

export interface ParsedRoute {
  /** Original file path */
  filePath: string;
  /** Type-safe path format: /products/[productId] */
  typedPath: string;
  /** Dynamic parameters: ['productId'] */
  params: string[];
  /** No dynamic segments */
  isStatic: boolean;
  /** Has [...param] catch-all */
  isCatchAll: boolean;
}

/**
 * Extracts the pages directory relative path from a full file path.
 * Handles both /src/app/pages/ and /app/pages/ structures.
 */
function extractPagesPath(filePath: string): string | null {
  // Match paths containing /pages/ and extract everything after it
  const pagesMatch = filePath.match(/[/\\]pages[/\\](.+)$/);
  if (!pagesMatch) {
    return null;
  }
  return pagesMatch[1];
}

/**
 * Converts a file path segment to a route path segment.
 * Handles index routes, route groups, and dynamic segments.
 */
function segmentToPath(segment: string): string {
  // Remove .page.ts extension
  segment = segment.replace(/\.page\.ts$/, '');

  // Handle index routes: index or (name) -> empty
  if (segment === 'index' || /^\(.*\)$/.test(segment)) {
    return '';
  }

  // Keep dynamic segments as-is: [id], [...slug]
  // Keep regular segments as-is
  return segment;
}

/**
 * Extracts dynamic parameter names from a path.
 * Handles both [param] and [...param] patterns.
 */
function extractParams(typedPath: string): string[] {
  const params: string[] = [];

  // Match [...param] catch-all first
  const catchAllMatches = typedPath.matchAll(/\[\.\.\.([^\]]+)\]/g);
  for (const match of catchAllMatches) {
    params.push(match[1]);
  }

  // Match [param] regular dynamic segments
  const dynamicMatches = typedPath.matchAll(/\[([^\].]+)\]/g);
  for (const match of dynamicMatches) {
    // Skip if already captured as catch-all
    if (!params.includes(match[1])) {
      params.push(match[1]);
    }
  }

  return params;
}

/**
 * Parses a single page file path into a route definition.
 * Returns null if the file is not a valid page file.
 */
export function parseRouteFile(filePath: string): ParsedRoute | null {
  // Only process .page.ts files
  if (!filePath.endsWith('.page.ts')) {
    return null;
  }

  const pagesPath = extractPagesPath(filePath);
  if (!pagesPath) {
    return null;
  }

  // Split by both / and \ for cross-platform support, then by . for dot notation
  const rawSegments = pagesPath.split(/[/\\]/).flatMap((segment) => {
    // Don't split dynamic segments like [productId].page.ts
    // Check if segment contains .page.ts to handle the file name
    if (segment.endsWith('.page.ts')) {
      // Remove extension first, then split by dots
      const withoutExt = segment.replace(/\.page\.ts$/, '');
      // Split by dots but preserve [...param] patterns
      const parts: string[] = [];
      let current = '';
      let inBracket = false;

      for (let i = 0; i < withoutExt.length; i++) {
        const char = withoutExt[i];
        if (char === '[') {
          inBracket = true;
          current += char;
        } else if (char === ']') {
          inBracket = false;
          current += char;
        } else if (char === '.' && !inBracket) {
          if (current) {
            parts.push(current);
            current = '';
          }
        } else {
          current += char;
        }
      }
      if (current) {
        parts.push(current);
      }

      // Re-add .page.ts to the last part for processing
      if (parts.length > 0) {
        parts[parts.length - 1] += '.page.ts';
      }
      return parts;
    }
    return [segment];
  });

  // Convert segments to path parts
  const pathParts = rawSegments
    .map(segmentToPath)
    .filter((part) => part !== '');

  // Build the typed path
  const typedPath = '/' + pathParts.join('/');

  // Extract parameters
  const params = extractParams(typedPath);

  // Check for catch-all
  const isCatchAll = typedPath.includes('[...');

  return {
    filePath,
    typedPath: typedPath || '/',
    params,
    isStatic: params.length === 0,
    isCatchAll,
  };
}

/**
 * Parses multiple page file paths into route definitions.
 * Filters out invalid files and deduplicates routes.
 */
export function parseRouteFiles(filePaths: string[]): ParsedRoute[] {
  const routes: ParsedRoute[] = [];
  const seenPaths = new Set<string>();

  for (const filePath of filePaths) {
    const route = parseRouteFile(filePath);
    if (route && !seenPaths.has(route.typedPath)) {
      routes.push(route);
      seenPaths.add(route.typedPath);
    }
  }

  // Sort alphabetically for deterministic output
  routes.sort((a, b) => a.typedPath.localeCompare(b.typedPath));

  return routes;
}

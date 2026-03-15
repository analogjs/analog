/**
 * Route manifest generation for typed file routes.
 *
 * This module contains pure functions (no Angular dependencies)
 * for converting discovered filenames into typed route manifests.
 */

export interface RouteParamInfo {
  name: string;
  type: 'dynamic' | 'catchAll' | 'optionalCatchAll';
}

export interface RouteSchemaInfo {
  hasParamsSchema: boolean;
  hasQuerySchema: boolean;
}

export interface RouteEntry {
  /** The route path pattern (e.g., '/users/[id]') */
  path: string;
  /** Extracted parameter information */
  params: RouteParamInfo[];
  /** Original filename that produced this route */
  filename: string;
  /** Schema export info (detected from file content) */
  schemas: RouteSchemaInfo;
}

export interface RouteManifest {
  routes: RouteEntry[];
}

/**
 * Converts a discovered filename to a route path pattern.
 *
 * Uses the same stripping rules as the existing route system
 * but preserves bracket param syntax instead of converting to
 * Angular's `:param` syntax.
 *
 * Examples:
 * - '/app/routes/index.ts' → '/'
 * - '/app/routes/about.ts' → '/about'
 * - '/src/app/pages/users/[id].page.ts' → '/users/[id]'
 * - '/app/routes/blog.[slug].ts' → '/blog/[slug]'
 * - '/src/app/pages/(auth)/login.page.ts' → '/login'
 * - '/src/app/pages/docs/[...slug].page.ts' → '/docs/[...slug]'
 * - '/src/app/pages/shop/[[...category]].page.ts' → '/shop/[[...category]]'
 */
export function filenameToRoutePath(filename: string): string {
  // Step 1: Strip route directory prefix and file extension.
  // This uses the same regex as toRawPath in routes.ts.
  let path = filename.replace(
    /^(?:[a-zA-Z]:[\\/])?(.*?)[\\/](?:routes|pages)[\\/]|(?:[\\/](?:app[\\/](?:routes|pages)|src[\\/]content)[\\/])|(\.page\.(js|ts|analog|ag)$)|(\.(ts|md|analog|ag)$)/g,
    '',
  );

  // Step 2: Convert dots to slashes for segment separation
  // (e.g., blog.[slug] → blog/[slug])
  // Protect bracket content first (dots in [...slug] must survive).
  const brackets: string[] = [];
  path = path.replace(/\[\[?\.{0,3}[^\]]*\]?\]/g, (match) => {
    brackets.push(match);
    return `\0B${brackets.length - 1}\0`;
  });
  path = path.replace(/\./g, '/');
  path = path.replace(/\0B(\d+)\0/g, (_, idx) => brackets[Number(idx)]);

  // Step 3: Split into segments and filter
  const segments = path.split('/').filter(Boolean);
  const processed: string[] = [];

  for (const segment of segments) {
    // Skip pathless group segments like (auth), (foo), (home)
    // These are layout wrappers that don't appear in the URL.
    // Bracket params like [id], [...slug], [[...slug]] are preserved.
    if (/^\([^.[\]]*\)$/.test(segment)) {
      continue;
    }
    processed.push(segment);
  }

  // Remove trailing 'index' — it maps to the parent path
  if (processed.length > 0 && processed[processed.length - 1] === 'index') {
    processed.pop();
  }

  // Step 4: Reconstruct with leading slash
  return '/' + processed.join('/');
}

/**
 * Extracts parameter information from a route path pattern.
 *
 * Examples:
 * - '/about' → []
 * - '/users/[id]' → [{ name: 'id', type: 'dynamic' }]
 * - '/docs/[...slug]' → [{ name: 'slug', type: 'catchAll' }]
 * - '/shop/[[...category]]' → [{ name: 'category', type: 'optionalCatchAll' }]
 * - '/[categoryId]/[productId]' → [
 *     { name: 'categoryId', type: 'dynamic' },
 *     { name: 'productId', type: 'dynamic' }
 *   ]
 */
export function extractRouteParams(routePath: string): RouteParamInfo[] {
  const params: RouteParamInfo[] = [];

  // Match [[...param]] — optional catch-all (check before [...param])
  for (const match of routePath.matchAll(/\[\[\.\.\.([^\]]+)\]\]/g)) {
    params.push({ name: match[1], type: 'optionalCatchAll' });
  }

  // Match [...param] — required catch-all (exclude [[...param]])
  for (const match of routePath.matchAll(/(?<!\[)\[\.\.\.([^\]]+)\](?!\])/g)) {
    params.push({ name: match[1], type: 'catchAll' });
  }

  // Match [param] — dynamic (exclude [...param] and [[...param]])
  for (const match of routePath.matchAll(/(?<!\[)\[(?!\.)([^\]]+)\](?!\])/g)) {
    params.push({ name: match[1], type: 'dynamic' });
  }

  return params;
}

/**
 * Detects whether a route file exports schema constants.
 *
 * Looks for `export const routeParamsSchema` and
 * `export const routeQuerySchema` patterns.
 */
export function detectSchemaExports(fileContent: string): RouteSchemaInfo {
  return {
    hasParamsSchema: /export\s+const\s+routeParamsSchema\b/.test(fileContent),
    hasQuerySchema: /export\s+const\s+routeQuerySchema\b/.test(fileContent),
  };
}

/**
 * No-schema fallback for content files and when detection is skipped.
 */
const NO_SCHEMAS: RouteSchemaInfo = {
  hasParamsSchema: false,
  hasQuerySchema: false,
};

/**
 * Generates a route manifest from a list of discovered filenames.
 *
 * @param filenames  Discovered route/content file paths.
 * @param schemaDetector  Optional callback that receives a filename and
 *   returns schema detection info. When omitted, no schema detection is
 *   performed (all routes treated as schema-less).
 */
export function generateRouteManifest(
  filenames: string[],
  schemaDetector?: (filename: string) => RouteSchemaInfo,
): RouteManifest {
  const routes: RouteEntry[] = [];
  const seen = new Map<string, string>();

  for (const filename of filenames) {
    const path = filenameToRoutePath(filename);
    const params = extractRouteParams(path);
    const schemas = schemaDetector ? schemaDetector(filename) : NO_SCHEMAS;

    // Detect collisions
    if (seen.has(path)) {
      console.warn(
        `[Analog] Route collision: '${path}' is defined by both '${seen.get(path)}' and '${filename}'`,
      );
    }
    seen.set(path, filename);

    routes.push({ path, params, filename, schemas });
  }

  // Sort: static first, then dynamic, then catch-all
  routes.sort((a, b) => {
    const aWeight = getRouteWeight(a.path);
    const bWeight = getRouteWeight(b.path);
    if (aWeight !== bWeight) return aWeight - bWeight;
    return a.path.localeCompare(b.path);
  });

  return { routes };
}

function getRouteWeight(path: string): number {
  if (path.includes('[[...')) return 3;
  if (path.includes('[...')) return 2;
  if (path.includes('[')) return 1;
  return 0;
}

/**
 * Generates a TypeScript declaration string for the route table.
 *
 * The output uses module augmentation on '@analogjs/router' so that
 * `AnalogRouteTable` is available wherever the router is imported.
 *
 * When routes export `routeParamsSchema` or `routeQuerySchema`, the
 * generated file imports those schemas and uses
 * `StandardSchemaV1.InferOutput` for precise typing.
 */
export function generateRouteTableDeclaration(manifest: RouteManifest): string {
  const lines: string[] = [];
  const hasAnySchema = manifest.routes.some(
    (r) => r.schemas.hasParamsSchema || r.schemas.hasQuerySchema,
  );

  lines.push('// This file is auto-generated by @analogjs/platform');
  lines.push('// Do not edit manually');
  lines.push('');

  // Import StandardSchemaV1 only when schemas are referenced
  if (hasAnySchema) {
    lines.push(
      "import type { StandardSchemaV1 } from '@standard-schema/spec';",
    );
  }

  // Import schema exports from route files
  const schemaImports: Map<string, string> = new Map();
  let aliasIndex = 0;

  for (const route of manifest.routes) {
    if (route.schemas.hasParamsSchema || route.schemas.hasQuerySchema) {
      const importPath = filenameToImportPath(route.filename);
      const names: string[] = [];

      if (route.schemas.hasParamsSchema) {
        const alias = `_p${aliasIndex}`;
        names.push(`routeParamsSchema as ${alias}`);
        schemaImports.set(`${route.path}:params`, alias);
      }
      if (route.schemas.hasQuerySchema) {
        const alias = `_q${aliasIndex}`;
        names.push(`routeQuerySchema as ${alias}`);
        schemaImports.set(`${route.path}:query`, alias);
      }

      lines.push(`import type { ${names.join(', ')} } from '${importPath}';`);
      aliasIndex++;
    }
  }

  if (hasAnySchema) {
    lines.push('');
  }

  lines.push("declare module '@analogjs/router' {");
  lines.push('  interface AnalogRouteTable {');

  for (const route of manifest.routes) {
    const paramsAlias = schemaImports.get(`${route.path}:params`);
    const queryAlias = schemaImports.get(`${route.path}:query`);

    const paramsType = paramsAlias
      ? `StandardSchemaV1.InferOutput<typeof ${paramsAlias}>`
      : generateParamsType(route.params);

    const queryType = queryAlias
      ? `StandardSchemaV1.InferOutput<typeof ${queryAlias}>`
      : 'Record<string, string | string[] | undefined>';

    lines.push(`    '${route.path}': {`);
    lines.push(`      params: ${paramsType};`);
    lines.push(`      query: ${queryType};`);
    lines.push(`    };`);
  }

  lines.push('  }');
  lines.push('}');
  lines.push('');
  lines.push('export {};');
  lines.push('');

  return lines.join('\n');
}

/**
 * Converts a route filename to a relative import path from `.analog/`.
 *
 * `/src/app/pages/users/[id].page.ts` → `../src/app/pages/users/[id].page`
 */
function filenameToImportPath(filename: string): string {
  // Strip leading slash and .ts extension
  const stripped = filename.replace(/^\//, '').replace(/\.ts$/, '');
  return '../' + stripped;
}

function generateParamsType(params: RouteParamInfo[]): string {
  if (params.length === 0) return 'Record<string, never>';

  const entries = params.map((p) => {
    const key = isValidIdentifier(p.name) ? p.name : `'${p.name}'`;
    switch (p.type) {
      case 'dynamic':
        return `${key}: string`;
      case 'catchAll':
        return `${key}: string[]`;
      case 'optionalCatchAll':
        return `${key}?: string[]`;
    }
  });

  return `{ ${entries.join('; ')} }`;
}

function isValidIdentifier(name: string): boolean {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name);
}

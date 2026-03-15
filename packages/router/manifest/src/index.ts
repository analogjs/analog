/**
 * @analogjs/router/manifest
 *
 * Shared route-manifest engine for typed file routes.
 *
 * This secondary entry point contains pure functions (no Angular
 * dependencies) for converting discovered filenames into typed
 * route manifests. It is consumed by both:
 *
 * - `@analogjs/router` (re-exports for public API)
 * - `@analogjs/platform` (Vite plugin for codegen)
 *
 * Having a single source of truth prevents the manifest logic
 * from drifting between packages.
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
 * - '/app/routes/index.ts' -> '/'
 * - '/app/routes/about.ts' -> '/about'
 * - '/src/app/pages/users/[id].page.ts' -> '/users/[id]'
 * - '/app/routes/blog.[slug].ts' -> '/blog/[slug]'
 * - '/src/app/pages/(auth)/login.page.ts' -> '/login'
 * - '/src/app/pages/docs/[...slug].page.ts' -> '/docs/[...slug]'
 * - '/src/app/pages/shop/[[...category]].page.ts' -> '/shop/[[...category]]'
 */
export function filenameToRoutePath(filename: string): string {
  let path = filename.replace(
    /^(?:[a-zA-Z]:[\\/])?(.*?)[\\/](?:routes|pages)[\\/]|(?:[\\/](?:app[\\/](?:routes|pages)|src[\\/]content)[\\/])|(\.page\.(js|ts|analog|ag)$)|(\.(ts|md|analog|ag)$)/g,
    '',
  );

  const brackets: string[] = [];
  path = path.replace(/\[\[?\.{0,3}[^\]]*\]?\]/g, (match) => {
    brackets.push(match);
    return `\0B${brackets.length - 1}\0`;
  });
  path = path.replace(/\./g, '/');
  path = path.replace(/\0B(\d+)\0/g, (_, idx) => brackets[Number(idx)]);

  const segments = path.split('/').filter(Boolean);
  const processed: string[] = [];

  for (const segment of segments) {
    if (/^\([^.[\]]*\)$/.test(segment)) continue;
    processed.push(segment);
  }

  if (processed.length > 0 && processed[processed.length - 1] === 'index') {
    processed.pop();
  }

  return '/' + processed.join('/');
}

/**
 * Extracts parameter information from a route path pattern.
 */
export function extractRouteParams(routePath: string): RouteParamInfo[] {
  const params: RouteParamInfo[] = [];

  for (const match of routePath.matchAll(/\[\[\.\.\.([^\]]+)\]\]/g)) {
    params.push({ name: match[1], type: 'optionalCatchAll' });
  }
  for (const match of routePath.matchAll(/(?<!\[)\[\.\.\.([^\]]+)\](?!\])/g)) {
    params.push({ name: match[1], type: 'catchAll' });
  }
  for (const match of routePath.matchAll(/(?<!\[)\[(?!\.)([^\]]+)\](?!\])/g)) {
    params.push({ name: match[1], type: 'dynamic' });
  }

  return params;
}

/**
 * Detects whether a route file exports schema constants.
 */
export function detectSchemaExports(fileContent: string): RouteSchemaInfo {
  return {
    hasParamsSchema: /export\s+const\s+routeParamsSchema\b/.test(fileContent),
    hasQuerySchema: /export\s+const\s+routeQuerySchema\b/.test(fileContent),
  };
}

const NO_SCHEMAS: RouteSchemaInfo = {
  hasParamsSchema: false,
  hasQuerySchema: false,
};

/**
 * Generates a route manifest from a list of discovered filenames.
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

    if (seen.has(path)) {
      console.warn(
        `[Analog] Route collision: '${path}' is defined by both ` +
          `'${seen.get(path)}' and '${filename}'`,
      );
    }
    seen.set(path, filename);

    routes.push({ path, params, filename, schemas });
  }

  routes.sort((a, b) => {
    const aW = getRouteWeight(a.path);
    const bW = getRouteWeight(b.path);
    if (aW !== bW) return aW - bW;
    return a.path.localeCompare(b.path);
  });

  for (const route of routes) {
    if (route.schemas.hasParamsSchema && route.params.length === 0) {
      console.warn(
        `[Analog] Route '${route.path}' exports routeParamsSchema` +
          ` but has no dynamic params in the filename.`,
      );
    }
  }

  return { routes };
}

function getRouteWeight(path: string): number {
  if (path.includes('[[...')) return 3;
  if (path.includes('[...')) return 2;
  if (path.includes('[')) return 1;
  return 0;
}

/**
 * Produces a human-readable summary of the generated route manifest.
 */
export function formatManifestSummary(manifest: RouteManifest): string {
  const lines: string[] = [];
  const total = manifest.routes.length;
  const withSchemas = manifest.routes.filter(
    (r) => r.schemas.hasParamsSchema || r.schemas.hasQuerySchema,
  ).length;
  const staticCount = manifest.routes.filter(
    (r) => r.params.length === 0,
  ).length;
  const dynamicCount = total - staticCount;

  lines.push(`[Analog] Generated typed routes:`);
  lines.push(
    `  ${total} routes (${staticCount} static, ${dynamicCount} dynamic)`,
  );
  if (withSchemas > 0) {
    lines.push(`  ${withSchemas} with schema validation`);
  }

  for (const route of manifest.routes) {
    const flags: string[] = [];
    if (route.schemas.hasParamsSchema) flags.push('params-schema');
    if (route.schemas.hasQuerySchema) flags.push('query-schema');
    const suffix = flags.length > 0 ? ` [${flags.join(', ')}]` : '';
    lines.push(`  ${route.path}${suffix}`);
  }

  return lines.join('\n');
}

/**
 * Generates a TypeScript declaration string for the route table.
 */
export function generateRouteTableDeclaration(manifest: RouteManifest): string {
  const lines: string[] = [];
  const hasAnySchema = manifest.routes.some(
    (r) => r.schemas.hasParamsSchema || r.schemas.hasQuerySchema,
  );

  lines.push('// This file is auto-generated by @analogjs/platform');
  lines.push('// Do not edit manually');
  lines.push('');

  if (hasAnySchema) {
    lines.push(
      "import type { StandardSchemaV1 } from '@standard-schema/spec';",
    );
  }

  const schemaImports = new Map<string, string>();
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

    const paramsType = generateParamsType(route.params);
    const queryType = 'Record<string, string | string[] | undefined>';

    const paramsOutputType = paramsAlias
      ? `StandardSchemaV1.InferOutput<typeof ${paramsAlias}>`
      : paramsType;
    const queryOutputType = queryAlias
      ? `StandardSchemaV1.InferOutput<typeof ${queryAlias}>`
      : queryType;

    lines.push(`    '${route.path}': {`);
    lines.push(`      params: ${paramsType};`);
    lines.push(`      paramsOutput: ${paramsOutputType};`);
    lines.push(`      query: ${queryType};`);
    lines.push(`      queryOutput: ${queryOutputType};`);
    lines.push(`    };`);
  }

  lines.push('  }');
  lines.push('}');
  lines.push('');
  lines.push('export {};');
  lines.push('');

  return lines.join('\n');
}

function filenameToImportPath(filename: string): string {
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

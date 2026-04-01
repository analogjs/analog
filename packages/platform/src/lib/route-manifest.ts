/**
 * Route-manifest engine for typed file routes.
 *
 * Pure functions (no Angular dependencies) for converting discovered
 * filenames into typed route manifests and generated declarations.
 */

export interface RouteParamInfo {
  name: string;
  type: 'dynamic' | 'catchAll' | 'optionalCatchAll';
}

export interface RouteSchemaInfo {
  hasParamsSchema: boolean;
  hasQuerySchema: boolean;
}

export interface GenerateRouteTreeDeclarationOptions {
  jsonLdFiles?: Iterable<string>;
}

export interface RouteEntry {
  /** Stable structural route id derived from the source filename */
  id: string;
  /** The route path segment relative to the nearest existing parent route */
  path: string;
  /** The fully resolved navigation path pattern (e.g., '/users/[id]') */
  fullPath: string;
  /** Extracted parameter information */
  params: RouteParamInfo[];
  /** Original filename that produced this route */
  filename: string;
  /** Schema export info (detected from file content) */
  schemas: RouteSchemaInfo;
  /** Type of source that produced this route */
  kind: 'page' | 'content';
  /** Parent route id, or null for top-level routes */
  parentId: string | null;
  /** Child route ids */
  children: string[];
  /** Whether the source filename represents an index route */
  isIndex: boolean;
  /** Whether the source filename includes route-group/pathless segments */
  isGroup: boolean;
  /** Whether the route contains a required catch-all parameter */
  isCatchAll: boolean;
  /** Whether the route contains an optional catch-all parameter */
  isOptionalCatchAll: boolean;
}

export interface RouteManifest {
  routes: RouteEntry[];
  /** Canonical route per fullPath — precomputed once to avoid redundant work. */
  canonicalByFullPath: Map<string, RouteEntry>;
}

/**
 * Converts a discovered filename to a route path pattern.
 *
 * Uses the same stripping rules as the existing route system
 * but preserves bracket param syntax instead of converting to
 * Angular's `:param` syntax.
 *
 * The regex applies four alternations (left to right, all replaced with ''):
 *   1. `^(.*?)[\\/](?:routes|pages|content)[\\/]` — anchored, strips everything
 *      up to and including the first /routes/, /pages/, or /content/ segment.
 *      Handles app-local paths (`/src/app/pages/`) AND additional dirs
 *      (`/libs/shared/feature/src/content/`) uniformly.
 *   2. `[\\/](?:app[\\/](?:routes|pages)|src[\\/]content)[\\/]` — non-anchored
 *      fallback for legacy paths where the directory marker appears mid-string.
 *   3. `\.page\.(js|ts|analog|ag)$` — strips page file extensions.
 *   4. `\.(ts|md|analog|ag)$` — strips remaining file extensions.
 *
 * Examples:
 * - '/app/routes/index.ts' -> '/'
 * - '/app/routes/about.ts' -> '/about'
 * - '/src/app/pages/users/[id].page.ts' -> '/users/[id]'
 * - '/app/routes/blog.[slug].ts' -> '/blog/[slug]'
 * - '/src/app/pages/(auth)/login.page.ts' -> '/login'
 * - '/src/app/pages/docs/[...slug].page.ts' -> '/docs/[...slug]'
 * - '/src/app/pages/shop/[[...category]].page.ts' -> '/shop/[[...category]]'
 * - '/libs/shared/feature/src/content/test.md' -> '/test'
 */
export function filenameToRoutePath(filename: string): string {
  let path = filename.replace(
    /^(?:[a-zA-Z]:[\\/])?(.*?)[\\/](?:routes|pages|content)[\\/]|(?:[\\/](?:app[\\/](?:routes|pages)|src[\\/]content)[\\/])|(\.page\.(js|ts|analog|ag)$)|(\.(ts|md|analog|ag)$)/g,
    '',
  );

  const brackets: string[] = [];
  path = path.replace(/\[\[?\.{0,3}[^\]]*\]?\]/g, (match) => {
    brackets.push(match);
    // eslint-disable-next-line no-control-regex
    return `\0B${brackets.length - 1}\0`;
  });
  path = path.replace(/\./g, '/');
  // eslint-disable-next-line no-control-regex
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
 * Converts a discovered filename to a stable structural route id.
 *
 * Unlike `filenameToRoutePath`, this preserves route groups and `index`
 * segments so that multiple files resolving to the same URL shape can still
 * have distinct structural identities in the generated route tree metadata.
 *
 * Uses the same directory-stripping regex as `filenameToRoutePath` —
 * changes to the regex must be kept in sync between both functions.
 */
export function filenameToRouteId(filename: string): string {
  let path = filename.replace(
    /^(?:[a-zA-Z]:[\\/])?(.*?)[\\/](?:routes|pages|content)[\\/]|(?:[\\/](?:app[\\/](?:routes|pages)|src[\\/]content)[\\/])|(\.page\.(js|ts|analog|ag)$)|(\.(ts|md|analog|ag)$)/g,
    '',
  );

  const brackets: string[] = [];
  path = path.replace(/\[\[?\.{0,3}[^\]]*\]?\]/g, (match) => {
    brackets.push(match);
    // eslint-disable-next-line no-control-regex
    return `\0B${brackets.length - 1}\0`;
  });
  path = path.replace(/\./g, '/');
  // eslint-disable-next-line no-control-regex
  path = path.replace(/\0B(\d+)\0/g, (_, idx) => brackets[Number(idx)]);

  const segments = path.split('/').filter(Boolean);

  return '/' + segments.join('/');
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
 *
 * @param collisionPriority - Optional callback that returns a numeric priority
 *   for each filename (lower wins). When provided, this replaces the default
 *   hard-coded path-substring heuristic with config-derived precedence.
 */
export function generateRouteManifest(
  filenames: string[],
  schemaDetector?: (filename: string) => RouteSchemaInfo,
  collisionPriority?: (filename: string) => number,
): RouteManifest {
  const routes: RouteEntry[] = [];
  const seenByFullPath = new Map<string, string>();
  const getPriority = collisionPriority ?? getCollisionPriority;

  // Prefer app-local route files over shared/external sources when two files
  // resolve to the same URL. This keeps `additionalPagesDirs` additive instead
  // of unexpectedly overriding the route that lives inside the app itself.
  const prioritizedFilenames = [...filenames].sort((a, b) => {
    const aPriority = getPriority(a);
    const bPriority = getPriority(b);
    if (aPriority !== bPriority) {
      return aPriority - bPriority;
    }
    return a.localeCompare(b);
  });

  for (const filename of prioritizedFilenames) {
    const fullPath = filenameToRoutePath(filename);
    const params = extractRouteParams(fullPath);
    const schemas = schemaDetector ? schemaDetector(filename) : NO_SCHEMAS;
    const id = filenameToRouteId(filename);
    const isPathlessLayout = isPathlessLayoutId(id);

    // Pathless layouts (e.g. (auth).page.ts) are structural wrappers that
    // render a <router-outlet> — they coexist with index.page.ts at the same
    // fullPath without collision. The Angular router handles them as nested
    // layout routes, not competing page components.
    if (!isPathlessLayout) {
      if (seenByFullPath.has(fullPath)) {
        const winningFilename = seenByFullPath.get(fullPath);
        console.warn(
          `[Analog] Route collision: '${fullPath}' is defined by both ` +
            `'${winningFilename}' and '${filename}'. ` +
            `Keeping '${winningFilename}' based on route source precedence and skipping duplicate.`,
        );
        continue;
      }
      seenByFullPath.set(fullPath, filename);
    }

    routes.push({
      id,
      path: fullPath,
      fullPath,
      params,
      filename,
      schemas,
      kind: filename.endsWith('.md') ? 'content' : 'page',
      parentId: null,
      children: [],
      isIndex: id === '/index' || id.endsWith('/index'),
      isGroup: isPathlessLayout,
      isCatchAll: params.some((param) => param.type === 'catchAll'),
      isOptionalCatchAll: params.some(
        (param) => param.type === 'optionalCatchAll',
      ),
    });
  }

  routes.sort((a, b) => {
    const aW = getRouteWeight(a.fullPath);
    const bW = getRouteWeight(b.fullPath);
    if (aW !== bW) return aW - bW;
    return a.fullPath.localeCompare(b.fullPath);
  });

  const routeByFullPath = canonicalRoutesByFullPath(routes);

  const routeById = new Map(routes.map((route) => [route.id, route]));

  for (const route of routes) {
    // Use structural id-based parent lookup for any route whose id
    // contains a group segment — this wires group children (e.g.
    // /(auth)/sign-up) to their pathless layout parent (/(auth)).
    // This also correctly handles nested groups like
    // /dashboard/(settings)/profile: findNearestParentById walks up
    // id segments and finds /(settings) if it exists, otherwise falls
    // through to fullPathParent which resolves to /dashboard.
    // Non-group routes always use the canonical fullPath-based lookup.
    const hasGroupSegment = route.id.includes('/(');
    const structuralParent = hasGroupSegment
      ? findNearestParentById(route.id, routeById)
      : undefined;
    const fullPathParent = findNearestParentRoute(
      route.fullPath,
      routeByFullPath,
    );
    const parent = structuralParent ?? fullPathParent;
    route.parentId = parent?.id ?? null;
    route.path = computeLocalPath(route.fullPath, parent?.fullPath ?? null);
  }

  for (const route of routes) {
    if (route.parentId) {
      routeById.get(route.parentId)?.children.push(route.id);
    }
  }

  for (const route of routes) {
    if (route.schemas.hasParamsSchema && route.params.length === 0) {
      console.warn(
        `[Analog] Route '${route.fullPath}' exports routeParamsSchema` +
          ` but has no dynamic params in the filename.`,
      );
    }
  }

  // Build-time consistency check: every parentId and child reference must
  // point to a real route in the manifest. Invalid references indicate a
  // bug in the hierarchy computation.
  for (const route of routes) {
    if (route.parentId && !routeById.has(route.parentId)) {
      console.warn(
        `[Analog] Route '${route.id}' has parentId '${route.parentId}' ` +
          `which does not match any route id in the manifest.`,
      );
    }
    for (const childId of route.children) {
      if (!routeById.has(childId)) {
        console.warn(
          `[Analog] Route '${route.id}' lists child '${childId}' ` +
            `which does not match any route id in the manifest.`,
        );
      }
    }
  }

  return { routes, canonicalByFullPath: routeByFullPath };
}

function canonicalRoutesByFullPath(
  routes: RouteEntry[],
): Map<string, RouteEntry> {
  const map = new Map<string, RouteEntry>();
  for (const route of routes) {
    const existing = map.get(route.fullPath);
    if (!existing) {
      map.set(route.fullPath, route);
    } else if (existing.isGroup && !route.isGroup) {
      // Non-group routes always take precedence over group layouts.
      map.set(route.fullPath, route);
    } else if (existing.isGroup && route.isGroup) {
      // Both are group layouts — tiebreak by id to ensure stable selection
      // regardless of filesystem or glob ordering across platforms.
      if (route.id.localeCompare(existing.id) < 0) {
        map.set(route.fullPath, route);
      }
    }
  }
  return map;
}

// Matches group names like (auth), (home) — intentionally excludes dots and
// brackets so names like (auth.v2) or ([id]) are NOT treated as pathless
// layouts. Dot-containing names collide with dynamic-segment syntax.
function isPathlessLayoutId(id: string): boolean {
  const segments = id.split('/').filter(Boolean);
  if (segments.length === 0) return false;
  return /^\([^.[\]]+\)$/.test(segments[segments.length - 1]);
}

function getRouteWeight(path: string): number {
  if (path.includes('[[...')) return 3;
  if (path.includes('[...')) return 2;
  if (path.includes('[')) return 1;
  return 0;
}

function getCollisionPriority(filename: string): number {
  if (
    filename.includes('/src/app/pages/') ||
    filename.includes('/src/app/routes/') ||
    filename.includes('/app/pages/') ||
    filename.includes('/app/routes/') ||
    filename.includes('/src/content/')
  ) {
    return 0;
  }

  return 1;
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
    lines.push(`  ${route.fullPath}${suffix}`);
  }

  return lines.join('\n');
}

/**
 * Generates the route-table section for the combined generated route module.
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
        schemaImports.set(`${route.fullPath}:params`, alias);
      }
      if (route.schemas.hasQuerySchema) {
        const alias = `_q${aliasIndex}`;
        names.push(`routeQuerySchema as ${alias}`);
        schemaImports.set(`${route.fullPath}:query`, alias);
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

  for (const route of manifest.canonicalByFullPath.values()) {
    const paramsAlias = schemaImports.get(`${route.fullPath}:params`);
    const queryAlias = schemaImports.get(`${route.fullPath}:query`);

    const paramsType = generateParamsType(route.params);
    const queryType = 'Record<string, string | string[] | undefined>';

    const paramsOutputType = paramsAlias
      ? `StandardSchemaV1.InferOutput<typeof ${paramsAlias}>`
      : paramsType;
    const queryOutputType = queryAlias
      ? `StandardSchemaV1.InferOutput<typeof ${queryAlias}>`
      : queryType;

    lines.push(`    '${route.fullPath}': {`);
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

/**
 * Generates the route-tree section for the combined generated route module.
 */
export function generateRouteTreeDeclaration(
  manifest: RouteManifest,
  options: GenerateRouteTreeDeclarationOptions = {},
): string {
  const lines: string[] = [];
  const jsonLdFiles = new Set(options.jsonLdFiles ?? []);

  lines.push('// This file is auto-generated by @analogjs/platform');
  lines.push('// Do not edit manually');
  lines.push('');
  lines.push('export interface AnalogGeneratedRouteRecord<');
  lines.push('  TId extends string = string,');
  lines.push('  TPath extends string = string,');
  lines.push('  TFullPath extends string = string,');
  lines.push('  TParentId extends string | null = string | null,');
  lines.push('  TChildren extends readonly string[] = readonly string[],');
  lines.push('> {');
  lines.push('  id: TId;');
  lines.push('  path: TPath;');
  lines.push('  fullPath: TFullPath;');
  lines.push('  parentId: TParentId;');
  lines.push('  children: TChildren;');
  lines.push('  sourceFile: string;');
  lines.push("  kind: 'page' | 'content';");
  lines.push('  hasParamsSchema: boolean;');
  lines.push('  hasQuerySchema: boolean;');
  lines.push('  hasJsonLd: boolean;');
  lines.push('  isIndex: boolean;');
  lines.push('  isGroup: boolean;');
  lines.push('  isCatchAll: boolean;');
  lines.push('  isOptionalCatchAll: boolean;');
  lines.push('}');
  lines.push('');
  lines.push('export interface AnalogFileRoutesById {');
  for (const route of manifest.routes) {
    lines.push(
      `  ${toTsKey(route.id)}: AnalogGeneratedRouteRecord<${toTsStringLiteral(route.id)}, ${toTsStringLiteral(route.path)}, ${toTsStringLiteral(route.fullPath)}, ${route.parentId ? toTsStringLiteral(route.parentId) : 'null'}, ${toReadonlyTupleType(route.children)}>;`,
    );
  }
  lines.push('}');
  lines.push('');
  lines.push('export interface AnalogFileRoutesByFullPath {');
  for (const route of manifest.canonicalByFullPath.values()) {
    lines.push(
      `  ${toTsKey(route.fullPath)}: AnalogFileRoutesById[${toTsStringLiteral(route.id)}];`,
    );
  }
  lines.push('}');
  lines.push('');
  lines.push('export type AnalogRouteTreeId = keyof AnalogFileRoutesById;');
  lines.push(
    'export type AnalogRouteTreeFullPath = keyof AnalogFileRoutesByFullPath;',
  );
  lines.push('');
  lines.push('export const analogRouteTree = {');
  lines.push('  byId: {');
  for (const route of manifest.routes) {
    lines.push(`    ${toObjectKey(route.id)}: {`);
    lines.push(`      id: ${toTsStringLiteral(route.id)},`);
    lines.push(`      path: ${toTsStringLiteral(route.path)},`);
    lines.push(`      fullPath: ${toTsStringLiteral(route.fullPath)},`);
    lines.push(
      `      parentId: ${route.parentId ? toTsStringLiteral(route.parentId) : 'null'},`,
    );
    lines.push(`      children: ${toReadonlyTupleValue(route.children)},`);
    lines.push(`      sourceFile: ${toTsStringLiteral(route.filename)},`);
    lines.push(`      kind: ${toTsStringLiteral(route.kind)},`);
    lines.push(
      `      hasParamsSchema: ${String(route.schemas.hasParamsSchema)},`,
    );
    lines.push(
      `      hasQuerySchema: ${String(route.schemas.hasQuerySchema)},`,
    );
    lines.push(`      hasJsonLd: ${String(jsonLdFiles.has(route.filename))},`);
    lines.push(`      isIndex: ${String(route.isIndex)},`);
    lines.push(`      isGroup: ${String(route.isGroup)},`);
    lines.push(`      isCatchAll: ${String(route.isCatchAll)},`);
    lines.push(
      `      isOptionalCatchAll: ${String(route.isOptionalCatchAll)},`,
    );
    lines.push(
      `    } satisfies AnalogFileRoutesById[${toTsStringLiteral(route.id)}],`,
    );
  }
  lines.push('  },');
  lines.push('  byFullPath: {');
  for (const route of manifest.canonicalByFullPath.values()) {
    lines.push(
      `    ${toObjectKey(route.fullPath)}: ${toTsStringLiteral(route.id)},`,
    );
  }
  lines.push('  },');
  lines.push('} as const;');
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

function findNearestParentById(
  id: string,
  routesById: Map<string, RouteEntry>,
): RouteEntry | undefined {
  if (id === '/') {
    return undefined;
  }

  const segments = id.split('/').filter(Boolean);
  for (let index = segments.length - 1; index > 0; index--) {
    const candidate = '/' + segments.slice(0, index).join('/');
    const route = routesById.get(candidate);
    if (route) {
      return route;
    }
  }

  return undefined;
}

function findNearestParentRoute(
  fullPath: string,
  routesByFullPath: Map<string, RouteEntry>,
): RouteEntry | undefined {
  if (fullPath === '/') {
    return undefined;
  }

  const segments = fullPath.slice(1).split('/');
  for (let index = segments.length - 1; index > 0; index--) {
    const candidate = '/' + segments.slice(0, index).join('/');
    const route = routesByFullPath.get(candidate);
    if (route) {
      return route;
    }
  }

  return undefined;
}

function computeLocalPath(
  fullPath: string,
  parentFullPath: string | null,
): string {
  if (fullPath === '/') {
    return '/';
  }

  if (!parentFullPath) {
    return fullPath.slice(1);
  }

  const suffix = fullPath.slice(parentFullPath.length).replace(/^\/+/, '');
  return suffix || '/';
}

function toTsStringLiteral(value: string): string {
  return JSON.stringify(value);
}

function toTsKey(value: string): string {
  return toTsStringLiteral(value);
}

function toObjectKey(value: string): string {
  return isValidIdentifier(value) ? value : toTsStringLiteral(value);
}

function toReadonlyTupleType(values: readonly string[]): string {
  if (values.length === 0) {
    return 'readonly []';
  }

  return `readonly [${values.map((value) => toTsStringLiteral(value)).join(', ')}]`;
}

function toReadonlyTupleValue(values: readonly string[]): string {
  if (values.length === 0) {
    return '[] as const';
  }

  return `[${values.map((value) => toTsStringLiteral(value)).join(', ')}] as const`;
}

// --- JSON-LD utilities ---

export type JsonLdObject = Record<string, unknown>;

export function isJsonLdObject(value: unknown): value is JsonLdObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeJsonLd(value: unknown): JsonLdObject[] {
  if (Array.isArray(value)) {
    return value.filter(isJsonLdObject);
  }

  return isJsonLdObject(value) ? [value] : [];
}

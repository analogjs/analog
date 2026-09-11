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

export interface RouteCollision {
  fullPath: string;
  keptFile: string;
  droppedFile: string;
  /** True when both files have the same collision priority (hard error). */
  samePriority: boolean;
}

export interface RouteManifest {
  routes: RouteEntry[];
  collisions: RouteCollision[];
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
  // Match beta's toSegment ordering: strip index and named empty segments
  // before expanding dot notation, at every nesting level.
  path = path.replace(/index|\(.*?\)/g, '').replace(/\./g, '/');
  // eslint-disable-next-line no-control-regex
  path = path.replace(/\0B(\d+)\0/g, (_, idx) => brackets[Number(idx)]);
  return '/' + path.split('/').filter(Boolean).join('/');
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
  path = path.replace(/\(.*?\)|\[\[?\.{0,3}[^\]]*\]?\]/g, (match) => {
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
 * Generates a route manifest from a list of discovered filenames.
 *
 * @param collisionPriority - Optional callback that returns a numeric priority
 *   for each filename (lower wins). When provided, this replaces the default
 *   hard-coded path-substring heuristic with config-derived precedence.
 */
export function generateRouteManifest(
  filenames: string[],
  collisionPriority?: (filename: string) => number,
): RouteManifest {
  const routes: RouteEntry[] = [];
  const collisions: RouteCollision[] = [];
  const seenByFullPath = new Map<
    string,
    { filename: string; priority: number }
  >();
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
    const id = filenameToRouteId(filename);
    const isPathlessLayout = isPathlessLayoutId(id);
    // Different pathless branches can select the same URL with canMatch guards.
    const groupScope = id.slice(0, id.lastIndexOf(')') + 1);
    const collisionKey = JSON.stringify([fullPath, groupScope]);

    const currentPriority = getPriority(filename);

    // Pathless layouts (e.g. (auth).page.ts) are structural wrappers that
    // render a <router-outlet> — they coexist with index.page.ts at the same
    // fullPath without collision. The Angular router handles them as nested
    // layout routes, not competing page components.
    if (!isPathlessLayout) {
      if (seenByFullPath.has(collisionKey)) {
        const winner = seenByFullPath.get(collisionKey)!;
        if (winner.filename === filename) {
          continue;
        }
        // A layout file (e.g., docs.page.ts) and its index child
        // (e.g., docs/index.page.ts) intentionally share the same route
        // path — the layout wraps the index as a parent-child pair.
        const isLayoutIndexPair = (a: string, b: string) => {
          const indexRe = /\/index\.(page\.)?(ts|js|md|analog|ag)$/;
          const layoutRe = /\.(page\.)?(ts|js|analog|ag)$/;
          if (indexRe.test(a) && layoutRe.test(b)) {
            const dir = a.replace(indexRe, '');
            const layout = b.replace(layoutRe, '');
            return dir === layout;
          }
          return false;
        };
        if (
          isLayoutIndexPair(winner.filename, filename) ||
          isLayoutIndexPair(filename, winner.filename)
        ) {
          continue;
        }
        collisions.push({
          fullPath,
          keptFile: winner.filename,
          droppedFile: filename,
          samePriority: winner.priority === currentPriority,
        });
        console.warn(
          `[Analog] Route collision: '${fullPath}' is defined by both ` +
            `'${winner.filename}' and '${filename}'. ` +
            `Keeping '${winner.filename}' based on route source precedence and skipping duplicate.`,
        );
        continue;
      }
      seenByFullPath.set(collisionKey, { filename, priority: currentPriority });
    }

    routes.push({
      id,
      path: fullPath,
      fullPath,
      params,
      filename,
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

  return { routes, collisions, canonicalByFullPath: routeByFullPath };
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

function isPathlessLayoutId(id: string): boolean {
  const segments = id.split('/').filter(Boolean);
  if (segments.length === 0) return false;
  return /^\([^)]*\)$/.test(segments[segments.length - 1]);
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
 * Generates the route-table section for the combined generated route module.
 */
export function generateRouteTableDeclaration(manifest: RouteManifest): string {
  const lines: string[] = [];
  lines.push('/** @noprettier */');
  lines.push('// This file is auto-generated by @analogjs/platform');
  lines.push("import type {} from '@analogjs/router';");
  lines.push("declare module '@analogjs/router' {");
  lines.push('  interface AnalogRouteTable {');

  for (const route of manifest.canonicalByFullPath.values()) {
    const paramsType = generateParamsType(route.params);
    const queryType = 'Record<string, string | string[] | undefined>';

    lines.push(`    ${JSON.stringify(route.fullPath)}: {`);
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

function generateParamsType(params: RouteParamInfo[]): string {
  if (params.length === 0) return 'Record<string, never>';

  const entries = params.map((p) => {
    const key = isValidIdentifier(p.name) ? p.name : JSON.stringify(p.name);
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

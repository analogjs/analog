import { normalizePath, Plugin } from 'vite';
import { globSync } from 'tinyglobby';
import { resolve, join } from 'node:path';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';

import type { Options } from './options.js';

// ── Inlined route-manifest types and functions ──────────────────────
// These are duplicated from @analogjs/router to avoid cross-package
// source imports that break TypeScript's rootDir constraint.
// The canonical implementations live in packages/router/src/lib/route-manifest.ts.

interface RouteParamInfo {
  name: string;
  type: 'dynamic' | 'catchAll' | 'optionalCatchAll';
}

interface RouteSchemaInfo {
  hasParamsSchema: boolean;
  hasQuerySchema: boolean;
}

interface RouteEntry {
  path: string;
  params: RouteParamInfo[];
  filename: string;
  schemas: RouteSchemaInfo;
}

interface RouteManifest {
  routes: RouteEntry[];
}

const NO_SCHEMAS: RouteSchemaInfo = {
  hasParamsSchema: false,
  hasQuerySchema: false,
};

function filenameToRoutePath(filename: string): string {
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

function extractRouteParams(routePath: string): RouteParamInfo[] {
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

function detectSchemaExports(fileContent: string): RouteSchemaInfo {
  return {
    hasParamsSchema: /export\s+const\s+routeParamsSchema\b/.test(fileContent),
    hasQuerySchema: /export\s+const\s+routeQuerySchema\b/.test(fileContent),
  };
}

function generateRouteManifest(
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

function isValidIdentifier(name: string): boolean {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name);
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

function filenameToImportPath(filename: string): string {
  const stripped = filename.replace(/^\//, '').replace(/\.ts$/, '');
  return '../' + stripped;
}

function generateRouteTableDeclaration(manifest: RouteManifest): string {
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

function formatManifestSummary(manifest: RouteManifest): string {
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

// ── Plugin ──────────────────────────────────────────────────────────

/**
 * Vite plugin that generates typed route declarations.
 *
 * Discovers the same route and content files as the main router plugin,
 * then generates `.analog/routes.gen.ts` with module augmentation for
 * `@analogjs/router`'s `AnalogRouteTable` interface.
 *
 * The generated file provides:
 * - Autocomplete for route path strings
 * - Type-safe params for each route
 * - Module augmentation (no explicit import needed)
 */
export function routeGenerationPlugin(options?: Options): Plugin {
  const workspaceRoot = normalizePath(options?.workspaceRoot ?? process.cwd());
  let root: string;

  function discoverRouteFiles(): string[] {
    return globSync(
      [
        `${root}/app/routes/**/*.ts`,
        `${root}/src/app/routes/**/*.ts`,
        `${root}/src/app/pages/**/*.page.ts`,
        ...(options?.additionalPagesDirs || []).map(
          (glob) => `${workspaceRoot}${glob}/**/*.page.ts`,
        ),
      ],
      { dot: true, absolute: true },
    ).map((f) => {
      const normalized = normalizePath(f);
      return normalized.startsWith(root)
        ? normalized.replace(root, '')
        : normalized;
    });
  }

  function discoverContentFiles(): string[] {
    return globSync(
      [
        `${root}/src/app/routes/**/*.md`,
        `${root}/src/app/pages/**/*.md`,
        `${root}/src/content/**/*.md`,
        ...(options?.additionalContentDirs || []).map(
          (glob) => `${workspaceRoot}${glob}/**/*.md`,
        ),
      ],
      { dot: true, absolute: true },
    ).map((f) => {
      const normalized = normalizePath(f);
      return normalized.startsWith(root)
        ? normalized.replace(root, '')
        : normalized;
    });
  }

  function detectSchemas(relativeFilename: string): RouteSchemaInfo {
    if (!relativeFilename.endsWith('.ts')) {
      return { hasParamsSchema: false, hasQuerySchema: false };
    }
    try {
      const absPath = join(root, relativeFilename);
      const content = readFileSync(absPath, 'utf-8');
      return detectSchemaExports(content);
    } catch {
      return { hasParamsSchema: false, hasQuerySchema: false };
    }
  }

  function generate(): void {
    const routeFiles = discoverRouteFiles();
    const contentFiles = discoverContentFiles();
    const allFiles = [...routeFiles, ...contentFiles];

    const manifest = generateRouteManifest(allFiles, detectSchemas);
    const declaration = generateRouteTableDeclaration(manifest);

    if (manifest.routes.length > 0) {
      console.log(formatManifestSummary(manifest));
    }

    const outDir = join(root, '.analog');

    if (!existsSync(outDir)) {
      mkdirSync(outDir, { recursive: true });
    }

    const outPath = join(outDir, 'routes.gen.ts');

    let existing = '';
    try {
      existing = readFileSync(outPath, 'utf-8');
    } catch {
      // file doesn't exist yet
    }

    if (existing !== declaration) {
      writeFileSync(outPath, declaration, 'utf-8');
    }
  }

  function isRouteFile(path: string): boolean {
    const normalized = normalizePath(path);
    return (
      (normalized.includes('/routes/') ||
        normalized.includes('/pages/') ||
        normalized.includes('/content/')) &&
      (normalized.endsWith('.ts') || normalized.endsWith('.md'))
    );
  }

  return {
    name: 'analog-route-generation',
    config(config) {
      root = normalizePath(resolve(workspaceRoot, config.root || '.') || '.');
    },
    buildStart() {
      generate();
    },
    configureServer(server) {
      server.watcher.on('add', (path) => {
        if (isRouteFile(path)) generate();
      });
      server.watcher.on('unlink', (path) => {
        if (isRouteFile(path)) generate();
      });
    },
  };
}

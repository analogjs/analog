import { normalizePath, type Plugin } from 'vite';
import { globSync } from 'tinyglobby';
import { resolve, join, dirname } from 'node:path';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';

import {
  generateRouteManifest,
  generateRouteTableDeclaration,
  generateRouteTreeDeclaration,
  detectSchemaExports,
  formatManifestSummary,
  filenameToRoutePath,
} from '@analogjs/router/manifest';
import type { RouteSchemaInfo } from '@analogjs/router/manifest';
import {
  detectJsonLdModuleExports,
  extractMarkdownJsonLd,
  generateJsonLdManifestSource,
  type JsonLdManifestEntry,
} from './json-ld-manifest-plugin.js';

const DEFAULT_OUT_FILE = 'src/routeTree.gen.ts';

export interface TypedRoutesPluginOptions {
  /**
   * Output path for the generated route declarations file,
   * relative to the app root.
   *
   * @default 'src/routeTree.gen.ts'
   */
  outFile?: string;
  /**
   * Workspace root used to resolve additional route/content directories.
   *
   * @default process.cwd()
   */
  workspaceRoot?: string;
  /**
   * Additional page directories to scan for `.page.ts` files.
   */
  additionalPagesDirs?: string[];
  /**
   * Additional content directories to scan for `.md` files.
   */
  additionalContentDirs?: string[];
  /**
   * Include generated `routeJsonLdManifest` exports in the generated routes file.
   *
   * @default true
   */
  jsonLdManifest?: boolean;
}

function resolvePluginOptions(
  options: TypedRoutesPluginOptions = {},
): Required<TypedRoutesPluginOptions> {
  return {
    outFile: options.outFile ?? DEFAULT_OUT_FILE,
    workspaceRoot: options.workspaceRoot ?? process.cwd(),
    additionalPagesDirs: options.additionalPagesDirs ?? [],
    additionalContentDirs: options.additionalContentDirs ?? [],
    jsonLdManifest: options.jsonLdManifest ?? true,
  };
}

/**
 * Vite plugin that generates typed route declarations for Analog file routes.
 */
export function typedRoutes(options: TypedRoutesPluginOptions = {}): Plugin {
  const resolvedOptions = resolvePluginOptions(options);
  const workspaceRoot = normalizePath(resolvedOptions.workspaceRoot);
  let root = '';

  function normalizeDiscoveredPath(absolutePath: string): string {
    const normalized = normalizePath(absolutePath);
    if (normalized.startsWith(root)) {
      return normalized.slice(root.length);
    }
    if (normalized.startsWith(workspaceRoot)) {
      return normalized.slice(workspaceRoot.length);
    }
    return normalized;
  }

  function discoverRouteFiles(): string[] {
    return globSync(
      [
        `${root}/app/routes/**/*.ts`,
        `${root}/src/app/routes/**/*.ts`,
        `${root}/src/app/pages/**/*.page.ts`,
        ...resolvedOptions.additionalPagesDirs.map(
          (glob) => `${workspaceRoot}${glob}/**/*.page.ts`,
        ),
      ],
      { dot: true, absolute: true },
    ).map(normalizeDiscoveredPath);
  }

  function discoverContentFiles(): string[] {
    return globSync(
      [
        `${root}/src/app/routes/**/*.md`,
        `${root}/src/app/pages/**/*.md`,
        `${root}/src/content/**/*.md`,
        ...resolvedOptions.additionalContentDirs.map(
          (glob) => `${workspaceRoot}${glob}/**/*.md`,
        ),
      ],
      { dot: true, absolute: true },
    ).map(normalizeDiscoveredPath);
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
    const jsonLdEntries = buildJsonLdEntries(root, routeFiles, contentFiles);
    const routeTree = generateRouteTreeDeclaration(manifest, {
      jsonLdPaths: jsonLdEntries.map((entry) => entry.routePath),
    });
    const output = combineGeneratedModules(
      declaration,
      routeTree,
      resolvedOptions.jsonLdManifest
        ? generateJsonLdManifestSource(jsonLdEntries, resolvedOptions.outFile)
        : '',
    );

    if (manifest.routes.length > 0) {
      console.log(formatManifestSummary(manifest));
    }

    const outPath = join(root, resolvedOptions.outFile);
    const outDir = dirname(outPath);

    if (!existsSync(outDir)) {
      mkdirSync(outDir, { recursive: true });
    }

    let existing = '';

    try {
      existing = readFileSync(outPath, 'utf-8');
    } catch {
      // file does not exist yet
    }

    if (existing !== output) {
      writeFileSync(outPath, output, 'utf-8');
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
    name: 'analog-typed-routes',
    config(config) {
      root = normalizePath(resolve(workspaceRoot, config.root || '.') || '.');
    },
    buildStart() {
      generate();
    },
    configureServer(server) {
      const regenerate = (path: string) => {
        if (isRouteFile(path)) {
          generate();
        }
      };

      server.watcher.on('add', regenerate);
      server.watcher.on('change', regenerate);
      server.watcher.on('unlink', regenerate);
    },
  };
}

function buildJsonLdEntries(
  root: string,
  routeFiles: string[],
  contentFiles: string[],
): JsonLdManifestEntry[] {
  const entries: JsonLdManifestEntry[] = [];
  let importIndex = 0;

  routeFiles.forEach((filename) => {
    try {
      const source = readFileSync(join(root, filename), 'utf-8');
      if (!detectJsonLdModuleExports(source)) {
        return;
      }

      entries.push({
        kind: 'module',
        routePath: filenameToRoutePath(filename),
        sourceFile: filename,
        importAlias: `routeModule${importIndex++}`,
      });
    } catch {
      // ignore unreadable route file
    }
  });

  contentFiles.forEach((filename) => {
    try {
      const source = readFileSync(join(root, filename), 'utf-8');
      const jsonLd = extractMarkdownJsonLd(source);

      if (jsonLd.length === 0) {
        return;
      }

      entries.push({
        kind: 'content',
        routePath: filenameToRoutePath(filename),
        sourceFile: filename,
        jsonLd,
      });
    } catch {
      // ignore unreadable content file
    }
  });

  return entries.sort((a, b) => a.routePath.localeCompare(b.routePath));
}

function combineGeneratedModules(...sources: string[]): string {
  const imports: string[] = [];
  const seenImports = new Set<string>();
  const bodies: string[] = [];

  for (const source of sources) {
    const { body, importLines } = splitGeneratedModule(source);
    for (const importLine of importLines) {
      if (!seenImports.has(importLine)) {
        seenImports.add(importLine);
        imports.push(importLine);
      }
    }
    if (body.trim()) {
      bodies.push(body.trim());
    }
  }

  return [
    '// This file is auto-generated by @analogjs/vite-plugin-routes',
    '// Do not edit manually',
    '',
    ...(imports.length > 0 ? [...imports, ''] : []),
    bodies.join('\n\n'),
    '',
  ].join('\n');
}

function splitGeneratedModule(source: string): {
  importLines: string[];
  body: string;
} {
  const lines = source.split('\n');
  let index = 0;

  while (index < lines.length && lines[index].startsWith('//')) {
    index++;
  }

  while (index < lines.length && lines[index] === '') {
    index++;
  }

  const importLines: string[] = [];
  while (index < lines.length && lines[index].startsWith('import ')) {
    importLines.push(lines[index]);
    index++;
  }

  while (index < lines.length && lines[index] === '') {
    index++;
  }

  return {
    importLines,
    body: lines.slice(index).join('\n'),
  };
}

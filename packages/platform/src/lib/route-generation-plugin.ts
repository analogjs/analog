import { normalizePath, Plugin } from 'vite';
import { globSync } from 'tinyglobby';
import { resolve, join } from 'node:path';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';

import {
  generateRouteManifest,
  generateRouteTableDeclaration,
  detectSchemaExports,
  formatManifestSummary,
} from '@analogjs/router/manifest';
import type { RouteSchemaInfo } from '@analogjs/router/manifest';

import type { Options } from './options.js';

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

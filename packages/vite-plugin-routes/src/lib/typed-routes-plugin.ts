import { normalizePath, type Plugin } from 'vite';
import { globSync } from 'tinyglobby';
import { resolve, join, dirname } from 'node:path';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';

import {
  generateRouteManifest,
  generateRouteTableDeclaration,
  detectSchemaExports,
  formatManifestSummary,
} from '@analogjs/router/manifest';
import type { RouteSchemaInfo } from '@analogjs/router/manifest';

const DEFAULT_OUT_FILE = 'src/routes.gen.ts';

export interface TypedRoutesPluginOptions {
  /**
   * Output path for the generated route declarations file,
   * relative to the app root.
   *
   * @default 'src/routes.gen.ts'
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
}

function resolvePluginOptions(
  options: TypedRoutesPluginOptions = {},
): Required<TypedRoutesPluginOptions> {
  return {
    outFile: options.outFile ?? DEFAULT_OUT_FILE,
    workspaceRoot: options.workspaceRoot ?? process.cwd(),
    additionalPagesDirs: options.additionalPagesDirs ?? [],
    additionalContentDirs: options.additionalContentDirs ?? [],
  };
}

/**
 * Vite plugin that generates typed route declarations for Analog file routes.
 */
export function typedRoutes(options: TypedRoutesPluginOptions = {}): Plugin {
  const resolvedOptions = resolvePluginOptions(options);
  const workspaceRoot = normalizePath(resolvedOptions.workspaceRoot);
  let root = '';

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
    ).map((file) => {
      const normalized = normalizePath(file);
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
        ...resolvedOptions.additionalContentDirs.map(
          (glob) => `${workspaceRoot}${glob}/**/*.md`,
        ),
      ],
      { dot: true, absolute: true },
    ).map((file) => {
      const normalized = normalizePath(file);
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
    name: 'analog-typed-routes',
    config(config) {
      root = normalizePath(resolve(workspaceRoot, config.root || '.') || '.');
    },
    buildStart() {
      generate();
    },
    configureServer(server) {
      server.watcher.on('add', (path) => {
        if (isRouteFile(path)) {
          generate();
        }
      });

      server.watcher.on('unlink', (path) => {
        if (isRouteFile(path)) {
          generate();
        }
      });
    },
  };
}

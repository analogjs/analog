/**
 * Vite plugin for type-safe routing.
 * Generates TypeScript types on startup and watches for file changes.
 */

import { normalizePath, Plugin } from 'vite';
import { globSync } from 'tinyglobby';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

import type { Options } from './options.js';
import { parseRouteFiles } from './route-parser.js';
import { generateRouteTypes } from './type-generator.js';

/**
 * Creates a Vite plugin for generating type-safe route definitions.
 * When enabled, scans the pages directory and generates TypeScript types.
 */
export function typedRoutesPlugin(options: Options): Plugin[] {
  if (options.typedRoutes === false) {
    return [];
  }

  const workspaceRoot = normalizePath(options.workspaceRoot ?? process.cwd());
  let root: string;
  let outputPath: string;

  /**
   * Discovers page files and generates type definitions.
   */
  function discoverAndGenerate(): void {
    const pageFiles = globSync(
      [
        `${root}/src/app/pages/**/*.page.ts`,
        ...(options.additionalPagesDirs || []).map(
          (dir) => `${workspaceRoot}${dir}/**/*.page.ts`,
        ),
      ],
      { dot: true, absolute: true },
    );

    const routes = parseRouteFiles(pageFiles);
    const typeContent = generateRouteTypes(routes);

    // Only write if content has changed to avoid unnecessary file system writes
    const existingContent = existsSync(outputPath)
      ? readFileSync(outputPath, 'utf-8')
      : '';

    if (typeContent !== existingContent) {
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, typeContent, 'utf-8');
    }
  }

  return [
    {
      name: 'analog-typed-routes',
      config(config) {
        root = normalizePath(resolve(workspaceRoot, config.root || '.'));
        outputPath = resolve(root, 'src/app/pages/routes.d.ts');
      },
      buildStart() {
        discoverAndGenerate();
      },
      configureServer(server) {
        // Regenerate on page file changes
        function handleChange(path: string): void {
          if (path.includes('pages') && path.endsWith('.page.ts')) {
            discoverAndGenerate();
          }
        }

        server.watcher.on('add', handleChange);
        server.watcher.on('unlink', handleChange);
      },
    },
  ];
}

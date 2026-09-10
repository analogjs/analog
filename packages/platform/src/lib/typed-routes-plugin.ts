import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { parseSync } from 'oxc-parser';
import { normalizePath, type Plugin } from 'vite';

import {
  createRouteFileDiscovery,
  type RouteFileDiscovery,
} from './route-file-discovery.js';
import {
  generateRouteManifest,
  generateRouteTableDeclaration,
} from './route-manifest.js';

export interface TypedRouterOptions {
  /** Generated module path, relative to the app root. */
  outFile?: string;
  /** Fail builds when a checked-in route table is stale. Defaults to true. */
  verifyOnBuild?: boolean;
}

export interface TypedRoutesPluginOptions extends TypedRouterOptions {
  workspaceRoot?: string;
  additionalPagesDirs?: string[];
  additionalContentDirs?: string[];
}

export function typedRoutes(options: TypedRoutesPluginOptions = {}): Plugin {
  const workspaceRoot = normalizePath(options.workspaceRoot ?? process.cwd());
  const outFile = options.outFile ?? 'src/routeTree.gen.ts';
  let root: string;
  let command: 'build' | 'serve';
  let discovery: RouteFileDiscovery;

  function ensureEntryImport(): void {
    for (const entry of ['src/main.ts', 'src/main.server.ts']) {
      const entryPath = join(root, entry);
      if (!existsSync(entryPath)) continue;
      let specifier = normalizePath(
        relative(dirname(entryPath), join(root, outFile)),
      ).replace(/\.ts$/, '');
      if (!specifier.startsWith('.')) specifier = './' + specifier;
      const source = readFileSync(entryPath, 'utf8');
      const { program, errors } = parseSync(entryPath, source);
      if (errors.length)
        throw new Error(
          `[analog] Cannot add typed route import to invalid entry: ${entry}`,
        );
      const hasImport = program.body.some(
        (node) =>
          node.type === 'ImportDeclaration' &&
          node.source.value.replace(/\.(ts|js)$/, '') === specifier,
      );
      if (!hasImport) {
        // Append a type-only import after complete statements, never inside a multiline import.
        writeFileSync(
          entryPath,
          `${source}\nimport type {} from '${specifier}';\n`,
        );
      }
      return;
    }
    throw new Error(
      '[analog] Typed routing requires src/main.ts or src/main.server.ts to include the generated route table.',
    );
  }

  function generate(): void {
    const manifest = generateRouteManifest(
      [...discovery.getRouteFiles(), ...discovery.getContentFiles()],
      (filename) => (discovery.isAppLocal(filename) ? 0 : 1),
    );
    const collisions = manifest.collisions.filter(
      (collision) => collision.samePriority,
    );
    if (command === 'build' && collisions.length) {
      throw new Error(
        `[analog] Route collisions detected: ${collisions.map((c) => `${c.fullPath}: ${c.keptFile}, ${c.droppedFile}`).join('; ')}`,
      );
    }
    const output = generateRouteTableDeclaration(manifest);
    const outputPath = join(root, outFile);
    const exists = existsSync(outputPath);
    const current = exists ? readFileSync(outputPath, 'utf8') : '';
    if (current.replace(/\r\n/g, '\n') !== output) {
      if (exists && command === 'build' && (options.verifyOnBuild ?? true)) {
        throw new Error(
          `[analog] Stale route file: ${outFile}. Run the dev server to regenerate it before building.`,
        );
      }
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, output);
    }
    ensureEntryImport();
  }

  return {
    name: 'analog-typed-routes',
    config(config, env) {
      command = env.command;
      root = normalizePath(resolve(workspaceRoot, config.root ?? '.'));
      discovery = createRouteFileDiscovery({
        root,
        workspaceRoot,
        additionalPagesDirs: options.additionalPagesDirs ?? [],
        additionalContentDirs: options.additionalContentDirs ?? [],
      });
      // Include the augmentation before Angular creates its TypeScript program.
      generate();
    },
    buildStart() {
      discovery.reset();
      generate();
    },
    configureServer(server) {
      for (const event of ['add', 'change', 'unlink'] as const) {
        server.watcher.on(event, (path) => {
          if (!discovery.getDiscoveredFileKind(path)) return;
          discovery.updateDiscoveredFile(path, event);
          generate();
        });
      }
    },
  };
}

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { readConfiguration } from '@angular/compiler-cli';
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
  /** Generated declaration path (.d.ts), relative to the app root. */
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
  const outFile = options.outFile ?? 'src/routeTree.gen.d.ts';
  if (!outFile.endsWith('.d.ts')) {
    throw new Error(
      '[analog] Typed routing outFile must end in .d.ts. Include this declaration in your application tsconfig.',
    );
  }
  let root: string;
  let command: 'build' | 'serve';
  let discovery: RouteFileDiscovery;

  let getTsConfigPath: (() => string) | undefined;

  function verifyTypeInclusion(): void {
    if (!getTsConfigPath) return;
    const tsconfig = getTsConfigPath();
    const { rootNames, errors } = readConfiguration(tsconfig);
    if (errors.length) {
      throw new Error(
        `[analog] Cannot verify typed routing: unable to read ${tsconfig}.`,
      );
    }
    const outputPath = normalizePath(resolve(root, outFile));
    if (
      !rootNames.some((file) => normalizePath(resolve(file)) === outputPath)
    ) {
      const declaration = normalizePath(
        relative(dirname(tsconfig), outputPath),
      );
      throw new Error(
        `[analog] Typed route declaration is not included in ${tsconfig}. Add "${declaration}" to its "files" or "include" list so typed routing is available to the compiler and editor.`,
      );
    }
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
    if (current !== output && !sameDeclarations(current, output)) {
      if (exists && command === 'build' && (options.verifyOnBuild ?? true)) {
        throw new Error(
          `[analog] Stale route file: ${outFile}. Run the dev server to regenerate it before building.`,
        );
      }
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, output);
    }
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
      // Generate before Angular reads the application tsconfig.
      generate();
    },
    configResolved(config) {
      const compiler = config.plugins.find(
        (plugin) =>
          plugin.name === '@analogjs/vite-plugin-angular' ||
          plugin.name === '@analogjs/vite-plugin-angular-fast-compile',
      );
      getTsConfigPath = compiler?.api?.getTsConfigPath;
      if (compiler && !getTsConfigPath) {
        throw new Error(
          '[analog] Typed routing requires a matching @analogjs/vite-plugin-angular version to verify the application tsconfig.',
        );
      }
      verifyTypeInclusion();
    },
    buildStart() {
      discovery.reset();
      generate();
      verifyTypeInclusion();
    },
    configureServer(server) {
      server.watcher.add(join(root, outFile));
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

function sameDeclarations(current: string, output: string): boolean {
  const left = parseSync('routeTree.gen.d.ts', current);
  const right = parseSync('routeTree.gen.d.ts', output);
  if (left.errors.length || right.errors.length) return false;
  const withoutFormatting = (key: string, value: unknown) =>
    key === 'start' || key === 'end' || key === 'raw' ? undefined : value;
  return (
    JSON.stringify(left.program, withoutFormatting) ===
    JSON.stringify(right.program, withoutFormatting)
  );
}

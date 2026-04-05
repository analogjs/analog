import { normalizePath, type Plugin } from 'vite';
import { resolve, join, dirname, relative } from 'node:path';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';

import {
  generateRouteManifest,
  generateRouteTableDeclaration,
  generateRouteTreeDeclaration,
  detectSchemaExports,
  formatManifestSummary,
  filenameToRoutePath,
} from './route-manifest.js';
import type { RouteSchemaInfo } from './route-manifest.js';
import {
  detectJsonLdModuleExports,
  extractMarkdownJsonLd,
  generateJsonLdManifestSource,
  type JsonLdManifestEntry,
} from './json-ld-manifest-plugin.js';
import {
  createRouteFileDiscovery,
  type RouteFileDiscovery,
} from './route-file-discovery.js';
import { debugTypedRouter } from './utils/debug.js';

const DEFAULT_OUT_FILE = 'src/routeTree.gen.ts';

export interface TypedRoutesPluginOptions {
  /**
   * Output path for the single generated route module,
   * relative to the app root.
   *
   * @default 'src/routeTree.gen.ts'
   */
  outFile?: string;
  /**
   * Workspace root used to resolve additional route/content directories.
   *
   * @default process.env['NX_WORKSPACE_ROOT'] ?? process.cwd()
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
   * Include generated `routeJsonLdManifest` exports in the generated route file.
   *
   * @default true
   */
  jsonLdManifest?: boolean;
  /**
   * When true, compare generated output against the existing file and
   * throw an error if they differ instead of writing. Useful for CI to
   * detect stale checked-in route files.
   *
   * @default false
   */
  verify?: boolean;
  /**
   * When true, production builds fail after regenerating a stale checked-in
   * route file. This preserves self-healing writes in development while making
   * build-time freshness issues visible by default.
   *
   * @default true
   */
  verifyOnBuild?: boolean;
}

function resolvePluginOptions(
  options: TypedRoutesPluginOptions = {},
): Required<TypedRoutesPluginOptions> {
  return {
    outFile: options.outFile ?? DEFAULT_OUT_FILE,
    workspaceRoot:
      options.workspaceRoot ??
      process.env['NX_WORKSPACE_ROOT'] ??
      process.cwd(),
    additionalPagesDirs: options.additionalPagesDirs ?? [],
    additionalContentDirs: options.additionalContentDirs ?? [],
    jsonLdManifest: options.jsonLdManifest ?? true,
    verify: options.verify ?? false,
    verifyOnBuild: options.verifyOnBuild ?? true,
  };
}

/**
 * Vite plugin that generates a single typed route module for Analog file routes.
 */
export function typedRoutes(options: TypedRoutesPluginOptions = {}): Plugin {
  const resolvedOptions = resolvePluginOptions(options);
  const workspaceRoot = normalizePath(resolvedOptions.workspaceRoot);
  let root = '';
  let command: 'build' | 'serve' = 'serve';
  let discovery: RouteFileDiscovery;

  function isFreshnessCheck(): boolean {
    return (
      resolvedOptions.verify ||
      (command === 'build' && resolvedOptions.verifyOnBuild)
    );
  }

  function resolveDiscoveredFile(filename: string): string {
    const fromRoot = join(root, filename);
    if (existsSync(fromRoot)) return fromRoot;
    return join(workspaceRoot, filename);
  }

  function detectSchemas(relativeFilename: string): RouteSchemaInfo {
    if (!relativeFilename.endsWith('.ts')) {
      return { hasParamsSchema: false, hasQuerySchema: false };
    }

    try {
      const absPath = resolveDiscoveredFile(relativeFilename);
      const content = readFileSync(absPath, 'utf-8');
      return detectSchemaExports(content);
    } catch {
      return { hasParamsSchema: false, hasQuerySchema: false };
    }
  }

  /**
   * Ensures the generated route file is imported from an app entry file
   * so the module augmentation is always part of the TypeScript program.
   */
  function ensureEntryImport(): void {
    const entryFiles = ['src/main.ts', 'src/main.server.ts'];

    // Compute the import specifier relative to the entry file
    function importSpecifierFor(entryFile: string): string {
      const rel = relative(dirname(entryFile), resolvedOptions.outFile)
        .replace(/\.ts$/, '')
        .replace(/\\/g, '/');
      return rel.startsWith('.') ? rel : './' + rel;
    }

    for (const entryFile of entryFiles) {
      const entryPath = join(root, entryFile);
      if (!existsSync(entryPath)) continue;

      const content = readFileSync(entryPath, 'utf-8');
      const specifier = importSpecifierFor(entryFile);

      // Check if any variation of the import already exists
      const escaped = specifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`import\\s+['"]${escaped}(\\.ts|\\.js)?['"]`);
      if (pattern.test(content)) {
        return;
      }

      if (isFreshnessCheck()) {
        return;
      }

      // Insert the import after the last existing import line
      const importLine = `import '${specifier}';`;
      const lines = content.split('\n');
      let lastImportLine = -1;

      for (let i = 0; i < lines.length; i++) {
        if (/^import\s/.test(lines[i])) {
          lastImportLine = i;
        }
      }

      if (lastImportLine >= 0) {
        lines.splice(lastImportLine + 1, 0, importLine);
      } else {
        lines.unshift(importLine);
      }

      writeFileSync(entryPath, lines.join('\n'), 'utf-8');
      console.log(`[analog] Added route tree import to ${entryFile}`);
      return;
    }

    // No suitable entry file found
    const specifier = importSpecifierFor('src/main.ts');
    if (isFreshnessCheck()) {
      return;
    }
    console.warn(
      `[analog] Could not find an entry file (src/main.ts or src/main.server.ts) ` +
        `to add the route tree import. Add \`import '${specifier}';\` ` +
        `to your app entry file to ensure typed routing is active.`,
    );
  }

  function generate(): void {
    const routeFiles = discovery.getRouteFiles();
    const contentFiles = discovery.getContentFiles();
    debugTypedRouter('discovered files', {
      routeFiles: routeFiles.length,
      contentFiles: contentFiles.length,
    });
    const allFiles = [...routeFiles, ...contentFiles];
    const manifest = generateRouteManifest(
      allFiles,
      detectSchemas,
      (filename) => (discovery.isAppLocal(filename) ? 0 : 1),
    );
    const declaration = generateRouteTableDeclaration(manifest);
    const canonicalFiles = new Set(
      manifest.routes.map((route) => route.filename),
    );
    const jsonLdEntries = buildJsonLdEntries(
      resolveDiscoveredFile,
      routeFiles.filter((filename) => canonicalFiles.has(filename)),
      contentFiles.filter((filename) => canonicalFiles.has(filename)),
    );
    const routeTree = generateRouteTreeDeclaration(manifest, {
      jsonLdFiles: jsonLdEntries.map((entry) => entry.sourceFile),
    });
    const output = combineGeneratedModules(
      declaration,
      routeTree,
      resolvedOptions.jsonLdManifest && jsonLdEntries.length > 0
        ? generateJsonLdManifestSource(jsonLdEntries, resolvedOptions.outFile)
        : '',
    );

    const hardCollisions = manifest.collisions.filter((c) => c.samePriority);
    if (manifest.collisions.length > 0) {
      debugTypedRouter('route collisions', {
        total: manifest.collisions.length,
        hard: hardCollisions.length,
        collisions: manifest.collisions.map((c) => ({
          path: c.fullPath,
          kept: c.keptFile,
          dropped: c.droppedFile,
        })),
      });
    }
    if (hardCollisions.length > 0 && command === 'build') {
      const details = hardCollisions
        .map((c) => `  '${c.fullPath}': '${c.keptFile}' vs '${c.droppedFile}'`)
        .join('\n');
      throw new Error(
        `[analog] Route collisions detected during build:\n${details}\n\n` +
          `Each route path must be defined by exactly one source file. ` +
          `Remove or rename the conflicting files to resolve the collision.`,
      );
    }

    if (manifest.routes.length > 0) {
      console.log(formatManifestSummary(manifest));
    }

    const outPath = join(root, resolvedOptions.outFile);
    const outDir = dirname(outPath);
    const hadExistingOutput = existsSync(outPath);

    if (!existsSync(outDir)) {
      mkdirSync(outDir, { recursive: true });
    }

    let existing = '';

    try {
      existing = readFileSync(outPath, 'utf-8');
    } catch {
      // file does not exist yet
    }

    // Build-time guard: detect absolute path leaks in generated output.
    // Machine-specific prefixes must never appear in route keys or sourceFile values.
    if (output.includes(root)) {
      console.warn(
        `[analog] Generated route output contains an absolute path prefix (${root}). ` +
          `Route keys and sourceFile values should be workspace-relative.`,
      );
    }

    // Normalize line endings before comparison so that files checked in
    // with LF don't appear stale on Windows where readFileSync may return CRLF.
    const normalizeEndings = (s: string) => s.replace(/\r\n/g, '\n');
    if (normalizeEndings(existing) !== normalizeEndings(output)) {
      debugTypedRouter('route file changed', {
        outFile: resolvedOptions.outFile,
        routes: manifest.routes.length,
        verify: resolvedOptions.verify,
        verifyOnBuild: resolvedOptions.verifyOnBuild,
        command,
      });
      if (resolvedOptions.verify) {
        throw new Error(
          `[analog] Stale route file detected: ${resolvedOptions.outFile}\n` +
            `The checked-in generated route file does not match the current route sources.\n` +
            `Regenerate route files and commit the updated output.`,
        );
      }

      writeFileSync(outPath, output, 'utf-8');

      if (
        command === 'build' &&
        resolvedOptions.verifyOnBuild &&
        hadExistingOutput
      ) {
        throw new Error(
          `[analog] Stale route file detected during build: ${resolvedOptions.outFile}\n` +
            `The generated route file was updated to match the current route sources.\n` +
            `Review the updated output, commit it if it is checked in, and rerun the build.`,
        );
      }
    }
  }

  return {
    name: 'analog-typed-routes',
    config(config, env) {
      command = env.command;
      root = normalizePath(resolve(workspaceRoot, config.root || '.') || '.');
      discovery = createRouteFileDiscovery({
        root,
        workspaceRoot,
        additionalPagesDirs: resolvedOptions.additionalPagesDirs,
        additionalContentDirs: resolvedOptions.additionalContentDirs,
      });
    },
    buildStart() {
      generate();
      if (!isFreshnessCheck()) {
        ensureEntryImport();
      }
    },
    configureServer(server) {
      const regenerate = (path: string, event: 'add' | 'change' | 'unlink') => {
        // Reuse the discovery matcher so watch-time updates stay in sync with
        // the initial scan and don't pull Nitro server routes into routeTree.gen.ts.
        if (!discovery.getDiscoveredFileKind(path)) {
          return;
        }

        debugTypedRouter('watch regenerate', { event, path });
        discovery.updateDiscoveredFile(path, event);
        generate();
      };

      server.watcher.on('add', (path) => regenerate(path, 'add'));
      server.watcher.on('change', (path) => regenerate(path, 'change'));
      server.watcher.on('unlink', (path) => regenerate(path, 'unlink'));
    },
  };
}

function buildJsonLdEntries(
  resolveFile: (filename: string) => string,
  routeFiles: string[],
  contentFiles: string[],
): JsonLdManifestEntry[] {
  const entries: JsonLdManifestEntry[] = [];
  let importIndex = 0;

  routeFiles.forEach((filename) => {
    try {
      const source = readFileSync(resolveFile(filename), 'utf-8');
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
      const source = readFileSync(resolveFile(filename), 'utf-8');
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
    '// This file is auto-generated by @analogjs/platform',
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

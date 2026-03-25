#!/usr/bin/env node

/**
 * Build script for Angular library packages.
 * Replaces ng-packagr with Vite (FESM bundles) + tsc (declarations).
 *
 * Usage: node tools/scripts/build-lib.mts <package-name>
 * Example: node tools/scripts/build-lib.mts router
 */

import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Console, Effect, Schema } from 'effect';

interface SubEntry {
  path: string;
  name: string;
  typesPath: string;
}

interface ExportConditions {
  types?: string;
  import?: string;
  default: string;
}

interface BuildContext {
  packageName: string;
  root: string;
  pkgDir: string;
  outDir: string;
  tsconfig: string;
  typesOutDir: string;
  prefix: string;
}

const BuildLibArgsSchema = Schema.Struct({
  packageName: Schema.String,
});

const NgPackageJsonSchema = Schema.Struct({
  dest: Schema.optionalKey(Schema.String),
  assets: Schema.optionalKey(Schema.Array(Schema.String)),
  lib: Schema.optionalKey(
    Schema.Struct({
      entryFile: Schema.optionalKey(Schema.String),
    }),
  ),
});

type BuildLibArgs = Schema.Schema.Type<typeof BuildLibArgsSchema>;
type NgPackageJson = Schema.Schema.Type<typeof NgPackageJsonSchema>;

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function fail(message: string): Effect.Effect<never, Error> {
  return Effect.fail(new Error(message));
}

function parseArgs(
  argv: ReadonlyArray<string>,
): Effect.Effect<BuildLibArgs, Error> {
  return Effect.try({
    try: () =>
      Schema.decodeUnknownSync(BuildLibArgsSchema)({
        packageName: argv[2],
      }),
    catch: () =>
      new Error('Usage: node tools/scripts/build-lib.mts <package-name>'),
  });
}

function readJson<S extends Schema.Top & { readonly DecodingServices: never }>(
  path: string,
  schema: S,
): Effect.Effect<S['Type'], Error> {
  return Effect.try({
    try: () =>
      Schema.decodeUnknownSync(schema)(JSON.parse(readFileSync(path, 'utf-8'))),
    catch: (cause) =>
      new Error(`Failed to read ${path}: ${formatError(cause)}`),
  });
}

function readJsonObject(
  path: string,
): Effect.Effect<Record<string, unknown>, Error> {
  return Effect.try({
    try: () => {
      const parsed = JSON.parse(readFileSync(path, 'utf-8')) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Expected a JSON object');
      }
      return parsed as Record<string, unknown>;
    },
    catch: (cause) =>
      new Error(`Failed to read ${path}: ${formatError(cause)}`),
  });
}

function pruneNonDeclarationFilesRecursive(dir: string): void {
  if (!existsSync(dir)) {
    return;
  }

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const entryPath = resolve(dir, entry.name);

    if (entry.isDirectory()) {
      pruneNonDeclarationFilesRecursive(entryPath);

      if (readdirSync(entryPath).length === 0) {
        rmSync(entryPath, { recursive: true });
      }

      continue;
    }

    if (!entry.name.endsWith('.d.ts')) {
      rmSync(entryPath);
    }
  }
}

function pruneNonDeclarationFiles(dir: string): Effect.Effect<void, Error> {
  return Effect.try({
    try: () => {
      pruneNonDeclarationFilesRecursive(dir);
    },
    catch: (cause) =>
      new Error(
        `Failed to prune non-declaration files in ${dir}: ${formatError(cause)}`,
      ),
  });
}

function resolveBuildContext(
  packageName: string,
): Effect.Effect<BuildContext, Error> {
  return Effect.try({
    try: () => {
      const root = resolve(import.meta.dirname, '../..');
      const pkgDir = resolve(root, 'packages', packageName);
      const outDir = resolve(root, 'node_modules/@analogjs', packageName);
      const tsconfigProd = resolve(pkgDir, 'tsconfig.lib.prod.json');
      const tsconfig = existsSync(tsconfigProd)
        ? tsconfigProd
        : resolve(pkgDir, 'tsconfig.lib.json');

      return {
        packageName,
        root,
        pkgDir,
        outDir,
        tsconfig,
        typesOutDir: resolve(outDir, 'types'),
        prefix: `analogjs-${packageName}`,
      };
    },
    catch: (cause) =>
      new Error(`Failed to resolve build context: ${formatError(cause)}`),
  }).pipe(
    Effect.flatMap((context) =>
      existsSync(context.pkgDir)
        ? Effect.succeed(context)
        : fail(`Package directory not found: ${context.pkgDir}`),
    ),
  );
}

function cleanOutputDirectory(
  context: BuildContext,
): Effect.Effect<void, Error> {
  return Effect.try({
    try: () => {
      if (existsSync(context.outDir)) {
        if (
          context.packageName === 'content' &&
          existsSync(resolve(context.outDir, 'plugin'))
        ) {
          for (const entry of readdirSync(context.outDir)) {
            if (entry === 'plugin') {
              continue;
            }
            rmSync(resolve(context.outDir, entry), { recursive: true });
          }
          return;
        }

        rmSync(context.outDir, { recursive: true });
      }

      mkdirSync(context.outDir, { recursive: true });
    },
    catch: (cause) =>
      new Error(
        `Failed to clean output directory ${context.outDir}: ${formatError(cause)}`,
      ),
  });
}

function runCommand(
  context: BuildContext,
  file: string,
  args: ReadonlyArray<string>,
  env?: NodeJS.ProcessEnv,
): Effect.Effect<void, Error> {
  return Effect.try({
    try: () => {
      execFileSync(file, [...args], {
        cwd: context.root,
        env,
        shell: process.platform === 'win32',
        stdio: 'inherit',
      });
    },
    catch: (cause) =>
      new Error(
        `Command failed: ${file} ${args.join(' ')}\n${formatError(cause)}`,
      ),
  });
}

function buildBundles(context: BuildContext): Effect.Effect<void, Error> {
  return runCommand(
    context,
    'pnpm',
    [
      'exec',
      'vite',
      'build',
      '--config',
      `packages/${context.packageName}/vite.config.lib.ts`,
      '--configLoader',
      'runner',
    ],
    {
      ...process.env,
      ANALOG_BUILD_LIB_TSCONFIG: context.tsconfig,
    },
  );
}

function cleanupDuplicatePackages(
  context: BuildContext,
): Effect.Effect<void, Error> {
  return Effect.try({
    try: () => {
      for (const dir of [
        resolve(context.typesOutDir, 'packages'),
        resolve(context.outDir, 'packages'),
      ]) {
        if (existsSync(dir)) {
          rmSync(dir, { recursive: true });
        }
      }
    },
    catch: (cause) =>
      new Error(`Failed to clean duplicate packages: ${formatError(cause)}`),
  });
}

function generateDeclarations(
  context: BuildContext,
): Effect.Effect<void, Error> {
  return Effect.gen(function* () {
    yield* runCommand(context, 'pnpm', [
      'exec',
      'ngc',
      '-p',
      context.tsconfig,
      '--outDir',
      context.typesOutDir,
    ]);
    yield* pruneNonDeclarationFiles(context.typesOutDir);
    yield* cleanupDuplicatePackages(context);
  });
}

function readBuildMetadata(context: BuildContext): Effect.Effect<
  {
    srcPkg: Record<string, unknown>;
    ngPkg: NgPackageJson;
  },
  Error
> {
  return Effect.gen(function* () {
    const srcPkg = yield* readJsonObject(
      resolve(context.pkgDir, 'package.json'),
    );
    const ngPkg = yield* readJson(
      resolve(context.pkgDir, 'ng-package.json'),
      NgPackageJsonSchema,
    );

    return { srcPkg, ngPkg };
  });
}

function discoverSubEntries(
  context: BuildContext,
): Effect.Effect<Array<SubEntry>, Error> {
  return Effect.try({
    try: () => {
      const subEntries: Array<SubEntry> = [];
      const seen = new Set<string>();

      for (const entry of readdirSync(context.pkgDir, {
        withFileTypes: true,
        recursive: true,
      })) {
        if (!entry.parentPath) {
          continue;
        }

        // Normalize to POSIX separators — parentPath uses backslashes on Windows
        const relPath = entry.parentPath
          .slice(context.pkgDir.length + 1)
          .replace(/\\/g, '/');
        if (relPath.includes('node_modules')) {
          continue;
        }

        // Discover via ng-package.json (legacy convention)
        if (entry.name === 'ng-package.json') {
          const sub = relPath;
          if (!sub) {
            continue;
          }

          const subNgPkg = Schema.decodeUnknownSync(NgPackageJsonSchema)(
            JSON.parse(
              readFileSync(resolve(entry.parentPath, entry.name), 'utf-8'),
            ),
          );
          const entryFile = subNgPkg.lib?.entryFile ?? 'src/index.ts';
          subEntries.push({
            path: `./${sub}`,
            name: `${context.prefix}-${sub.replace(/\//g, '-')}`,
            typesPath: `${sub}/${entryFile}`.replace('.ts', '.d.ts'),
          });
          seen.add(sub);
          continue;
        }

        // Discover via src/index.ts convention (no ng-package.json required)
        if (entry.name === 'index.ts') {
          if (!relPath.endsWith('/src')) {
            continue;
          }
          const sub = relPath.slice(0, -'/src'.length);
          if (!sub || seen.has(sub)) {
            continue;
          }

          const entryFile = 'src/index.ts';
          subEntries.push({
            path: `./${sub}`,
            name: `${context.prefix}-${sub.replace(/\//g, '-')}`,
            typesPath: `${sub}/${entryFile}`.replace('.ts', '.d.ts'),
          });
          seen.add(sub);
        }
      }

      return subEntries.sort((a, b) => a.path.localeCompare(b.path));
    },
    catch: (cause) =>
      new Error(`Failed to discover sub-entries: ${formatError(cause)}`),
  });
}

function writePackageMetadata(
  context: BuildContext,
  srcPkg: Record<string, unknown>,
  ngPkg: NgPackageJson,
  subEntries: ReadonlyArray<SubEntry>,
): Effect.Effect<void, Error> {
  return Effect.try({
    try: () => {
      const mainEntryFile = ngPkg.lib?.entryFile ?? 'src/index.ts';
      const exportsMap: Record<string, ExportConditions> = {
        './package.json': { default: './package.json' },
        '.': {
          types: `./types/${mainEntryFile.replace('.ts', '.d.ts')}`,
          import: `./fesm2022/${context.prefix}.mjs`,
          default: `./fesm2022/${context.prefix}.mjs`,
        },
      };

      for (const entry of subEntries) {
        exportsMap[entry.path] = {
          types: `./types/${entry.typesPath}`,
          import: `./fesm2022/${entry.name}.mjs`,
          default: `./fesm2022/${entry.name}.mjs`,
        };
      }

      const outPkg: Record<string, unknown> = {
        ...srcPkg,
        module: `fesm2022/${context.prefix}.mjs`,
        typings: `types/${mainEntryFile.replace('.ts', '.d.ts')}`,
        exports: exportsMap,
        sideEffects: false,
      };

      writeFileSync(
        resolve(context.outDir, 'package.json'),
        JSON.stringify(outPkg, null, 2) + '\n',
      );
    },
    catch: (cause) =>
      new Error(`Failed to generate package metadata: ${formatError(cause)}`),
  });
}

function copyAssets(
  context: BuildContext,
  assets: ReadonlyArray<string>,
): Effect.Effect<void, Error> {
  return Effect.forEach(
    assets,
    (asset) =>
      Effect.try({
        try: () => {
          const src = resolve(context.pkgDir, asset);
          if (!existsSync(src)) {
            return;
          }

          const dest = resolve(context.outDir, asset);
          mkdirSync(dirname(dest), { recursive: true });
          cpSync(src, dest, { recursive: true });
        },
        catch: (cause) =>
          new Error(`Failed to copy asset "${asset}": ${formatError(cause)}`),
      }),
    {
      discard: true,
    },
  );
}

function copyProjectDocs(context: BuildContext): Effect.Effect<void, Error> {
  return Effect.forEach(
    ['README.md', 'LICENSE'],
    (file) =>
      Effect.try({
        try: () => {
          const src = resolve(context.pkgDir, file);
          if (existsSync(src)) {
            cpSync(src, resolve(context.outDir, file));
            return;
          }

          if (file === 'LICENSE') {
            const rootLicense = resolve(context.root, 'LICENSE');
            if (existsSync(rootLicense)) {
              cpSync(rootLicense, resolve(context.outDir, file));
            }
          }
        },
        catch: (cause) =>
          new Error(`Failed to copy ${file}: ${formatError(cause)}`),
      }),
    {
      discard: true,
    },
  );
}

function writeNpmIgnore(context: BuildContext): Effect.Effect<void, Error> {
  return Effect.try({
    try: () => {
      writeFileSync(
        resolve(context.outDir, '.npmignore'),
        ['# Dev files', '**/*.tsbuildinfo', ''].join('\n'),
      );
    },
    catch: (cause) =>
      new Error(`Failed to write .npmignore: ${formatError(cause)}`),
  });
}

function writeSubEntryPackages(
  context: BuildContext,
  subEntries: ReadonlyArray<SubEntry>,
): Effect.Effect<void, Error> {
  return Effect.forEach(
    subEntries,
    (entry) =>
      Effect.try({
        try: () => {
          const subDir = resolve(context.outDir, entry.path);
          mkdirSync(subDir, { recursive: true });
          const depth = entry.path.split('/').length - 1;
          const up = '../'.repeat(depth);
          const subPkg: Record<string, string> = {
            module: `${up}fesm2022/${entry.name}.mjs`,
            typings: `${up}types/${entry.typesPath}`,
          };

          writeFileSync(
            resolve(subDir, 'package.json'),
            JSON.stringify(subPkg, null, 2) + '\n',
          );
        },
        catch: (cause) =>
          new Error(
            `Failed to write sub-entry package.json for ${entry.path}: ${formatError(cause)}`,
          ),
      }),
    {
      discard: true,
    },
  );
}

const program = Effect.gen(function* () {
  const args = yield* parseArgs(process.argv);
  const context = yield* resolveBuildContext(args.packageName);

  yield* Console.log(`\nBuilding @analogjs/${context.packageName}...\n`);

  yield* cleanOutputDirectory(context);

  yield* Console.log('  → Building FESM bundles with Vite + Rolldown...');
  yield* buildBundles(context);

  yield* Console.log('\n  → Generating declarations with ngc...');
  yield* generateDeclarations(context);

  yield* Console.log('  → Generating package metadata...');
  const { srcPkg, ngPkg } = yield* readBuildMetadata(context);
  const subEntries = yield* discoverSubEntries(context);
  yield* writePackageMetadata(context, srcPkg, ngPkg, subEntries);

  yield* copyAssets(context, ngPkg.assets ?? []);
  yield* copyProjectDocs(context);
  yield* writeNpmIgnore(context);
  yield* writeSubEntryPackages(context, subEntries);

  yield* Console.log(`\n✓ Built @analogjs/${context.packageName}\n`);
});

await Effect.runPromise(program).catch((error: unknown) => {
  console.error(formatError(error));
  process.exit(1);
});

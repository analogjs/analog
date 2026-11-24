/**
 * Cross-platform script to copy build assets for library packages.
 *
 * Usage:
 *   node --experimental-strip-types tools/scripts/copy-src-assets.mts <pkgDir> <destDir> [options]
 *
 * Options:
 *   --assets file1 file2 ...   Copy listed files flat from pkgDir to destDir
 *   --dirs dir1 dir2 ...       Recursively copy directories from pkgDir to destDir
 *   --src                      Copy non-TS source assets (all files except .ts, plus .d.ts)
 *
 * Examples:
 *   node --experimental-strip-types tools/scripts/copy-src-assets.mts packages/nx-plugin packages/platform/dist/src/lib/nx-plugin --assets package.json generators.json executors.json --src
 *   node --experimental-strip-types tools/scripts/copy-src-assets.mts packages/vite-plugin-nitro packages/vite-plugin-nitro/dist --assets package.json --dirs migrations
 */
import { copyFileSync, cpSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Effect, Schema } from 'effect';

const CopySrcAssetsConfigSchema = Schema.Struct({
  pkgDir: Schema.String,
  destDir: Schema.String,
  assets: Schema.Array(Schema.String),
  dirs: Schema.Array(Schema.String),
  copySrc: Schema.Boolean,
});

type CopySrcAssetsConfig = Schema.Schema.Type<typeof CopySrcAssetsConfigSchema>;

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseArgs(
  argv: ReadonlyArray<string>,
): Effect.Effect<CopySrcAssetsConfig, Error> {
  const positionalArgs = argv.slice(2);
  const pkgDir = positionalArgs[0];
  const destDir = positionalArgs[1];

  if (!pkgDir || !destDir) {
    return Effect.fail(
      new Error(
        'Usage: node --experimental-strip-types tools/scripts/copy-src-assets.mts <pkgDir> <destDir> [options]',
      ),
    );
  }

  const flags = positionalArgs.slice(2);
  let index = 0;
  const assets: string[] = [];
  const dirs: string[] = [];
  let copySrc = false;

  while (index < flags.length) {
    const flag = flags[index];

    if (flag === '--assets') {
      index++;
      while (index < flags.length && !flags[index].startsWith('--')) {
        assets.push(flags[index]);
        index++;
      }
      continue;
    }

    if (flag === '--dirs') {
      index++;
      while (index < flags.length && !flags[index].startsWith('--')) {
        dirs.push(flags[index]);
        index++;
      }
      continue;
    }

    if (flag === '--src') {
      copySrc = true;
    }

    index++;
  }

  return Effect.try({
    try: () =>
      Schema.decodeUnknownSync(CopySrcAssetsConfigSchema)({
        pkgDir,
        destDir,
        assets,
        dirs,
        copySrc,
      }),
    catch: (cause) =>
      new Error(`Invalid copy-src-assets arguments: ${formatError(cause)}`),
  });
}

function copyAsset(
  pkgDir: string,
  destDir: string,
  file: string,
): Effect.Effect<void, Error> {
  return Effect.try({
    try: () => {
      mkdirSync(destDir, { recursive: true });
      copyFileSync(join(pkgDir, file), join(destDir, file));
    },
    catch: (cause) =>
      new Error(`Failed to copy asset "${file}": ${formatError(cause)}`),
  });
}

function copyDirectory(
  pkgDir: string,
  destDir: string,
  dir: string,
): Effect.Effect<void, Error> {
  return Effect.try({
    try: () => {
      cpSync(join(pkgDir, dir), join(destDir, dir), { recursive: true });
    },
    catch: (cause) =>
      new Error(`Failed to copy directory "${dir}": ${formatError(cause)}`),
  });
}

function copySourceAssets(
  pkgDir: string,
  destDir: string,
): Effect.Effect<void, Error> {
  return Effect.try({
    try: () => {
      cpSync(join(pkgDir, 'src'), join(destDir, 'src'), {
        recursive: true,
        filter: (src: string): boolean => {
          if (statSync(src).isDirectory()) {
            return true;
          }

          return !src.endsWith('.ts') || src.endsWith('.d.ts');
        },
      });
    },
    catch: (cause) =>
      new Error(`Failed to copy source assets: ${formatError(cause)}`),
  });
}

const program = Effect.gen(function* () {
  const config = yield* parseArgs(process.argv);

  yield* Effect.forEach(
    config.assets,
    (file) => copyAsset(config.pkgDir, config.destDir, file),
    {
      discard: true,
    },
  );

  yield* Effect.forEach(
    config.dirs,
    (dir) => copyDirectory(config.pkgDir, config.destDir, dir),
    {
      discard: true,
    },
  );

  if (config.copySrc) {
    yield* copySourceAssets(config.pkgDir, config.destDir);
  }
});

await Effect.runPromise(program).catch((error: unknown) => {
  console.error(formatError(error));
  process.exit(1);
});

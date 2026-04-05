/**
 * This is a minimal script to publish your package to "npm".
 * This is meant to be used as-is or customize as you see fit.
 *
 * This script is executed on "dist/path/to/library" as "cwd" by default.
 *
 * You might need to authenticate with NPM before running this script.
 */

import { readCachedProjectGraph } from '@nx/devkit';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { Effect, Schema } from 'effect';

type PublishArgs = Schema.Schema.Type<typeof PublishArgsSchema>;

const PublishArgsSchema = Schema.Struct({
  name: Schema.String,
  version: Schema.String,
  tag: Schema.String,
});

const validVersion = /^\d+\.\d+\.\d+(?:-[\w.-]+\.\d+)?$/;

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatFailure(message: string): string {
  return `\u001b[1m\u001b[31m${message}\u001b[0m`;
}

function fail(message: string): Effect.Effect<never, Error> {
  return Effect.fail(new Error(message));
}

function parseArgs(
  argv: ReadonlyArray<string>,
): Effect.Effect<PublishArgs, Error> {
  return Effect.try({
    try: () =>
      Schema.decodeUnknownSync(PublishArgsSchema)({
        name: argv[2],
        version: argv[3],
        tag: argv[4] ?? 'next',
      }),
    catch: () =>
      new Error(
        'Usage: node path/to/publish.mts <project-name> <version> [tag]',
      ),
  }).pipe(
    Effect.flatMap((args) =>
      validVersion.test(args.version)
        ? Effect.succeed(args)
        : fail(
            `No version provided or version did not match Semantic Versioning, expected: #.#.#-tag.# or #.#.#, got ${args.version}.`,
          ),
    ),
  );
}

function resolveOutputPath(name: string): Effect.Effect<string, Error> {
  return Effect.try({
    try: () => readCachedProjectGraph(),
    catch: () => new Error('Could not read the cached Nx project graph.'),
  }).pipe(
    Effect.flatMap((graph) => {
      const project = graph.nodes[name];
      if (!project) {
        return fail(
          `Could not find project "${name}" in the workspace. Is the project.json configured correctly?`,
        );
      }

      const outputPath = project.data?.targets?.build?.options?.outputPath;
      if (typeof outputPath !== 'string') {
        return fail(
          `Could not find "build.options.outputPath" of project "${name}". Is project.json configured correctly?`,
        );
      }

      return Effect.succeed(outputPath);
    }),
  );
}

function updatePackageVersion(
  outputPath: string,
  version: string,
): Effect.Effect<void, Error> {
  return Effect.try({
    try: () => {
      const packageJsonPath = `${outputPath}/package.json`;
      const json = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as Record<
        string,
        unknown
      >;
      json.version = version;
      writeFileSync(packageJsonPath, JSON.stringify(json, null, 2));
    },
    catch: () =>
      new Error('Error reading package.json file from library build output.'),
  });
}

function publishPackage(
  outputPath: string,
  tag: string,
): Effect.Effect<void, Error> {
  return Effect.try({
    try: () => {
      execFileSync('npm', ['publish', '--access', 'public', '--tag', tag], {
        cwd: outputPath,
        stdio: 'inherit',
      });
    },
    catch: (cause) => new Error(`npm publish failed: ${formatError(cause)}`),
  });
}

const program = Effect.gen(function* () {
  const args = yield* parseArgs(process.argv);
  const outputPath = yield* resolveOutputPath(args.name);

  yield* updatePackageVersion(outputPath, args.version);
  yield* publishPackage(outputPath, args.tag);
});

await Effect.runPromise(program).catch((error: unknown) => {
  console.error(formatFailure(formatError(error)));
  process.exit(1);
});

#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { Console, Effect, Schema } from 'effect';

type ManifestField = 'builders' | 'executors' | 'generators' | 'schematics';

interface PackageValidationConfig {
  packageJsonPath: string;
  manifestFields?: ManifestField[];
  requiredPaths?: string[];
}

class ValidationError extends Error {
  readonly packageName: string;
  readonly errors: ReadonlyArray<string>;

  constructor(packageName: string, errors: ReadonlyArray<string>) {
    super(`Artifact validation failed for ${packageName}`);
    this.name = 'ValidationError';
    this.packageName = packageName;
    this.errors = errors;
  }
}

const ExportTargetSchema = Schema.Union([
  Schema.String,
  Schema.Record(Schema.String, Schema.String),
]);

const PackageJsonSchema = Schema.Struct({
  exports: Schema.optionalKey(Schema.Record(Schema.String, ExportTargetSchema)),
  builders: Schema.optionalKey(Schema.String),
  executors: Schema.optionalKey(Schema.String),
  generators: Schema.optionalKey(Schema.String),
  schematics: Schema.optionalKey(Schema.String),
});

const ManifestEntrySchema = Schema.Struct({
  implementation: Schema.optionalKey(Schema.String),
  factory: Schema.optionalKey(Schema.String),
  schema: Schema.optionalKey(Schema.String),
});

const ManifestValueSchema = Schema.Union([ManifestEntrySchema, Schema.String]);

const ManifestSchema = Schema.Struct({
  builders: Schema.optionalKey(
    Schema.Record(Schema.String, ManifestValueSchema),
  ),
  executors: Schema.optionalKey(
    Schema.Record(Schema.String, ManifestValueSchema),
  ),
  generators: Schema.optionalKey(
    Schema.Record(Schema.String, ManifestValueSchema),
  ),
});

type PackageJson = Schema.Schema.Type<typeof PackageJsonSchema>;
type Manifest = Schema.Schema.Type<typeof ManifestSchema>;
type ManifestEntries =
  | NonNullable<Manifest['executors']>
  | NonNullable<Manifest['builders']>
  | NonNullable<Manifest['generators']>;

const packageConfigs: Record<string, PackageValidationConfig> = {
  'astro-angular': {
    packageJsonPath: 'node_modules/@analogjs/astro-angular/package.json',
    requiredPaths: [
      'node_modules/@analogjs/astro-angular/src/index.js',
      'node_modules/@analogjs/astro-angular/src/client.js',
      'node_modules/@analogjs/astro-angular/src/server.js',
      'node_modules/@analogjs/astro-angular/src/utils.js',
    ],
  },
  platform: {
    packageJsonPath: 'node_modules/@analogjs/platform/package.json',
    manifestFields: ['builders', 'executors', 'generators', 'schematics'],
    requiredPaths: [
      'node_modules/@analogjs/platform/src/lib/nx-plugin',
      'node_modules/@analogjs/platform/src/lib/nx-plugin/src/executors/vite/vite.impl.js',
      'node_modules/@analogjs/platform/src/lib/nx-plugin/src/generators/preset/generator.js',
    ],
  },
  'storybook-angular': {
    packageJsonPath: 'node_modules/@analogjs/storybook-angular/package.json',
    manifestFields: ['builders'],
    requiredPaths: [
      'node_modules/@analogjs/storybook-angular/src/lib/testing.js',
      'node_modules/@analogjs/storybook-angular/src/lib/build-storybook/build-storybook.js',
      'node_modules/@analogjs/storybook-angular/src/lib/start-storybook/start-storybook.js',
    ],
  },
  'vite-plugin-nitro': {
    packageJsonPath: 'node_modules/@analogjs/vite-plugin-nitro/package.json',
    requiredPaths: ['node_modules/@analogjs/vite-plugin-nitro/src/index.js'],
  },
  'vite-plugin-angular': {
    packageJsonPath: 'node_modules/@analogjs/vite-plugin-angular/package.json',
    manifestFields: ['builders'],
    requiredPaths: [
      'node_modules/@analogjs/vite-plugin-angular/src/lib/tools',
      'node_modules/@analogjs/vite-plugin-angular/src/lib/tools/src/builders/vite/vite-build.impl.js',
      'node_modules/@analogjs/vite-plugin-angular/src/lib/tools/src/builders/vite-dev-server/dev-server.impl.js',
    ],
  },
};

const root = resolve(import.meta.dirname, '../..');
const packagesToValidate =
  process.argv.slice(2).length > 0
    ? process.argv.slice(2)
    : Object.keys(packageConfigs);

function toError(cause: unknown, prefix: string): Error {
  const message = cause instanceof Error ? cause.message : String(cause);
  return new Error(`${prefix}: ${message}`);
}

function readJson<S extends Schema.Top & { readonly DecodingServices: never }>(
  path: string,
  schema: S,
): Effect.Effect<S['Type'], Error> {
  return Effect.try({
    try: () =>
      Schema.decodeUnknownSync(schema)(
        JSON.parse(readFileSync(resolve(root, path), 'utf-8')),
      ),
    catch: (cause) => toError(cause, `Failed to read ${path}`),
  });
}

function ensurePathExists(path: string, errors: string[]): void {
  if (!existsSync(resolve(root, path))) {
    errors.push(`Missing required artifact: ${path}`);
  }
}

function normalizeRuntimePath(
  basePath: string,
  relativePath: string,
  _field: 'implementation' | 'factory',
): string {
  const resolved = resolve(dirname(basePath), relativePath);
  if (
    resolved.endsWith('.js') ||
    resolved.endsWith('.mjs') ||
    resolved.endsWith('.cjs')
  ) {
    return resolved;
  }

  return `${resolved}.js`;
}

function validateManifestReferences(
  manifestPath: string,
  manifestContent: Record<string, unknown>,
  errors: string[],
): void {
  for (const entryValue of Object.values(manifestContent)) {
    if (!entryValue || typeof entryValue !== 'object') {
      continue;
    }

    const config = entryValue as Record<string, unknown>;

    if (typeof config.implementation === 'string') {
      const implementationPath = normalizeRuntimePath(
        resolve(root, manifestPath),
        config.implementation,
        'implementation',
      );

      if (!existsSync(implementationPath)) {
        errors.push(
          `Missing implementation for ${manifestPath}: ${config.implementation}.js`,
        );
      }
    }

    if (typeof config.factory === 'string') {
      const factoryPath = normalizeRuntimePath(
        resolve(root, manifestPath),
        config.factory,
        'factory',
      );

      if (!existsSync(factoryPath)) {
        errors.push(
          `Missing factory for ${manifestPath}: ${config.factory}.js`,
        );
      }
    }

    if (typeof config.schema === 'string') {
      const schemaPath = resolve(
        dirname(resolve(root, manifestPath)),
        config.schema,
      );

      if (!existsSync(schemaPath)) {
        errors.push(`Missing schema for ${manifestPath}: ${config.schema}`);
      }
    }
  }
}

function validateExports(
  packageJsonPath: string,
  packageJson: PackageJson,
  errors: string[],
): void {
  const exportsField = packageJson.exports;
  if (!exportsField) {
    return;
  }

  for (const [subpath, target] of Object.entries(exportsField)) {
    const resolvedTargets =
      typeof target === 'string' ? [target] : Object.values(target);

    for (const outputPath of resolvedTargets) {
      const resolvedPath = resolve(
        dirname(resolve(root, packageJsonPath)),
        outputPath,
      );
      if (!existsSync(resolvedPath)) {
        errors.push(`Missing export target for ${subpath}: ${outputPath}`);
      }
    }
  }
}

function validatePackage(packageName: string) {
  return Effect.gen(function* () {
    const config = packageConfigs[packageName];
    if (!config) {
      return yield* Effect.fail(
        new Error(`Unknown package artifact validation target: ${packageName}`),
      );
    }

    const errors: string[] = [];
    const packageJson = yield* readJson(
      config.packageJsonPath,
      PackageJsonSchema,
    );

    validateExports(config.packageJsonPath, packageJson, errors);

    for (const requiredPath of config.requiredPaths ?? []) {
      ensurePathExists(requiredPath, errors);
    }

    for (const manifestField of config.manifestFields ?? []) {
      const manifestRelativePath = packageJson[manifestField];
      if (typeof manifestRelativePath !== 'string') {
        errors.push(
          `Missing ${manifestField} field in ${config.packageJsonPath}`,
        );
        continue;
      }

      const manifestPath = resolve(
        dirname(resolve(root, config.packageJsonPath)),
        manifestRelativePath,
      );
      if (!existsSync(manifestPath)) {
        errors.push(
          `Missing ${manifestField} manifest: ${manifestRelativePath}`,
        );
        continue;
      }

      const manifest = yield* readJson(manifestPath, ManifestSchema);
      const manifestEntries =
        manifest.executors ?? manifest.builders ?? manifest.generators;

      validateManifestReferences(
        manifestPath,
        (manifestEntries ?? {}) as ManifestEntries,
        errors,
      );
    }

    if (errors.length > 0) {
      return yield* Effect.fail(new ValidationError(packageName, errors));
    }

    yield* Console.log(`Artifact validation passed for ${packageName}`);
  });
}

function formatError(error: ValidationError | Error): string {
  if (error instanceof ValidationError) {
    return [
      `Artifact validation failed for ${error.packageName}:`,
      ...error.errors.map((issue) => `- ${issue}`),
    ].join('\n');
  }

  return error.message;
}

const program = Effect.forEach(packagesToValidate, validatePackage, {
  discard: true,
});

await Effect.runPromise(program).catch((error: unknown) => {
  console.error(`\n${formatError(error as ValidationError | Error)}`);
  process.exit(1);
});

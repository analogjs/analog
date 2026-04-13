#!/usr/bin/env node

/**
 * Post-build artifact verification for all publishable packages.
 *
 * Runs after each package build to catch packaging mistakes before they reach
 * npm. For every configured package the script:
 *   - Resolves any remaining `catalog:` protocol references in the dist
 *     package.json and writes the resolved version back, so `npm publish`
 *     never ships unresolvable specifiers.
 *   - Walks the `exports` map and confirms every declared file exists on disk.
 *   - Checks that Nx manifest fields (builders, executors, generators,
 *     schematics) point to real JSON manifests and that each manifest entry's
 *     implementation, factory, and schema files are present.
 *   - Validates a set of package-specific required paths (e.g. migration JSON,
 *     FESM bundles, builder JS files).
 *
 * Usage:
 *   node tools/scripts/verify-package-artifacts.mts [package-name...]
 *
 * When no package names are provided, all configured packages are validated.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { Console, Effect, Schema } from 'effect';
import {
  resolveCatalogReferences,
  hasUnresolvedCatalogReferences,
} from '../build/resolve-catalogs.ts';

type ManifestField = 'builders' | 'executors' | 'generators' | 'schematics';

interface PackageValidationConfig {
  packageJsonPath: string;
  manifestFields?: ManifestField[];
  requiredPaths?: string[];
}

class ValidationError extends Error {
  packageName;
  errors;

  constructor(packageName: string, errors: string[]) {
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
  schematics: Schema.optionalKey(
    Schema.Record(Schema.String, ManifestValueSchema),
  ),
});

type PackageJson = Record<string, any>;
type Manifest = Record<string, any>;
type ManifestEntries = Record<string, any>;

const packageConfigs: Record<string, PackageValidationConfig> = {
  'angular-compiler': {
    packageJsonPath: 'packages/angular-compiler/dist/package.json',
    requiredPaths: ['packages/angular-compiler/dist/src/index.js'],
  },
  'astro-angular': {
    packageJsonPath: 'packages/astro-angular/dist/package.json',
    requiredPaths: [
      'packages/astro-angular/dist/src/index.js',
      'packages/astro-angular/dist/src/client.js',
      'packages/astro-angular/dist/src/middleware.js',
      'packages/astro-angular/dist/src/server.js',
      'packages/astro-angular/dist/src/utils.js',
    ],
  },
  content: {
    packageJsonPath: 'packages/content/dist/package.json',
    requiredPaths: [
      'packages/content/dist/fesm2022/analogjs-content.mjs',
      'packages/content/dist/plugin/migrations.json',
      'packages/content/dist/plugin/src/index.js',
    ],
  },
  'create-analog': {
    packageJsonPath: 'dist/packages/create-analog/package.json',
    requiredPaths: ['dist/packages/create-analog/index.js'],
  },
  platform: {
    packageJsonPath: 'packages/platform/dist/package.json',
    manifestFields: ['builders', 'executors', 'generators', 'schematics'],
    requiredPaths: [
      'packages/platform/dist/src/lib/nx-plugin',
      'packages/platform/dist/src/lib/nx-plugin/src/executors/vite/vite.impl.js',
      'packages/platform/dist/src/lib/nx-plugin/src/generators/preset/generator.js',
    ],
  },
  router: {
    packageJsonPath: 'packages/router/dist/package.json',
    requiredPaths: [
      'packages/router/dist/fesm2022/analogjs-router.mjs',
      'packages/router/dist/migrations/migration.json',
    ],
  },
  'storybook-angular': {
    packageJsonPath: 'packages/storybook-angular/dist/package.json',
    manifestFields: ['builders'],
    requiredPaths: [
      'packages/storybook-angular/dist/src/lib/testing.js',
      'packages/storybook-angular/dist/src/lib/build-storybook/build-storybook.js',
      'packages/storybook-angular/dist/src/lib/start-storybook/start-storybook.js',
    ],
  },
  'vite-plugin-nitro': {
    packageJsonPath: 'packages/vite-plugin-nitro/dist/package.json',
    requiredPaths: ['packages/vite-plugin-nitro/dist/src/index.js'],
  },
  'vite-plugin-angular': {
    packageJsonPath: 'packages/vite-plugin-angular/dist/package.json',
    manifestFields: ['builders'],
    requiredPaths: [
      'packages/vite-plugin-angular/dist/src/lib/tools',
      'packages/vite-plugin-angular/dist/src/lib/tools/src/builders/vite/vite-build.impl.js',
      'packages/vite-plugin-angular/dist/src/lib/tools/src/builders/vite-dev-server/dev-server.impl.js',
    ],
  },
  'vitest-angular': {
    packageJsonPath: 'packages/vitest-angular/dist/package.json',
    manifestFields: ['builders', 'schematics'],
    requiredPaths: [
      'packages/vitest-angular/dist/src/index.js',
      'packages/vitest-angular/dist/src/lib/tools',
      'packages/vitest-angular/dist/src/lib/builders/test/vitest.impl.js',
      'packages/vitest-angular/dist/src/lib/builders/build/vitest.impl.js',
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

function readJson(path: string, schema: any): Effect.Effect<any, Error> {
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
  const hashIndex = relativePath.indexOf('#');
  const filePath =
    hashIndex >= 0 ? relativePath.slice(0, hashIndex) : relativePath;
  const resolved = resolve(dirname(basePath), filePath);
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
      typeof target === 'string'
        ? [target]
        : Object.values(target as Record<string, string>);

    for (const outputPath of resolvedTargets) {
      const resolvedPath = resolve(
        dirname(resolve(root, packageJsonPath)),
        String(outputPath),
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
    const packageJsonPath = resolve(root, config.packageJsonPath);

    // Resolve any catalog: protocol references in the dist package.json
    yield* Effect.try({
      try: () => {
        const raw = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
        const resolved = resolveCatalogReferences(raw, root);
        const unresolved = hasUnresolvedCatalogReferences(resolved);
        if (unresolved.length > 0) {
          for (const entry of unresolved) {
            errors.push(`Unresolved catalog reference: ${entry}`);
          }
        }

        // Write back the resolved package.json so downstream pack/publish
        // steps never encounter catalog: protocols
        writeFileSync(
          packageJsonPath,
          JSON.stringify(resolved, null, 2) + '\n',
        );
      },
      catch: (cause) =>
        toError(
          cause,
          `Failed to resolve catalog references in ${config.packageJsonPath}`,
        ),
    });

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
        manifest.executors ??
        manifest.builders ??
        manifest.generators ??
        manifest.schematics;

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

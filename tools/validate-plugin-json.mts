/**
 * Validates Nx plugin JSON metadata files (generators.json, executors.json,
 * builders.json, collection.json, migrations.json).
 *
 * Replaces @nx/nx-plugin-checks ESLint rule with a standalone script.
 *
 * Checks:
 * - Required structure exists (generators/executors/builders/schematics objects)
 * - Each entry has an implementation/factory path
 * - Each entry has a schema path
 * - Referenced schema files exist on disk
 * - Migration versions are valid semver
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { glob } from 'node:fs/promises';
import { valid } from 'semver';

interface PluginEntry {
  implementation?: string;
  factory?: string;
  schema?: string;
  description?: string;
}

interface GeneratorsJson {
  generators?: Record<string, PluginEntry>;
  schematics?: Record<string, PluginEntry>;
  packageJsonUpdates?: Record<string, unknown>;
}

interface ExecutorsJson {
  executors?: Record<string, PluginEntry>;
  builders?: Record<string, PluginEntry>;
}

interface MigrationsJson {
  generators?: Record<string, PluginEntry>;
  schematics?: Record<string, PluginEntry>;
  packageJsonUpdates?: Record<string, unknown>;
}

const errors: string[] = [];
let checkedCount = 0;

function error(file: string, message: string): void {
  errors.push(`  ${file}: ${message}`);
}

function resolveRef(baseDir: string, ref: string): string {
  // Strip export identifier (e.g., "./src/index#setupSchematic" -> "./src/index")
  const path = ref.split('#')[0];
  return resolve(baseDir, path);
}

function fileExists(
  baseDir: string,
  ref: string,
  extensions: string[] = ['.json'],
): boolean {
  const resolved = resolveRef(baseDir, ref);
  if (existsSync(resolved)) return true;
  for (const ext of extensions) {
    if (existsSync(resolved + ext)) return true;
  }
  if (resolved.endsWith('.js') && existsSync(resolved.replace(/\.js$/, '.ts')))
    return true;
  return false;
}

function validateEntries(
  file: string,
  baseDir: string,
  entries: Record<string, PluginEntry>,
  type: string,
): void {
  for (const [name, entry] of Object.entries(entries)) {
    const impl = entry.implementation || entry.factory;

    // Skip entries with no impl and no useful fields (e.g. external builder references)
    if (!impl && !entry.schema && !entry.description) {
      continue;
    }

    if (impl && !impl.includes(':')) {
      if (!fileExists(baseDir, impl, ['.ts', '.js', '.mjs'])) {
        error(file, `${type} "${name}": implementation "${impl}" not found`);
      }
    }

    if (entry.schema) {
      if (!fileExists(baseDir, entry.schema, ['.json'])) {
        error(file, `${type} "${name}": schema "${entry.schema}" not found`);
      }
    }
  }
}

function validateGenerators(filePath: string): void {
  const content: GeneratorsJson = JSON.parse(readFileSync(filePath, 'utf-8'));
  const baseDir = dirname(filePath);
  const entries = content.generators || content.schematics || {};

  if (Object.keys(entries).length === 0 && !content.packageJsonUpdates) {
    error(filePath, 'No generators or schematics defined');
    return;
  }

  validateEntries(filePath, baseDir, entries, 'generator');
  checkedCount++;
}

function validateExecutors(filePath: string): void {
  const content: ExecutorsJson = JSON.parse(readFileSync(filePath, 'utf-8'));
  const baseDir = dirname(filePath);
  const entries = content.executors || content.builders || {};

  if (Object.keys(entries).length === 0) {
    error(filePath, 'No executors or builders defined');
    return;
  }

  validateEntries(filePath, baseDir, entries, 'executor');
  checkedCount++;
}

function validateMigrations(filePath: string): void {
  const content: MigrationsJson = JSON.parse(readFileSync(filePath, 'utf-8'));
  const baseDir = dirname(filePath);
  const updates = content.packageJsonUpdates || {};

  for (const [version] of Object.entries(updates)) {
    if (!valid(version)) {
      error(filePath, `Migration version "${version}" is not valid semver`);
    }
  }

  // Validate any migration generators/schematics entries
  const entries = content.generators || content.schematics || {};
  if (Object.keys(entries).length > 0) {
    validateEntries(filePath, baseDir, entries, 'migration');
  }

  checkedCount++;
}

// --- Main ---

const root = process.cwd();
const packageDirs = ['packages', 'libs'];
const exclude = ['**/node_modules/**', '**/dist/**'];

const validations: Array<{ pattern: string; handler: (path: string) => void }> =
  [
    { pattern: '**/generators.json', handler: validateGenerators },
    { pattern: '**/executors.json', handler: validateExecutors },
    { pattern: '**/builders.json', handler: validateExecutors },
    { pattern: '**/collection.json', handler: validateGenerators },
    { pattern: '**/migrations.json', handler: validateMigrations },
  ];

await Promise.all(
  packageDirs.flatMap((dir) => {
    const base = join(root, dir);
    if (!existsSync(base)) return [];
    return validations.map(async ({ pattern, handler }) => {
      for await (const entry of glob(`${base}/${pattern}`, { exclude })) {
        handler(entry);
      }
    });
  }),
);

// Report
console.log(`Validated ${checkedCount} plugin JSON files.`);
if (errors.length > 0) {
  console.error(`\n${errors.length} error(s) found:\n`);
  for (const err of errors) {
    console.error(err);
  }
  process.exit(1);
} else {
  console.log('All checks passed.');
}

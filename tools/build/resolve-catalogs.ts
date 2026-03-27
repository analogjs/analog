/**
 * Resolves pnpm catalog: protocol references in package.json dependency maps.
 *
 * pnpm catalogs (pnpm-workspace.yaml `catalog:` and `catalogs:` sections)
 * let packages share a single version specifier. At publish time, however,
 * npm registries don't understand the `catalog:` protocol — it must be
 * replaced with the concrete version string before the package leaves the
 * workspace. This module handles that replacement by parsing the workspace
 * YAML and substituting every `catalog:` / `catalog:<name>` reference with
 * the resolved version.
 *
 * Used by both the library build pipeline (build-lib.mts) and the artifact
 * verification script (verify-package-artifacts.mts).
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface CatalogMap {
  [packageName: string]: string;
}

interface ParsedCatalogs {
  default: CatalogMap;
  named: Record<string, CatalogMap>;
}

let cached: ParsedCatalogs | undefined;

/**
 * Parses the pnpm-workspace.yaml catalog definitions. Uses a lightweight
 * line-based parser so we don't need a YAML dependency.
 */
function parseCatalogs(workspaceRoot: string): ParsedCatalogs {
  if (cached) {
    return cached;
  }

  const yamlPath = resolve(workspaceRoot, 'pnpm-workspace.yaml');
  const lines = readFileSync(yamlPath, 'utf-8').split('\n');

  const defaultCatalog: CatalogMap = {};
  const namedCatalogs: Record<string, CatalogMap> = {};

  let section: 'none' | 'default' | 'named' = 'none';
  let currentCatalogName = '';

  for (const line of lines) {
    // Skip comments and blank lines
    if (line.trim().startsWith('#') || line.trim() === '') {
      continue;
    }

    // Top-level `catalog:` section (default catalog)
    if (/^catalog:\s*$/.test(line)) {
      section = 'default';
      continue;
    }

    // Top-level `catalogs:` section (named catalogs)
    if (/^catalogs:\s*$/.test(line)) {
      section = 'named';
      currentCatalogName = '';
      continue;
    }

    // Any other top-level key resets the section
    if (/^\S/.test(line)) {
      section = 'none';
      continue;
    }

    if (section === 'default') {
      // Lines like: "  '@angular/core': ^21.0.0"
      const match = line.match(
        /^\s+['"]?([^'":\s][^'":]*?)['"]?\s*:\s*['"]?(.+?)['"]?\s*$/,
      );
      if (match) {
        defaultCatalog[match[1]] = match[2];
      }
      continue;
    }

    if (section === 'named') {
      // Named catalog header: "  peerCompat:" (2-space indent, no value)
      const headerMatch = line.match(/^ {2}(\w[\w-]*):\s*$/);
      if (headerMatch) {
        currentCatalogName = headerMatch[1];
        namedCatalogs[currentCatalogName] = {};
        continue;
      }

      // Named catalog entry: "    '@angular/core': ^16.0.0 || ^17.0.0"
      if (currentCatalogName) {
        const entryMatch = line.match(
          /^\s{4,}['"]?([^'":\s][^'":]*?)['"]?\s*:\s*['"]?(.+?)['"]?\s*$/,
        );
        if (entryMatch) {
          namedCatalogs[currentCatalogName][entryMatch[1]] = entryMatch[2];
        }
      }
    }
  }

  cached = { default: defaultCatalog, named: namedCatalogs };
  return cached;
}

/**
 * Resolves `catalog:` and `catalog:<name>` version specifiers in a dependency
 * map. Returns a new object with resolved versions; unresolvable entries are
 * left as-is (the verify step will catch them).
 */
function resolveDependencyMap(
  deps: Record<string, string>,
  catalogs: ParsedCatalogs,
): Record<string, string> {
  const resolved: Record<string, string> = {};

  for (const [name, version] of Object.entries(deps)) {
    if (version === 'catalog:' || version === 'catalog:default') {
      resolved[name] = catalogs.default[name] ?? version;
    } else if (version.startsWith('catalog:')) {
      const catalogName = version.slice('catalog:'.length);
      resolved[name] = catalogs.named[catalogName]?.[name] ?? version;
    } else {
      resolved[name] = version;
    }
  }

  return resolved;
}

const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
] as const;

/**
 * Resolves all `catalog:` protocol references in a package.json object.
 * Returns a new object with real version specifiers.
 */
export function resolveCatalogReferences(
  pkg: Record<string, unknown>,
  workspaceRoot: string,
): Record<string, unknown> {
  const catalogs = parseCatalogs(workspaceRoot);
  const result = { ...pkg };

  for (const field of DEPENDENCY_FIELDS) {
    const deps = result[field];
    if (deps && typeof deps === 'object' && !Array.isArray(deps)) {
      result[field] = resolveDependencyMap(
        deps as Record<string, string>,
        catalogs,
      );
    }
  }

  return result;
}

/**
 * Returns true if any dependency field in the package.json object contains
 * unresolved `catalog:` protocol references.
 */
export function hasUnresolvedCatalogReferences(
  pkg: Record<string, unknown>,
): string[] {
  const unresolved: string[] = [];

  for (const field of DEPENDENCY_FIELDS) {
    const deps = pkg[field];
    if (!deps || typeof deps !== 'object' || Array.isArray(deps)) {
      continue;
    }

    for (const [name, version] of Object.entries(
      deps as Record<string, string>,
    )) {
      if (typeof version === 'string' && version.startsWith('catalog:')) {
        unresolved.push(`${field}.${name}: ${version}`);
      }
    }
  }

  return unresolved;
}

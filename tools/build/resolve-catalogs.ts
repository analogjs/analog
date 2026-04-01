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
 * Also resolves `workspace:` protocol references (`workspace:*`, `workspace:^`,
 * `workspace:~`) by reading the target package's version from the workspace.
 * pnpm normally resolves these during `pnpm publish`, but the smoke test
 * pipeline uses `npm pack` which does not understand the workspace protocol.
 *
 * Used by both the library build pipeline (build-lib.mts) and the artifact
 * verification script (verify-package-artifacts.mts).
 */

import { existsSync, globSync, readFileSync } from 'node:fs';
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

let workspaceVersions: Map<string, string> | undefined;

/**
 * Builds a name→version map of all workspace packages by reading the
 * `packages:` globs from pnpm-workspace.yaml and scanning the matching
 * directories for package.json files.
 */
function buildWorkspacePackageMap(workspaceRoot: string): Map<string, string> {
  if (workspaceVersions) {
    return workspaceVersions;
  }

  const yamlPath = resolve(workspaceRoot, 'pnpm-workspace.yaml');
  const lines = readFileSync(yamlPath, 'utf-8').split('\n');

  // Parse the `packages:` section to get workspace globs.
  const globs: string[] = [];
  let inPackages = false;
  for (const line of lines) {
    if (line.trim().startsWith('#') || line.trim() === '') continue;
    if (/^packages:\s*$/.test(line)) {
      inPackages = true;
      continue;
    }
    if (/^\S/.test(line)) {
      inPackages = false;
      continue;
    }
    if (inPackages) {
      const match = line.match(/^\s+-\s+['"]?(.+?)['"]?\s*$/);
      if (match) {
        globs.push(match[1]);
      }
    }
  }

  const map = new Map<string, string>();
  for (const pattern of globs) {
    const pkgJsonPattern = `${pattern}/package.json`;
    for (const match of globSync(pkgJsonPattern, { cwd: workspaceRoot })) {
      const fullPath = resolve(workspaceRoot, match);
      try {
        const pkg = JSON.parse(readFileSync(fullPath, 'utf-8')) as {
          name?: string;
          version?: string;
        };
        if (pkg.name && pkg.version) {
          map.set(pkg.name, pkg.version);
        }
      } catch {
        // skip unreadable package.json files
      }
    }
  }

  workspaceVersions = map;
  return map;
}

/**
 * Looks up a workspace package's version from the workspace package map.
 * Returns undefined if the package is not found.
 */
function resolveWorkspacePackageVersion(
  packageName: string,
  workspaceRoot: string,
): string | undefined {
  return buildWorkspacePackageMap(workspaceRoot).get(packageName);
}

/**
 * Resolves `catalog:`, `catalog:<name>`, and `workspace:` version specifiers
 * in a dependency map. Returns a new object with resolved versions;
 * unresolvable entries are left as-is (the verify step will catch them).
 */
function resolveDependencyMap(
  deps: Record<string, string>,
  catalogs: ParsedCatalogs,
  workspaceRoot: string,
): Record<string, string> {
  const resolved: Record<string, string> = {};

  for (const [name, version] of Object.entries(deps)) {
    if (version === 'catalog:' || version === 'catalog:default') {
      resolved[name] = catalogs.default[name] ?? version;
    } else if (version.startsWith('catalog:')) {
      const catalogName = version.slice('catalog:'.length);
      resolved[name] = catalogs.named[catalogName]?.[name] ?? version;
    } else if (version.startsWith('workspace:')) {
      // Resolve workspace: protocol the same way pnpm does at publish time:
      //   workspace:*  → exact version  (e.g. "3.0.0-alpha.18")
      //   workspace:^  → caret range    (e.g. "^3.0.0-alpha.18")
      //   workspace:~  → tilde range    (e.g. "~3.0.0-alpha.18")
      //   workspace:^1.0.0 → "^1.0.0"  (pass-through semver range)
      const specifier = version.slice('workspace:'.length);
      const targetVersion = resolveWorkspacePackageVersion(name, workspaceRoot);

      if (specifier === '*' && targetVersion) {
        resolved[name] = targetVersion;
      } else if (specifier === '^' && targetVersion) {
        resolved[name] = `^${targetVersion}`;
      } else if (specifier === '~' && targetVersion) {
        resolved[name] = `~${targetVersion}`;
      } else if (targetVersion) {
        // workspace:^1.0.0 or workspace:>=1.0.0 — use the specifier as-is
        resolved[name] = specifier;
      } else {
        resolved[name] = version;
      }
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
        workspaceRoot,
      );
    }
  }

  return result;
}

/**
 * Returns a list of dependency entries that still contain unresolved `catalog:`
 * or `workspace:` protocol references after resolution.
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
      if (
        typeof version === 'string' &&
        (version.startsWith('catalog:') || version.startsWith('workspace:'))
      ) {
        unresolved.push(`${field}.${name}: ${version}`);
      }
    }
  }

  return unresolved;
}

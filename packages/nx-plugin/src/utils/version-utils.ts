import { readJson, Tree } from '@nx/devkit';
import { clean, coerce } from 'semver';

export function getInstalledPackageVersion(
  tree: Tree,
  packageName: string,
  defaultVersion?: string,
  raw = false,
): string | null {
  const pkgJson = readJson(tree, 'package.json');
  const installedPackageVersion =
    (pkgJson.dependencies && pkgJson.dependencies[packageName]) ||
    (pkgJson.devDependencies && pkgJson.devDependencies[packageName]);
  if (!installedPackageVersion && !defaultVersion) {
    return null;
  }

  if (
    !installedPackageVersion ||
    installedPackageVersion === 'latest' ||
    installedPackageVersion === 'next'
  ) {
    const cleaned = clean(defaultVersion ?? '');
    if (cleaned) return cleaned;
    const coerced = coerce(defaultVersion);
    if (coerced) return coerced.version;
    return null;
  }

  const result = raw ? installedPackageVersion : clean(installedPackageVersion);
  if (result) return result;
  const coerced = coerce(installedPackageVersion);
  return coerced ? coerced.version : null;
}

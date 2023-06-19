import { readJson, Tree } from '@nx/devkit';
import { clean, coerce } from 'semver';

export function getInstalledPackageVersion(
  tree: Tree,
  packageName: string,
  defaultVersion?: string,
  raw = false
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
    return clean(defaultVersion) ?? coerce(defaultVersion).version;
  }

  return (
    (raw ? installedPackageVersion : clean(installedPackageVersion)) ??
    coerce(installedPackageVersion).version
  );
}

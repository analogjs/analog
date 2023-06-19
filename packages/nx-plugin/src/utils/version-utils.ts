import { readJson, Tree } from '@nx/devkit';
import { clean, coerce } from 'semver';

export function getInstalledPackageVersion(
  tree: Tree,
  packageName: string,
  defaultVersion?: string
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
    clean(installedPackageVersion) ?? coerce(installedPackageVersion).version
  );
}

export function getRawInstalledPackageVersion(
  tree: Tree,
  packageName: string
): string | null {
  const pkgJson = readJson(tree, 'package.json');
  return (
    (pkgJson.dependencies && pkgJson.dependencies[packageName]) ||
    (pkgJson.devDependencies && pkgJson.devDependencies[packageName])
  );
}

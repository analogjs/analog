import { readJson, Tree } from '@nrwl/devkit';
import { clean, coerce } from 'semver';

export function getInstalledAngularVersion(
  tree: Tree,
  defaultVersion: string
): string {
  const pkgJson = readJson(tree, 'package.json');
  const installedAngularVersion =
    pkgJson.dependencies && pkgJson.dependencies['@angular/core'];
  if (
    !installedAngularVersion ||
    installedAngularVersion === 'latest' ||
    installedAngularVersion === 'next'
  ) {
    return clean(defaultVersion) ?? coerce(defaultVersion).version;
  }

  return (
    clean(installedAngularVersion) ?? coerce(installedAngularVersion).version
  );
}

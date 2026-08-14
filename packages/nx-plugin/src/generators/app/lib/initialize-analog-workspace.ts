import { addDependenciesToPackageJson, stripIndents, Tree } from '@nx/devkit';
import { getInstalledPackageVersion } from '../../../utils/version-utils';
import { NormalizedOptions } from '../generator';
import { belowMinimumSupportedAngularVersion } from '../versions/minimum-supported-versions';
import { getNxDependencies } from '../versions/nx-dependencies';

export async function initializeAngularWorkspace(
  tree: Tree,
  installedNxVersion: string,
  normalizedOptions: NormalizedOptions,
): Promise<string> {
  let angularVersion = getInstalledPackageVersion(tree, '@angular/core');

  if (!angularVersion) {
    console.log(
      'Angular has not been installed yet. Creating an Angular application',
    );

    angularVersion = await initWithNxNamespace(
      tree,
      installedNxVersion,
      normalizedOptions.skipFormat,
    );
  }

  if (!angularVersion) {
    throw new Error('Could not determine installed Angular version.');
  }

  if (belowMinimumSupportedAngularVersion(angularVersion)) {
    throw new Error(stripIndents`Analog only supports Angular v17 and higher`);
  }

  return angularVersion;
}

const initWithNxNamespace = async (
  tree: Tree,
  installedNxVersion: string,
  skipFormat = true,
) => {
  const versions = getNxDependencies(installedNxVersion);

  addDependenciesToPackageJson(
    tree,
    {
      '@angular/animations': '^21.0.0',
      '@angular/common': '^21.0.0',
      '@angular/compiler': '^21.0.0',
      '@angular/core': '^21.0.0',
      '@angular/forms': '^21.0.0',
      '@angular/platform-browser': '^21.0.0',
      '@angular/platform-browser-dynamic': '^21.0.0',
      '@angular/platform-server': '^21.0.0',
      '@angular/router': '^21.0.0',
      rxjs: '~7.8.0',
      tslib: '^2.4.0',
    },
    {
      '@angular-devkit/build-angular': '^21.0.0',
      '@angular/compiler-cli': '^21.0.0',
      '@nx/angular': versions['@nx/angular'],
      '@nx/devkit': versions['@nx/devkit'],
      '@nx/eslint': versions['@nx/eslint'],
      typescript: '~5.9.0',
    },
  );

  return getInstalledPackageVersion(tree, '@angular/core', undefined, true);
};

import { major } from 'semver';
import {
  addDependenciesToPackageJson,
  ensurePackage,
  stripIndents,
  Tree,
} from '@nx/devkit';
import { getInstalledPackageVersion } from '../../../utils/version-utils';
import { NormalizedOptions } from '../generator';
import { belowMinimumSupportedAngularVersion } from '../versions/minimum-supported-versions';
import {
  getNrwlDependencies,
  getNxDependencies,
} from '../versions/nx-dependencies';

export async function initializeAngularWorkspace(
  tree: Tree,
  installedNxVersion: string,
  normalizedOptions: NormalizedOptions
) {
  let angularVersion = getInstalledPackageVersion(tree, '@angular/core');

  if (!angularVersion) {
    console.log(
      'Angular has not been installed yet. Creating an Angular application'
    );

    if (major(installedNxVersion) === 16) {
      angularVersion = await initWithNxNamespace(
        tree,
        installedNxVersion,
        normalizedOptions.skipFormat
      );
    } else {
      angularVersion = await initWithNrwlNamespace(
        tree,
        installedNxVersion,
        normalizedOptions.skipFormat
      );
    }
  }

  if (belowMinimumSupportedAngularVersion(angularVersion)) {
    throw new Error(
      stripIndents`Analog only supports an Angular version of 15 and higher`
    );
  }

  return angularVersion;
}

const initWithNxNamespace = async (
  tree: Tree,
  installedNxVersion: string,
  skipFormat = true
) => {
  const versions = getNxDependencies(installedNxVersion);
  try {
    ensurePackage('@nx/devkit', versions['@nx/devkit']);
    ensurePackage('@nx/angular', versions['@nx/angular']);
    ensurePackage('@nx/linter', versions['@nx/linter']);
  } catch {
    // @nx/angular cannot be required so this fails but this will still allow executing the nx angular init later on
  }
  addDependenciesToPackageJson(
    tree,
    {},
    {
      '@nx/devkit': versions['@nx/devkit'],
      '@nx/angular': versions['@nx/angular'],
      '@nx/linter': versions['@nx/linter'],
    }
  );

  await (
    await import(
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      '@nx/angular/generators'
    )
  ).angularInitGenerator(tree, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    unitTestRunner: 'none' as any,
    skipInstall: true,
    skipFormat: skipFormat,
  });
  return getInstalledPackageVersion(tree, '@angular/core', null, true);
};

const initWithNrwlNamespace = async (
  tree: Tree,
  installedNxVersion: string,
  skipFormat = true
) => {
  const versions = getNrwlDependencies(installedNxVersion);
  try {
    ensurePackage('@nrwl/devkit', versions['@nrwl/devkit']);
    ensurePackage('@nrwl/angular', versions['@nrwl/angular']);
    ensurePackage('@nrwl/linter', versions['@nrwl/linter']);
  } catch {
    // @nx/angular cannot be required so this fails but this will still allow executing the nx angular init later on
  }
  addDependenciesToPackageJson(
    tree,
    {},
    {
      '@nrwl/devkit': versions['@nrwl/devkit'],
      '@nrwl/angular': versions['@nrwl/angular'],
      '@nrwl/linter': versions['@nrwl/linter'],
    }
  );
  await (
    await import(
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      '@nrwl/angular/generators'
    )
  ).angularInitGenerator(tree, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    unitTestRunner: 'none' as any,
    skipInstall: true,
    skipFormat: skipFormat,
  });
  return getInstalledPackageVersion(tree, '@angular/core', null, true);
};

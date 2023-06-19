import { major } from 'semver';
import {
  addDependenciesToPackageJson,
  ensurePackage,
  stripIndents,
  Tree,
} from '@nx/devkit';
import { getInstalledPackageVersion } from '../../../utils/version-utils';
import { NormalizedOptions } from '../generator';
import { hasMinimumSupportedAngularVersion } from '../versions/minimum-supported-angular-version';
import {
  getNrwlDependencies,
  getNxDependencies,
} from '../versions/nx-dependencies';
import { readPackageJson } from 'nx/src/project-graph/file-utils';

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

  if (hasMinimumSupportedAngularVersion(angularVersion)) {
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
  } catch {
    // @nx/angular cannot be required so this fails but this will still allow executing the nx angular init later on
  }
  addDependenciesToPackageJson(
    tree,
    {},
    {
      '@nx/devkit': versions['@nx/devkit'],
      '@nx/angular': versions['@nx/angular'],
    }
  );

  await (
    await import(
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      '@nx/angular/generators'
    )
  ).angularInitGenerator(tree, {
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
  } catch {
    // @nx/angular cannot be required so this fails but this will still allow executing the nx angular init later on
  }
  addDependenciesToPackageJson(
    tree,
    {},
    {
      '@nrwl/devkit': versions['@nrwl/devkit'],
      '@nrwl/angular': versions['@nrwl/angular'],
    }
  );
  await (
    await import(
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      '@nrwl/angular/generators'
    )
  ).angularInitGenerator(tree, {
    unitTestRunner: 'none' as any,
    skipInstall: true,
    skipFormat: skipFormat,
  });
  return getInstalledPackageVersion(tree, '@angular/core', null, true);
};
